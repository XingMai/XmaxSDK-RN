import type { XmaxError } from '../../Foundation/Errors/XmaxError';

/**
 * The generation models currently supported by this SDK.
 */
export enum RealtimeModel {
  /** Xmax X2.0 realtime generation. */
  x2_0 = 'x2.0',
  /** Xmax X2.0 Pro realtime generation. */
  x2_0_pro = 'x2.0-pro',
}

/** Input resolution constraints for a realtime model. */
export interface RealtimeModelSpecification {
  /**
   * Exact supported width/height pairs, independent of frame rate. An empty
   * array accepts any positive size and applies the pixel bounds and alignment.
   */
  readonly resolutionBuckets: readonly MediaSize[];

  /** Minimum pixel area used only when resolutionBuckets is empty. */
  readonly minimumInputPixels: number;

  /** Maximum pixel area used only when resolutionBuckets is empty. */
  readonly maximumInputPixels: number;

  /** Dimension alignment used only when resolutionBuckets is empty. */
  readonly inputSizeAlignment: number;

  /** Default frame rate for local media sources. */
  readonly defaultFrameRate: number;

  /** Default camera dimensions and frame rate for this model. */
  readonly defaultCameraVideoFormat: RealtimeVideoFormat;
}

/** Immutable model specifications indexed by the model's wire value. */
export const realtimeModelSpecifications: Readonly<
  Record<RealtimeModel, RealtimeModelSpecification>
> = Object.freeze({
  [RealtimeModel.x2_0]: Object.freeze({
    resolutionBuckets: Object.freeze([]),
    minimumInputPixels: 600000,
    maximumInputPixels: 1280000,
    inputSizeAlignment: 32,
    defaultFrameRate: 30,
    defaultCameraVideoFormat: Object.freeze({
      width: 832,
      height: 1472,
      fps: 30,
    }),
  }),
  [RealtimeModel.x2_0_pro]: Object.freeze({
    resolutionBuckets: Object.freeze([
      Object.freeze({ width: 1024, height: 1920 }),
      Object.freeze({ width: 1920, height: 1024 }),
    ]),
    minimumInputPixels: 600000,
    maximumInputPixels: 2100000,
    inputSizeAlignment: 32,
    defaultFrameRate: 30,
    defaultCameraVideoFormat: Object.freeze({
      width: 1024,
      height: 1920,
      fps: 30,
    }),
  }),
});

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
  preparing = 'Preparing',
  ready = 'Ready',
  connecting = 'Connecting',
  connected = 'Connected',
  generating = 'Generating',
  disconnecting = 'Disconnecting',
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

/** Upload encoding policy, matching the iOS SDK's preferences. */
export enum RealtimeVideoEncoderPreference {
  /** Balances frame rate and resolution. The default policy. */
  auto = 'auto',
  /** Prioritizes frame rate. */
  maintainFramerate = 'maintainFramerate',
  /** Prioritizes resolution. */
  maintainQuality = 'maintainQuality',
}

/** Video dimensions, frame rate and optional upload encoding settings. */
export interface RealtimeVideoFormat extends MediaSize {
  /**
   * The frame rate in frames per second. Must be a positive integer.
   */
  readonly fps: number;

  /** Minimum kbps; omitted/null uses SDK defaults, and 0 means no minimum. */
  readonly minimumBitrate?: number | null;

  /** Maximum kbps; omitted/null uses SDK defaults. Must be a positive integer. */
  readonly maximumBitrate?: number | null;

  /** Defaults to auto. Preserved when the SDK resolves input dimensions. */
  readonly encoderPreference?: RealtimeVideoEncoderPreference;
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

/** Why a realtime lifecycle ended; new operations clear the previous reason. */
export type RealtimeReason =
  | { readonly type: 'normal' }
  | { readonly type: 'orientationChanged' }
  | { readonly type: 'failure'; readonly error: XmaxError };

/**
 * An immutable snapshot of the current connection and generation identifiers.
 */
export interface RealtimeState {
  readonly connectionState: RealtimeConnectionState;

  /** Normal termination, display rotation or a lifecycle failure; null during new work. */
  readonly reason: RealtimeReason | null;

  /**
   * The current or most recent session identifier, retained through termination.
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

/** Caller cancellation for one operation, equivalent to cancelling its Swift Task. */
export interface RealtimeOperationOptions {
  /** Cancels this call; lifecycle cleanup completes before its promise rejects. */
  readonly signal?: AbortSignal;
}

/** Optional capture settings for createLocalCameraStream(). */
export interface CameraStreamOptions extends RealtimeOperationOptions {
  /**
   * Defaults to 832 x 1472 at 30 fps for x2.0,
   * or 1024 x 1920 at 30 fps for x2.0-pro. Width and height must be positive even
   * integers. Empty model buckets resize dimensions using the model's bounds;
   * nonempty buckets require an exact width/height match without resizing.
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
export interface ImageStreamOptions extends RealtimeOperationOptions {
  /** Local file URL or absolute path; Android also accepts readable content URIs. */
  readonly fileURL: string;

  /**
   * Requested dimensions are resolved to the model's input size before a
   * centered crop. Omitted or null uses the oriented image size and model default fps.
   * Nonempty model buckets require those dimensions to match exactly; no
   * nearest bucket is selected automatically.
   */
  readonly videoFormat?: RealtimeVideoFormat | null;
}

/**
 * The default x2.0 camera format. For other models, read the model specification.
 */
export const defaultCameraVideoFormat: RealtimeVideoFormat =
  realtimeModelSpecifications[RealtimeModel.x2_0].defaultCameraVideoFormat;
