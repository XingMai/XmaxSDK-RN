import { ImageManager } from '../../Foundation/Media/ImageManager';
import type { RtcManager } from '../../Foundation/RTC/RtcManager';
import { ensureActive } from '../../Foundation/Runtime/Async';
import { invalid } from '../../Foundation/Errors/XmaxError';
import type { RenderController } from '../../Render/RenderController';
import { MediaService } from '../../Service/Media/MediaService';
import type {
  ImageStreamOptions,
  RealtimeMediaStream,
  RealtimeModel,
} from '../../Service/Realtime/RealtimeTypes';
import {
  resolveBitrates,
  validateVideoFormat,
} from '../../Stream/Encoding/EncodingController';

/**
 * Owns a prepared image and its static RTC source. The original file belongs
 * to the caller. Late preparation results are removed after cancellation.
 */
export class ImageController {
  stream: RealtimeMediaStream | null = null;
  private fileURL: string | null = null;
  private readonly media: MediaService;

  constructor(
    private readonly rtc: RtcManager,
    private readonly render: RenderController,
    model: RealtimeModel,
    private readonly images = new ImageManager(),
  ) {
    this.media = new MediaService(model);
  }

  async create(
    options: ImageStreamOptions,
    signal: AbortSignal,
  ): Promise<RealtimeMediaStream> {
    if (this.stream) throw invalid('Stop the current local image stream first');
    if (!options) throw invalid('Image stream options are required');

    let prepared: string | null = null;

    try {
      const size = await this.images.size(options.fileURL);

      ensureActive(signal);

      const requested = options.videoFormat;
      const format = {
        ...this.media.resolveModelInputSize(requested ?? size),
        fps: requested?.fps ?? 24,
      };

      validateVideoFormat(format);
      this.rtc.logger.business('Image input dimensions', {
        sourceWidth: size.width,
        sourceHeight: size.height,
        preparedWidth: format.width,
        preparedHeight: format.height,
        fps: format.fps,
      });
      prepared = await this.images.prepare(options.fileURL, format);
      ensureActive(signal);
      await this.rtc.open(signal);
      ensureActive(signal);

      const bitrates = resolveBitrates(format);

      this.rtc.configureImageSource(format);
      await this.rtc.configureEncoding(
        format,
        bitrates.minimum,
        bitrates.maximum,
      );
      ensureActive(signal);
      // RN's URL.pathname only parses HTTP URLs; native preparation returns a file URL.
      await this.rtc.startImage(
        decodeURIComponent(prepared.slice('file://'.length)),
        format,
      );
      ensureActive(signal);
      this.stream = this.render.create(true, format, null, null, prepared);
      this.fileURL = prepared;

      return this.stream;
    } catch (error) {
      try {
        await this.rtc.close();
      } finally {
        if (prepared) await this.images.remove(prepared).catch(() => {});
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    const fileURL = this.fileURL;

    this.fileURL = null;
    this.stream = null;
    this.render.invalidate(true);

    // Detach the vendor's image source before deleting the file it may still read.
    try {
      await this.rtc.close();
    } finally {
      if (fileURL) await this.images.remove(fileURL);
    }
  }
}
