export enum RealtimeModel {
  x2_0 = 'x2.0',
}
export enum CameraPosition {
  front = 'front',
  back = 'back',
}
export enum VideoContentMode {
  fill = 'fill',
  fit = 'fit',
}
export enum RealtimeConnectionState {
  idle = 'Idle',
  connecting = 'Connecting',
  connected = 'Connected',
  generating = 'Generating',
  disconnecting = 'Disconnecting',
  disconnected = 'Disconnected',
  error = 'Error',
}
export enum RealtimeNetworkQualityLevel {
  unknown = 'Unknown',
  excellent = 'Excellent',
  good = 'Good',
  poor = 'Poor',
  bad = 'Bad',
  veryBad = 'VeryBad',
  down = 'Down',
}
export enum RealtimePerformanceStatus {
  limited = 'Limited',
  recovered = 'Recovered',
}
export interface RealtimeConfiguration {
  readonly model: RealtimeModel;
}
export interface MediaSize {
  readonly width: number;
  readonly height: number;
}
export interface RealtimeVideoFormat extends MediaSize {
  readonly fps: number;
}
export interface RealtimeContext {
  readonly prompt: string;
  readonly referencePath?: string | null;
}
export interface RealtimeState {
  readonly connectionState: RealtimeConnectionState;
  readonly sessionID: string | null;
  readonly taskID: string | null;
}
export interface RealtimeVideoTrack {
  readonly id: string;
  readonly videoFormat: RealtimeVideoFormat | null;
  readonly position: CameraPosition | null;
}
export interface RealtimeMediaStream {
  readonly id: string;
  readonly videoTrack: RealtimeVideoTrack | null;
}
export interface RealtimeNetworkQuality {
  readonly uplink: RealtimeNetworkQualityLevel;
  readonly downlink: RealtimeNetworkQualityLevel;
}
export interface RealtimePerformanceAlarm {
  readonly status: RealtimePerformanceStatus;
  readonly suggestedVideoFormat: RealtimeVideoFormat | null;
}
export interface CameraStreamOptions {
  readonly videoFormat?: RealtimeVideoFormat;
  readonly position?: CameraPosition;
  readonly useMicrophone?: boolean;
}
export const defaultCameraVideoFormat: RealtimeVideoFormat = Object.freeze({
  width: 832,
  height: 1472,
  fps: 24,
});
