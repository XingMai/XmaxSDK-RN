/**
 * A byte-based transfer progress snapshot. Unknown totals and fractions are
 * null.
 */
export interface StorageProgress {
  /**
   * The number of bytes transferred so far.
   */
  readonly completedUnitCount: number;

  /**
   * The total byte count, or null when the transport has not provided it.
   */
  readonly totalUnitCount: number | null;

  /**
   * The completed fraction between 0 and 1, or null when the total is unknown.
   */
  readonly fractionCompleted: number | null;
}

/**
 * Receives progress for one operation. Callback exceptions do not fail the
 * transfer.
 */
export type XmaxStorageProgressHandler = (progress: StorageProgress) => void;

/**
 * The remote location and object metadata returned by a successful upload.
 */
export interface XmaxUploadedFile {
  /**
   * The remote URL. A safety-checked upload returns the URL supplied by the
   * check.
   */
  readonly url: string;

  /**
   * The object key assigned under the prefix returned by the credential
   * service.
   */
  readonly objectKey: string;

  /**
   * The ETag returned by COS, or null when the response does not include one.
   */
  readonly etag: string | null;
}

/**
 * The local file and byte count returned after a download completes.
 */
export interface XmaxDownloadedFile {
  /**
   * The destination file URL supplied by the caller.
   */
  readonly fileURL: string;

  /**
   * The size of the completed local file in bytes.
   */
  readonly byteCount: number;
}

/**
 * Options for uploading a readable local image or video file.
 */
export interface UploadFileOptions {
  /**
   * An absolute file:// URL. Copy content:// or photo-library assets to a
   * readable file first.
   */
  readonly fileURL: string;

  /**
   * The media MIME type. Inferred from the filename when omitted or null.
   */
  readonly contentType?: string | null;

  /**
   * Receives transfer progress. Reaching 1 does not mean an image safety check
   * has completed.
   */
  readonly progress?: XmaxStorageProgressHandler | null;

  /**
   * Cancels only this upload, including a pending safety check. Optional.
   * This is the RN equivalent of cancelling the calling Swift Task.
   */
  readonly signal?: AbortSignal;
}

/**
 * Options for downloading a remote file into the application sandbox.
 */
export interface DownloadFileOptions {
  /**
   * The HTTP or HTTPS URL to download. Upload credentials are not requested.
   */
  readonly remoteURL: string;

  /**
   * A writable file:// URL. A complete download atomically replaces any
   * existing file.
   */
  readonly destinationURL: string;

  /**
   * Receives byte progress until the operation finishes or is cancelled.
   */
  readonly progress?: XmaxStorageProgressHandler | null;

  /**
   * Cancels only this operation and cleans up its temporary file. Optional.
   */
  readonly signal?: AbortSignal;
}

/**
 * Uploads and downloads image or video files using independent operations.
 *
 * Obtain an instance from XmaxClient.createStorageManager(). Each operation
 * accepts its own progress callback and optional AbortSignal.
 */
export interface XmaxStorageManaging {
  /**
   * Uploads an image using temporary COS credentials without running a safety
   * check.
   */
  uploadImage(options: UploadFileOptions): Promise<XmaxUploadedFile>;

  /**
   * Uploads an image, then requests an explicit safety check.
   *
   * Rejects with UNSAFE_IMAGE if the image is rejected by the service.
   */
  uploadImageWithSafetyCheck(
    options: UploadFileOptions,
  ): Promise<XmaxUploadedFile>;

  /**
   * Uploads a video file using temporary COS credentials. Does not start RTC
   * video input.
   */
  uploadVideo(options: UploadFileOptions): Promise<XmaxUploadedFile>;

  /**
   * Downloads an image and atomically replaces the destination only after
   * success.
   */
  downloadImage(options: DownloadFileOptions): Promise<XmaxDownloadedFile>;

  /**
   * Downloads a video and atomically replaces the destination only after
   * success.
   */
  downloadVideo(options: DownloadFileOptions): Promise<XmaxDownloadedFile>;
}
