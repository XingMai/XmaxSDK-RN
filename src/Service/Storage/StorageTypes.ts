import type {
  XmaxUploadedFile,
  XmaxDownloadedFile,
  StorageProgress,
} from '../../Core/Storage/XmaxStorageManaging';

/**
 * Validated COS endpoint, prefix and temporary credentials for a single upload.
 */
export interface StorageConfiguration {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint: string;
  readonly prefix: string;
  readonly credential: {
    readonly accessKeyID: string;
    readonly secretAccessKey: string;
    readonly sessionToken: string;
  };
}

/**
 * The internal transport boundary used by StorageService, without exposed
 * vendor objects.
 */
export interface StorageManaging {
  fileSize(fileURL: string): Promise<number>;

  upload(options: {
    fileURL: string;
    objectKey: string;
    contentType: string;
    configuration: StorageConfiguration;
    progress: (value: StorageProgress) => void;
    signal: AbortSignal;
  }): Promise<XmaxUploadedFile>;

  download(options: {
    remoteURL: string;
    destinationURL: string;
    progress: (value: StorageProgress) => void;
    signal: AbortSignal;
  }): Promise<XmaxDownloadedFile>;
}
