import { Platform } from 'react-native';
import Cos, {
  type CosTransferManger,
  type TransferTask,
} from 'react-native-cos-sdk-nobeacon';
import Blob from 'react-native-blob-util';
import type {
  StorageManaging,
  StorageConfiguration,
} from '../../Service/Storage/StorageTypes';
import {
  filePath,
  storageEndpoint,
  objectURL,
} from '../../Service/Storage/StorageValidation';
import { invalid, XmaxError, XmaxErrorCode } from '../Errors/XmaxError';
import NativeRuntime from '../Native/NativeXmaxRuntime';

// Pool by endpoint, never by credential. Each request supplies its own STS token.
const transfers = new Map<string, Promise<CosTransferManger>>();

function transfer(config: StorageConfiguration): Promise<CosTransferManger> {
  const endpoint = storageEndpoint(config);
  const key = `xmax:${config.region}:${endpoint.origin}`;
  const existing = transfers.get(key);

  if (existing) return existing;

  const promise = Cos.registerTransferManger(key, {
    region: config.region,
    host: Platform.OS === 'ios' ? endpoint.origin : endpoint.hostname,
    ...(Platform.OS === 'android' && endpoint.port
      ? { port: Number(endpoint.port) }
      : {}),
    isHttps: endpoint.protocol === 'https:',
    connectionTimeout: 30000,
    socketTimeout: 60000,
    isDebuggable: false,
  });

  transfers.set(key, promise);
  promise.catch(() => {
    if (transfers.get(key) === promise) transfers.delete(key);
  });

  return promise;
}

function storageProgress(complete: number, total: number) {
  const completedUnitCount = Math.max(
    0,
    Number.isFinite(complete) ? complete : 0,
  );
  const totalUnitCount = Number.isFinite(total) && total > 0 ? total : null;

  return {
    completedUnitCount,
    totalUnitCount,
    fractionCompleted:
      totalUnitCount === null
        ? null
        : Math.min(1, completedUnitCount / totalUnitCount),
  };
}

function cancelled() {
  return new XmaxError({
    code: XmaxErrorCode.cancelled,
    message: 'Storage operation cancelled',
  });
}

/**
 * Adapts native COS uploads and file downloads to the internal storage
 * boundary.
 *
 * Routes each transfer independently and commits downloads through an atomic
 * file move.
 */
export class StorageManager implements StorageManaging {
  async fileSize(fileURL: string) {
    try {
      const stat = await Blob.fs.stat(filePath(fileURL));

      if (stat.type !== 'file')
        throw invalid('Upload URL must reference an existing file');

      return Number(stat.size);
    } catch (error) {
      if (error instanceof XmaxError) throw error;

      throw invalid('Upload URL must reference an existing file');
    }
  }

  async upload(options: Parameters<StorageManaging['upload']>[0]) {
    const { configuration, signal, progress, objectKey } = options;
    const manager = await transfer(configuration);

    if (signal.aborted) throw cancelled();

    return new Promise<Awaited<ReturnType<StorageManaging['upload']>>>(
      (resolve, reject) => {
        let done = false;
        let task: TransferTask | undefined;
        const finish = (error?: Error, headers?: object) => {
          if (done) return;

          done = true;
          signal.removeEventListener('abort', abort);
          if (error) {
            reject(error);
            return;
          }

          const entries = Object.entries(headers ?? {});
          const header = (name: string) =>
            entries.find(([key]) => key.toLowerCase() === name)?.[1];
          const location = header('location'),
            etag = header('etag');

          try {
            resolve({
              url: objectURL(
                configuration,
                objectKey,
                typeof location === 'string' ? location : undefined,
              ),
              objectKey,
              etag: typeof etag === 'string' ? etag : null,
            });
          } catch (e) {
            reject(e);
          }
        };
        const abort = () => {
          finish(cancelled());
          task?.cancel().catch(() => {});
        };

        signal.addEventListener('abort', abort);
        if (signal.aborted) {
          abort();
          return;
        }

        const now = Math.floor(Date.now() / 1000);

        manager
          .upload(configuration.bucket, objectKey, options.fileURL, {
            region: configuration.region,
            sessionCredentials: {
              tmpSecretId: configuration.credential.accessKeyID,
              tmpSecretKey: configuration.credential.secretAccessKey,
              sessionToken: configuration.credential.sessionToken,
              startTime: now - 60,
              expiredTime: now + 25 * 60,
            },
            customHeaders: { 'Content-Type': options.contentType },
            progressCallback: (complete, total) => {
              if (!done) progress(storageProgress(complete, total));
            },
            resultListener: {
              successCallBack: headers => finish(undefined, headers),
              failCallBack: () =>
                finish(
                  new XmaxError({
                    code: XmaxErrorCode.uploadError,
                    message: 'COS upload failed',
                  }),
                ),
            },
          })
          .then(
            created => {
              task = created;
              if (signal.aborted) created.cancel().catch(() => {});
            },
            () =>
              finish(
                new XmaxError({
                  code: XmaxErrorCode.uploadError,
                  message: 'Unable to start COS upload',
                }),
              ),
          );
      },
    );
  }

  async download(options: Parameters<StorageManaging['download']>[0]) {
    const { signal, progress } = options;
    const destination = filePath(options.destinationURL);
    const temporary = `${destination}.${NativeRuntime.randomUUID()}.partial`;

    if (signal.aborted) throw cancelled();

    const request = Blob.config({ path: temporary, timeout: 60000 }).fetch(
      'GET',
      options.remoteURL,
    );
    const abort = () => {
      request.cancel(() => {});
    };

    signal.addEventListener('abort', abort);
    if (signal.aborted) abort();

    request.progress({ interval: 150 }, (complete, total) => {
      if (!signal.aborted) progress(storageProgress(complete, total));
    });

    try {
      const response = await request;

      if (signal.aborted) throw cancelled();
      if (response.info().status < 200 || response.info().status >= 300)
        throw new XmaxError({
          code: XmaxErrorCode.downloadError,
          message: `Download failed with HTTP ${response.info().status}`,
          httpStatus: response.info().status,
        });

      const byteCount = Number((await Blob.fs.stat(temporary)).size);

      if (signal.aborted) throw cancelled();

      await Blob.fs.mv(temporary, destination);
      progress(storageProgress(byteCount, byteCount));

      return { fileURL: options.destinationURL, byteCount };
    } finally {
      signal.removeEventListener('abort', abort);
      await Blob.fs.unlink(temporary).catch(() => {});
    }
  }
}
