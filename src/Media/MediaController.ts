import type { RtcManager } from '../Foundation/RTC/RtcManager';
import { invalid } from '../Foundation/Errors/XmaxError';
import type { RenderController } from '../Render/RenderController';
import type {
  CameraStreamOptions,
  ImageStreamOptions,
  RealtimeMediaStream,
  RealtimeModel,
} from '../Service/Realtime/RealtimeTypes';
import { CameraController } from './Camera/CameraController';
import { ImageController } from './Image/ImageController';

/** Serializes ownership of one local input, including its preparation phase. */
export class MediaController {
  source: 'camera' | 'image' | null = null;
  private readonly camera: CameraController;
  private readonly image: ImageController;

  constructor(rtc: RtcManager, render: RenderController, model: RealtimeModel) {
    this.camera = new CameraController(rtc, render);
    this.image = new ImageController(rtc, render, model);
  }

  get stream(): RealtimeMediaStream | null {
    return this.source === 'camera' ? this.camera.stream : this.image.stream;
  }

  get useMicrophone(): boolean {
    return this.source === 'camera' && this.camera.useMicrophone;
  }

  createCamera(
    options: CameraStreamOptions,
    signal: AbortSignal,
  ): Promise<RealtimeMediaStream> {
    return this.create('camera', () => this.camera.create(options, signal));
  }

  createImage(
    options: ImageStreamOptions,
    signal: AbortSignal,
  ): Promise<RealtimeMediaStream> {
    return this.create('image', () => this.image.create(options, signal));
  }

  private async create(
    source: 'camera' | 'image',
    action: () => Promise<RealtimeMediaStream>,
  ): Promise<RealtimeMediaStream> {
    if (this.source)
      throw invalid(
        'Stop the current local stream before creating another one',
      );

    this.source = source;
    try {
      return await action();
    } catch (error) {
      this.source = null;
      throw error;
    }
  }

  switchCamera(signal: AbortSignal): Promise<RealtimeMediaStream> {
    if (this.source !== 'camera')
      throw invalid('Create a local camera stream first');

    return this.camera.switch(signal);
  }

  async stop(source: 'camera' | 'image'): Promise<void> {
    if (this.source === source) await this.close();
  }

  async close(): Promise<void> {
    const source = this.source;

    this.source = null;
    if (source === 'camera') await this.camera.close();
    else if (source === 'image') await this.image.close();
  }
}
