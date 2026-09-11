import { XmaxLogger } from '../Foundation/Logging/XmaxLogger';
import type { InteractionController } from '../Media/Interaction/InteractionController';
import { invalid } from '../Foundation/Errors/XmaxError';
import type { RtcManager, RemoteStream } from '../Foundation/RTC/RtcManager';
import type {
  CameraPosition,
  RealtimeMediaStream,
  RealtimeVideoFormat,
  RealtimeVideoTrack,
} from '../Service/Realtime/RealtimeTypes';

/**
 * Internal mutable rendering state behind a stable public video track.
 */
export interface VideoBinding {
  readonly id: string;
  readonly owner: object;
  readonly rtc: RtcManager;
  readonly local: boolean;
  /** Remote-only task interaction; local preview never sends touch samples. */
  readonly interaction: InteractionController | null;
  valid: boolean;
  /** Terminal display retirement is separate from canvas invalidation. */
  retiring: boolean;
  retirement: Promise<void> | null;
  readonly hideBeforeRelease: Set<() => Promise<void>>;
  confirmed: boolean;
  format: RealtimeVideoFormat;
  position: CameraPosition | null;
  remote: RemoteStream | null;
  /** Private prepared image used by the local RN preview, never a native RTC canvas. */
  imageURL: string | null;
  version: number;
  readonly listeners: Set<() => void>;
}

const tracks = new WeakMap<RealtimeVideoTrack, VideoBinding>();

const streams = new WeakMap<RealtimeMediaStream, VideoBinding>();

/**
 * Looks up internal binding state for a track without creating a new binding.
 */
export function videoBinding(
  track: RealtimeVideoTrack | null | undefined,
): VideoBinding | null {
  return track ? tracks.get(track) ?? null : null;
}

/**
 * Publishes a binding change to mounted video components while preserving track
 * identity.
 */
export function refreshBinding(binding: VideoBinding): void {
  binding.version++;

  for (const listener of [...binding.listeners]) listener();
}

/**
 * Associates manager-owned streams and tracks with live native render bindings.
 */
export class RenderController {
  private owned = new Set<VideoBinding>();

  constructor(
    private readonly owner: object,
    private readonly rtc: RtcManager,
    private readonly interaction: InteractionController | null = null,
  ) {}

  create(
    local: boolean,
    format: RealtimeVideoFormat,
    position: CameraPosition | null,
    remote: RemoteStream | null = null,
    imageURL: string | null = null,
  ): RealtimeMediaStream {
    const binding: VideoBinding = {
      id: this.rtc.randomUUID(),
      owner: this.owner,
      rtc: this.rtc,
      local,
      interaction: local ? null : this.interaction,
      valid: true,
      retiring: false,
      retirement: null,
      hideBeforeRelease: new Set(),
      confirmed: false,
      format: Object.freeze({ ...format }),
      position,
      remote,
      imageURL,
      version: 0,
      listeners: new Set(),
    };
    const track: RealtimeVideoTrack = Object.freeze({
      id: local ? 'video-local' : remote?.userID ?? 'video-remote',
      get videoFormat() {
        return binding.valid ? binding.format : null;
      },
      get position() {
        return binding.valid ? binding.position : null;
      },
    });
    const stream: RealtimeMediaStream = Object.freeze({
      id: local ? 'stream-local' : 'stream-remote',
      videoTrack: track,
    });

    tracks.set(track, binding);
    streams.set(stream, binding);
    this.owned.add(binding);

    return stream;
  }

  requireLocal(stream: RealtimeMediaStream): VideoBinding {
    const binding = streams.get(stream);

    if (
      !binding ||
      binding.owner !== this.owner ||
      !binding.local ||
      !binding.valid
    )
      throw invalid('Local stream does not belong to this active manager');

    return binding;
  }

  /** Completes native UI hiding before stop signals or room teardown can clear video pixels. */
  async hideRemote(): Promise<void> {
    await Promise.all(
      [...this.owned]
        .filter(binding => !binding.local)
        .map(binding => {
          if (binding.retirement) return binding.retirement;
          const hides = [...binding.hideBeforeRelease];
          binding.retiring = true;
          refreshBinding(binding);
          binding.retirement = Promise.all(
            hides.map(async hide => {
              try {
                await hide();
              } catch {
                // Failed or stale view lookup must not strand room/session cleanup.
                XmaxLogger.render.warn(
                  'Native video hide failed during teardown',
                );
              }
            }),
          ).then(() => {});

          return binding.retirement;
        }),
    );
  }

  invalidate(local: boolean | null = null): void {
    for (const binding of this.owned)
      if (local === null || binding.local === local) {
        binding.valid = false;
        refreshBinding(binding);
        this.owned.delete(binding);
      }
  }
}
