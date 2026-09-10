/**
 * The generation models currently supported by this SDK.
 */
export enum RealtimeModel {
  x2_0 = 'x2.0',
}

/**
 * The local camera to capture from.
 */
export enum CameraPosition {
  front = 'front',
  back = 'back',
}

/**
 * Scales video to fill (cropping as needed) or fit (preserving the whole frame)
 * its view.
 */
export enum VideoContentMode {
  fill = 'fill',
  fit = 'fit',
}

/**
 * The realtime lifecycle state. Raw values match the iOS SDK.
 */
export enum RealtimeConnectionState {
  idle = 'Idle',
  connecting = 'Connecting',
  connected = 'Connected',
  generating = 'Generating',
  disconnecting = 'Disconnecting',
  disconnected = 'Disconnected',
  error = 'Error',
}

/**
 * The connection quality reported by the RTC transport.
 */
export enum RealtimeNetworkQualityLevel {
  unknown = 'Unknown',
  excellent = 'Excellent',
  good = 'Good',
  poor = 'Poor',
  bad = 'Bad',
  veryBad = 'VeryBad',
  down = 'Down',
}

/**
 * Whether device performance is limited or has recovered.
 */
export enum RealtimePerformanceStatus {
  limited = 'Limited',
  recovered = 'Recovered',
}

/**
 * The model configuration used when creating a realtime manager.
 */
export interface RealtimeConfiguration {
  readonly model: RealtimeModel;
}

/**
 * Image or video dimensions in pixels.
 */
export interface MediaSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Video dimensions in pixels and the capture frame rate.
 */
export interface RealtimeVideoFormat extends MediaSize {
  /**
   * The frame rate in frames per second. Must be a positive integer.
   */
  readonly fps: number;
}

/**
 * The prompt and optional reference image used for a generation task.
 */
export interface RealtimeContext {
  /**
   * The generation prompt, trimmed before it is sent to the service.
   */
  readonly prompt: string;

  /**
   * An optional remote reference path. Blank, omitted or null clears it in a
   * new context.
   */
  readonly referencePath?: string | null;
}

/**
 * An immutable snapshot of the current connection and generation identifiers.
 */
export interface RealtimeState {
  readonly connectionState: RealtimeConnectionState;

  /**
   * The allocated session identifier, or null when no session is held.
   */
  readonly sessionID: string | null;

  /**
   * The active generation identifier, or null outside the generating state.
   */
  readonly taskID: string | null;
}

/**
 * A manager-owned video track with stable object identity.
 *
 * Its format and camera position reflect the current binding; they become
 * null after invalidation. Do not construct replacement track objects.
 */
export interface RealtimeVideoTrack {
  readonly id: string;
  readonly videoFormat: RealtimeVideoFormat | null;
  readonly position: CameraPosition | null;
}

/**
 * A manager-owned local or remote stream. Only streams created by the manager
 * can be connected.
 */
export interface RealtimeMediaStream {
  readonly id: string;
  readonly videoTrack: RealtimeVideoTrack | null;
}

/**
 * A snapshot of the uplink and downlink RTC quality.
 */
export interface RealtimeNetworkQuality {
  readonly uplink: RealtimeNetworkQualityLevel;
  readonly downlink: RealtimeNetworkQualityLevel;
}

/**
 * A performance status and optional suggested format. Does not change capture
 * automatically.
 */
export interface RealtimePerformanceAlarm {
  readonly status: RealtimePerformanceStatus;
  readonly suggestedVideoFormat: RealtimeVideoFormat | null;
}

/**
 * Optional capture settings for createLocalCameraStream().
 */
export interface CameraStreamOptions {
  /**
   * Defaults to 832 x 1472 at 24 fps. Width and height must be positive even
   * integers.
   */
  readonly videoFormat?: RealtimeVideoFormat;

  /**
   * The camera position. Defaults to CameraPosition.front.
   */
  readonly position?: CameraPosition;

  /**
   * Whether to request microphone permission and publish audio when connected.
   * Defaults to false.
   */
  readonly useMicrophone?: boolean;
}

/** Options for a local image that is continuously published as video. */
export interface ImageStreamOptions {
  /** Local file URL or absolute path; Android also accepts readable content URIs. */
  readonly fileURL: string;

  /**
   * Requested dimensions are resolved to the model's input size before a
   * centered crop. Omitted or null uses the oriented image size at 24 fps.
   */
  readonly videoFormat?: RealtimeVideoFormat | null;
}

/**
 * The default x2.0 camera format: 832 x 1472 pixels at 24 frames per second.
 */
export const defaultCameraVideoFormat: RealtimeVideoFormat = Object.freeze({
  width: 832,
  height: 1472,
  fps: 24,
});
