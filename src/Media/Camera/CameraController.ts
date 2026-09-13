import type { RtcManager } from '../../Foundation/RTC/RtcManager';
import { ensureActive, abortable } from '../../Foundation/Runtime/Async';
import { invalid } from '../../Foundation/Errors/XmaxError';
import { MediaService } from '../../Service/Media/MediaService';
import {
  RenderController,
  refreshBinding,
} from '../../Render/RenderController';
import {
  CameraPosition,
  realtimeModelSpecifications,
  type CameraStreamOptions,
  type RealtimeMediaStream,
  type RealtimeModel,
} from '../../Service/Realtime/RealtimeTypes';
import {
  resolveBitrates,
  validateVideoFormat,
} from '../../Stream/Encoding/EncodingController';

/**
 * Owns local camera capture and updates the existing track when the camera
 * switches.
 */
export class CameraController {
  stream: RealtimeMediaStream | null = null;
  useMicrophone = false;
  private readonly media: MediaService;

  constructor(
    private readonly rtc: RtcManager,
    private readonly render: RenderController,
    model: RealtimeModel,
  ) {
    this.media = new MediaService(model);
  }

  async create(
    options: CameraStreamOptions,
    signal: AbortSignal,
  ): Promise<RealtimeMediaStream> {
    if (this.stream)
      throw invalid(
        'Stop the current local camera stream before creating a new one',
      );

    const requested =
      options.videoFormat ??
      realtimeModelSpecifications[this.media.model].defaultCameraVideoFormat;
    const position = options.position ?? CameraPosition.front;

    validateVideoFormat(requested);
    const format = Object.freeze({
      ...requested,
      ...this.media.resolveModelInputSize(requested),
    });
    const bitrates = resolveBitrates(format);

    if (!Object.values(CameraPosition).includes(position))
      throw invalid('Invalid camera position');

    await abortable(
      this.rtc.permissions(options.useMicrophone ?? false),
      signal,
    );
    ensureActive(signal);

    try {
      await this.rtc.open(signal);
      ensureActive(signal);

      await this.rtc.configureEncoding(
        format,
        bitrates.minimum,
        bitrates.maximum,
      );
      ensureActive(signal);
      await this.rtc.startCamera(format, position, signal);
      ensureActive(signal);
      this.useMicrophone = options.useMicrophone ?? false;
      this.stream = this.render.create(true, format, position);

      return this.stream;
    } catch (error) {
      await this.rtc.close();
      throw error;
    }
  }

  async switch(signal: AbortSignal): Promise<RealtimeMediaStream> {
    if (!this.stream) throw invalid('Create a local camera stream first');

    const binding = this.render.requireLocal(this.stream);
    const position =
      binding.position === CameraPosition.front
        ? CameraPosition.back
        : CameraPosition.front;

    await this.rtc.switchCamera(position);
    ensureActive(signal);
    binding.position = position;
    refreshBinding(binding);

    return this.stream;
  }

  async close(): Promise<void> {
    this.stream = null;
    this.useMicrophone = false;
    this.render.invalidate(true);
    await this.rtc.close();
  }
}
