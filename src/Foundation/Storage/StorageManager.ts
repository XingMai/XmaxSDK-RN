import { Platform } from 'react-native';
import type {
  CosXmlClientError,
  CosXmlServiceError,
} from 'react-native-cos-sdk-nobeacon/lib/typescript/data_model/errors';
import { CosUploadAdapter, type CosUploadTask } from './CosUploadAdapter';
import Blob from './BlobTransport';
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
const transfers = new Map<string, Promise<CosUploadAdapter>>();

function transfer(config: StorageConfiguration): Promise<CosUploadAdapter> {
  const endpoint = storageEndpoint(config);
  const key = `xmax:simple:${config.region}:${endpoint.origin}`;
  const existing = transfers.get(key);

  if (existing) return existing;

  const promise = CosUploadAdapter.register(
    {
      region: config.region,
      host: Platform.OS === 'ios' ? endpoint.origin : endpoint.hostname,
      ...(Platform.OS === 'android' && endpoint.port
        ? { port: Number(endpoint.port) }
        : {}),
      // iOS derives the scheme from host; its NSNumber isHttps setter is unnecessary.
      ...(Platform.OS === 'android'
        ? { isHttps: endpoint.protocol === 'https:' }
        : {}),
      connectionTimeout: 30000,
      socketTimeout: 60000,
      isDebuggable: false,
    },
    {
      forceSimpleUpload: true,
      // The pinned iOS bridge ignores forceSimpleUpload. Its file-size check
      // must instead select startSimpleUpload / QCloudPutObjectRequest for all
      // supported objects. Do not send this value to Android's 32-bit getInt.
      ...(Platform.OS === 'ios'
        ? { divisionForUpload: Number.MAX_SAFE_INTEGER }
        : {}),
    },
  );

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

/** Preserves diagnostic codes without exposing COS payloads, credentials or signed URLs. */
function uploadError(
  client?: CosXmlClientError,
  service?: CosXmlServiceError,
): XmaxError {
  const status = service?.statusCode;
  const httpStatus =
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 100 &&
    status < 600
      ? status
      : null;
  const serviceCode = service?.errorCode;
  const clientCode = client?.errorCode;
  const details = [
    ...(httpStatus === null ? [] : [`HTTP ${httpStatus}`]),
    ...(typeof serviceCode === 'string' &&
    /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(serviceCode)
      ? [serviceCode]
      : []),
    ...(typeof clientCode === 'number' && Number.isSafeInteger(clientCode)
      ? [`client ${clientCode}`]
      : []),
  ];

  return new XmaxError({
    code: XmaxErrorCode.uploadError,
    message: `COS upload failed${
      details.length ? ` (${details.join(', ')})` : ''
    }`,
    httpStatus,
  });
}

/**
 * Adapts native COS uploads and file downloads to the internal storage
 * boundary.
 *
 * Uses simple PUT for every upload, routes each transfer independently and
 * commits downloads through an atomic file move. COS simple-upload size limits
 * apply; uploads never opt into multipart or resumable transfer.
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
        let task: CosUploadTask | undefined;
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
            signal,
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
              failCallBack: (client, service) =>
                finish(uploadError(client, service)),
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

      await NativeRuntime.replaceFile(temporary, destination);
      progress(storageProgress(byteCount, byteCount));

      return { fileURL: options.destinationURL, byteCount };
    } finally {
      signal.removeEventListener('abort', abort);
      await Blob.fs.unlink(temporary).catch(() => {});
    }
  }
}
