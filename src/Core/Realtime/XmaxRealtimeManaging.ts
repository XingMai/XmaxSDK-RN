import type {
  RealtimeConfiguration,
  RealtimeState,
  RealtimeReason,
  RealtimeOperationOptions,
  RealtimeMediaStream,
  CameraStreamOptions,
  ImageStreamOptions,
  RealtimeContext,
  RealtimeNetworkQuality,
  RealtimePerformanceAlarm,
} from '../../Service/Realtime/RealtimeTypes';

/**
 * Receives the current state when registered, then subsequent state changes.
 */
export type RealtimeStateListener = (state: RealtimeState) => void;

/**
 * Receives the latest uplink and downlink quality reported by RTC.
 */
export type RealtimeNetworkQualityListener = (
  quality: RealtimeNetworkQuality,
) => void;

/**
 * Receives device performance warnings and recovery notifications.
 */
export type RealtimePerformanceAlarmListener = (
  alarm: RealtimePerformanceAlarm,
) => void;

/**
 * Controls one realtime camera or image session and its generation lifecycle.
 *
 * Obtain an instance from XmaxClient.createRealtimeManager(). Listeners use
 * replacement semantics; pass null to clear a listener. Call close() when
 * the owning screen is finished with the manager.
 *
 * Cancellable operations accept an optional AbortSignal. Cancellation of initial
 * generation releases its connection; cancellation of a context update preserves
 * the existing generation. Disconnect/close always finish cleanup and cannot be
 * cancelled. Overlapping operations reject instead of silently queuing.
 */
export interface XmaxRealtimeManaging {
  /**
   * The immutable model configuration used by this manager.
   */
  readonly options: Readonly<RealtimeConfiguration>;

  /**
   * The latest processed state snapshot. Updated before the state listener
   * runs.
   */
  readonly currentState: RealtimeState;

  /**
   * The local preview volume. The camera route has no local audio playback and
   * returns 0.
   */
  readonly localAudioVolume: number;

  /**
   * The remote playback volume, from 0 to 1. Camera creation resets it to 0;
   * image creation resets it to 1.
   */
  readonly remoteAudioVolume: number;

  /**
   * Replaces the state listener and immediately delivers currentState. Pass
   * null to clear it.
   */
  setStateListener(listener: RealtimeStateListener | null): Promise<void>;

  /**
   * Replaces the RTC network-quality listener. Pass null to clear it.
   */
  setNetworkQualityListener(
    listener: RealtimeNetworkQualityListener | null,
  ): Promise<void>;

  /**
   * Replaces the performance listener without changing encoding settings. Pass
   * null to clear it.
   */
  setPerformanceAlarmListener(
    listener: RealtimePerformanceAlarmListener | null,
  ): Promise<void>;

  /**
   * Validates a volume between 0 and 1. The current camera route has no local
   * audio playback.
   */
  setLocalAudioVolume(volume: number): Promise<void>;

  /**
   * Sets remote playback volume between 0 (muted) and 1 (full volume).
   */
  setRemoteAudioVolume(volume: number): Promise<void>;

  /**
   * Requests camera permission and starts local capture. State becomes Preparing;
   * after the first valid frame and a preview binding it becomes Ready.
   *
   * Defaults to the front camera at the model's default format, with the
   * microphone disabled. Stop the current local stream before creating another one.
   * Empty model buckets resize dimensions using pixel bounds and alignment;
   * nonempty buckets reject unsupported dimensions before requesting permission.
   */
  createLocalCameraStream(
    options?: CameraStreamOptions,
  ): Promise<RealtimeMediaStream>;

  /**
   * Stops local camera capture after disconnect(). Does nothing if the active
   * input is an image. Use close() to interrupt ongoing work and release all resources.
   */
  stopLocalCameraStream(options?: RealtimeOperationOptions): Promise<void>;

  /**
   * Prepares a local image and continuously publishes it as video when connected.
   *
   * Uses an orientation-corrected, center-cropped private copy for both RTC and
   * local preview. No camera or microphone permission is requested. Disconnect
   * and stop the current input before creating another. The caller retains
   * ownership of the original file; this manager owns the prepared copy.
   */
  createLocalImageStream(
    options: ImageStreamOptions,
  ): Promise<RealtimeMediaStream>;

  /**
   * Stops the image source and removes its prepared copy after disconnect().
   * Does nothing if the active input is a camera. Use close() to interrupt preparation.
   */
  stopLocalImageStream(options?: RealtimeOperationOptions): Promise<void>;

  /**
   * Switches the camera while preserving the local video-track object.
   *
   * If generation is active, restarts its task with the cached context after
   * the camera switches. The room connection is retained on success.
   */
  switchCamera(
    options?: RealtimeOperationOptions,
  ): Promise<RealtimeMediaStream>;

  /**
   * Creates a session and joins RTC using a local stream owned by this manager.
   *
   * Returns the remote stream without starting generation. Mount its video
   * track before calling startGeneration() so rendering can be observed.
   */
  connect(
    options: RealtimeOperationOptions & {
      localStream: RealtimeMediaStream;
    },
  ): Promise<RealtimeMediaStream>;

  /**
   * Interrupts pending realtime work and closes the session and room.
   *
   * Keeps local media and returns to Ready, or Idle when none remains.
   * An optional reason is delivered with the final state. Preparing local media
   * is unaffected when no connection operation is active.
   */
  disconnect(options?: { reason?: RealtimeReason }): Promise<void>;

  /**
   * Interrupts pending work and releases the session, RTC and local media.
   *
   * Finishes in Idle with a termination reason. Repeated calls share the
   * in-progress cleanup. The manager remains reusable and retains its business
   * listeners. Independent storage tasks are
   * unaffected.
   */
  close(): Promise<void>;

  /**
   * Connects the supplied local stream if needed, then starts or updates
   * generation.
   *
   * The first generation requires context. Omitted or null context reuses the
   * last successful context. Returns the remote stream.
   */
  startGeneration(
    options: RealtimeOperationOptions & {
      localStream: RealtimeMediaStream;
      context?: RealtimeContext | null;
    },
  ): Promise<RealtimeMediaStream>;

  /**
   * Starts or updates generation on an existing connection.
   *
   * A new task waits for a matching task confirmation; context updates reuse
   * the task and complete after sending the update. Returns no stream.
   */
  startGeneration(
    options?: RealtimeOperationOptions & {
      context?: RealtimeContext | null;
    },
  ): Promise<void>;
}
