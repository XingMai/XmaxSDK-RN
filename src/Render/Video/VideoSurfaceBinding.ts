import { XmaxLogger } from '../../Foundation/Logging/XmaxLogger';
import type { RemoteStream } from '../../Foundation/RTC/RtcManager';
import type { VideoContentMode } from '../../Service/Realtime/RealtimeTypes';
import type { VideoBinding } from '../RenderController';

/**
 * Owns one mounted canvas binding and its remote display confirmation.
 *
 * Reapplying the same content mode does not reset the native canvas. Task
 * confirmation and a matching rendered event are both required for display.
 */
export class VideoSurfaceBinding {
  private active = false;
  private mode: VideoContentMode | null = null;
  private rendered = false;
  private displayed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly record: VideoBinding,
    private readonly viewID: string,
    private readonly stream: RemoteStream | null,
    private readonly onDisplayed: (ready: boolean) => void,
  ) {}

  start(mode: VideoContentMode): void {
    if (this.active) return;

    this.active = true;
    this.unsubscribe = this.record.rtc.onEvent(event => {
      if (
        !this.active ||
        event.type !== 'rendered' ||
        !this.stream ||
        event.stream.roomID !== this.stream.roomID ||
        event.stream.userID !== this.stream.userID
      )
        return;

      this.rendered = true;
      this.refresh();
    });
    this.setContentMode(mode);
  }

  setContentMode(mode: VideoContentMode): void {
    if (!this.active || this.mode === mode) return;

    try {
      this.record.rtc.bind(this.viewID, this.stream, mode);
      this.mode = mode;
      this.refresh();
    } catch {
      XmaxLogger.render.error('Video canvas binding failed');
      this.mode = null;
      this.refresh();
    }
  }

  /** Rechecks task confirmation without rebinding or replaying the fade. */
  refresh(): void {
    const displayed =
      this.active &&
      this.mode !== null &&
      this.record.valid &&
      this.record.confirmed &&
      this.rendered;

    if (displayed === this.displayed) return;

    this.displayed = displayed;
    this.onDisplayed(displayed);
  }

  dispose(): void {
    if (!this.active) return;

    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;

    try {
      this.record.rtc.unbind(this.viewID, this.stream);
    } catch {
      /* The owner may already have closed its engine. */
    }
  }
}
