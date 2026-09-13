import { TurboModuleRegistry } from 'react-native';
import type { Spec as CosNative } from 'react-native-cos-sdk-nobeacon/lib/typescript/NativeQCloudCosReactNative';
import type {
  CosXmlClientError,
  CosXmlServiceError,
} from 'react-native-cos-sdk-nobeacon/lib/typescript/data_model/errors';
import NativeRuntime from '../Native/NativeXmaxRuntime';

/** Only the callback entry points of a transfer manager owned by XmaxSDK. */
interface CosCallbacks {
  runResultSuccessCallBack(key: string, headers?: object): void;

  runResultFailCallBack(
    key: string,
    client?: CosXmlClientError,
    service?: CosXmlServiceError,
  ): void;

  runProgressCallBack(key: string, complete: number, total: number): void;
}

/** Keeps the vendor's broken root declaration out of the SDK's type graph. */
interface CosRegistration {
  registerTransferManger(
    key: string,
    configuration: object,
    policy: object,
  ): Promise<CosCallbacks>;
}

/** The static import name is preserved for Metro; only the used API is exposed internally. */
const Cos: CosRegistration = require('react-native-cos-sdk-nobeacon').default;

interface UploadParameters {
  signal: AbortSignal;
  region: string;
  sessionCredentials: object;
  customHeaders: object;
  progressCallback(complete: number, total: number): void;
  resultListener: {
    successCallBack(headers?: object): void;
    failCallBack(
      client?: CosXmlClientError,
      service?: CosXmlServiceError,
    ): void;
  };
}

/** Cancels the native task and releases its JS callbacks. */
export interface CosUploadTask {
  cancel(): Promise<void>;
}

/**
 * Owns callback routing for SDK uploads while retaining the official native COS
 * transport and its global event emitter. No vendor prototype or file is changed.
 */
export class CosUploadAdapter {
  private readonly pending = new Map<
    string,
    { parameters: UploadParameters; cleanup(): void }
  >();

  private constructor(
    private readonly key: string,
    manager: CosCallbacks,
    private readonly native: CosNative,
  ) {
    manager.runResultSuccessCallBack = (id, headers) => {
      const task = this.pending.get(id);
      task?.cleanup();
      task?.parameters.resultListener.successCallBack(headers);
    };
    manager.runResultFailCallBack = (id, client, service) => {
      const task = this.pending.get(id);
      task?.cleanup();
      task?.parameters.resultListener.failCallBack(client, service);
    };
    manager.runProgressCallBack = (id, complete, total) => {
      this.pending.get(id)?.parameters.progressCallback(complete, total);
    };
  }

  /** Uses a unique manager key so other SDK copies and host COS clients stay isolated. */
  static async register(
    configuration: object,
    policy: object,
  ): Promise<CosUploadAdapter> {
    const key = `xmax:simple:${NativeRuntime.randomUUID()}`;
    const manager = await Cos.registerTransferManger(
      key,
      configuration,
      policy,
    );
    return new CosUploadAdapter(
      key,
      manager,
      TurboModuleRegistry.getEnforcing<CosNative>('QCloudCosReactNative'),
    );
  }

  /** Drops callback references on completion, rejection or abort, including before a task ID arrives. */
  async upload(
    bucket: string,
    objectKey: string,
    fileURL: string,
    parameters: UploadParameters,
  ): Promise<CosUploadTask> {
    const id = NativeRuntime.randomUUID();
    const cleanup = () => {
      this.pending.delete(id);
      parameters.signal.removeEventListener('abort', cleanup);
    };
    if (parameters.signal.aborted) throw new Error('Upload cancelled');
    this.pending.set(id, { parameters, cleanup });
    parameters.signal.addEventListener('abort', cleanup);

    try {
      const taskID = await this.native.upload(
        this.key,
        bucket,
        objectKey,
        fileURL,
        null,
        id,
        null,
        id,
        null,
        null,
        null,
        parameters.region,
        parameters.sessionCredentials,
        parameters.customHeaders,
        null,
      );
      return {
        cancel: async () => {
          cleanup();
          await this.native.cancel(this.key, taskID);
        },
      };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
}
