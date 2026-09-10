export interface StorageProgress {
  readonly completedUnitCount: number;
  readonly totalUnitCount: number | null;
  readonly fractionCompleted: number | null;
}
export type XmaxStorageProgressHandler = (progress: StorageProgress) => void;
export interface XmaxUploadedFile {
  readonly url: string;
  readonly objectKey: string;
  readonly etag: string | null;
}
export interface XmaxDownloadedFile {
  readonly fileURL: string;
  readonly byteCount: number;
}
export interface UploadFileOptions {
  readonly fileURL: string;
  readonly contentType?: string | null;
  readonly progress?: XmaxStorageProgressHandler | null;
  /** The RN equivalent of cancelling the calling Swift Task. */
  readonly signal?: AbortSignal;
}
export interface DownloadFileOptions {
  readonly remoteURL: string;
  readonly destinationURL: string;
  readonly progress?: XmaxStorageProgressHandler | null;
  readonly signal?: AbortSignal;
}
export interface XmaxStorageManaging {
  uploadImage(options: UploadFileOptions): Promise<XmaxUploadedFile>;
  uploadImageWithSafetyCheck(
    options: UploadFileOptions,
  ): Promise<XmaxUploadedFile>;
  uploadVideo(options: UploadFileOptions): Promise<XmaxUploadedFile>;
  downloadImage(options: DownloadFileOptions): Promise<XmaxDownloadedFile>;
  downloadVideo(options: DownloadFileOptions): Promise<XmaxDownloadedFile>;
}
