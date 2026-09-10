import type { RealtimeReferenceUploadState } from './RealtimeReferenceCatalog';

/**
 * A copied image owned by one reference task, retained for preview and retry.
 */
export interface ReferenceUploadFile {
  readonly fileURL: string;
  readonly contentType: string;
  dispose(): Promise<void>;
}

/**
 * A reference thumbnail update. Only ready entries have a remote URL.
 */
export interface ReferenceUploadUpdate {
  readonly uploadState: RealtimeReferenceUploadState;
  readonly referencePath: string | null;
  readonly iconURL?: string;
}

/**
 * Owns preparation, retries and cancellation for one reference image.
 *
 * A failed upload keeps its copied file for retry. Removal or page exit
 * cancels the current attempt and releases the file after work settles.
 */
export class ReferenceUploadTask {
  private file: ReferenceUploadFile | null = null;
  private running: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private closing: Promise<void> | null = null;
  private closed = false;

  constructor(
    private readonly prepare: () => Promise<ReferenceUploadFile>,
    private readonly upload: (
      file: ReferenceUploadFile,
      signal: AbortSignal,
    ) => Promise<{ url: string }>,
    private readonly onUpdate: (update: ReferenceUploadUpdate) => void,
    private readonly onFailure: (error: unknown) => void,
  ) {}

  /**
   * Starts or retries an upload. Repeated taps share the current attempt.
   */
  start(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.running) return this.running;

    const controller = new AbortController();
    this.controller = controller;
    this.onUpdate({ uploadState: 'uploading', referencePath: null });

    const operation = (async () => {
      try {
        if (!this.file) this.file = await this.prepare();
        if (this.closed || controller.signal.aborted) return;

        this.onUpdate({
          uploadState: 'uploading',
          referencePath: null,
          iconURL: this.file.fileURL,
        });

        const result = await this.upload(this.file, controller.signal);
        if (this.closed || controller.signal.aborted) return;

        this.onUpdate({ uploadState: 'ready', referencePath: result.url });
      } catch (error) {
        if (this.closed || controller.signal.aborted) return;

        this.onUpdate({ uploadState: 'failed', referencePath: null });
        this.onFailure(error);
      }
    })().finally(() => {
      if (this.running === operation) this.running = null;
      if (this.controller === controller) this.controller = null;
    });

    this.running = operation;

    return operation;
  }

  /**
   * Cancels this image only and ignores any late preparation/upload result.
   */
  close(): Promise<void> {
    if (this.closing) return this.closing;

    this.closed = true;
    this.controller?.abort();
    this.closing = (this.running ?? Promise.resolve()).finally(async () => {
      const file = this.file;
      this.file = null;
      await file?.dispose();
    });

    return this.closing;
  }
}
