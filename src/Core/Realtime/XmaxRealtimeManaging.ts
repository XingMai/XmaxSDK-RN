import type { XmaxError } from '../../Foundation/Errors/XmaxError';
import type {
  RealtimeConfiguration,
  RealtimeState,
  RealtimeMediaStream,
  CameraStreamOptions,
  RealtimeContext,
  RealtimeNetworkQuality,
  RealtimePerformanceAlarm,
} from '../../Service/Realtime/RealtimeTypes';
export type RealtimeStateListener = (state: RealtimeState) => void;
export type RealtimeErrorListener = (error: XmaxError) => void;
export type RealtimeCameraPreviewReadyListener = () => void;
export type RealtimeNetworkQualityListener = (
  quality: RealtimeNetworkQuality,
) => void;
export type RealtimePerformanceAlarmListener = (
  alarm: RealtimePerformanceAlarm,
) => void;
export interface XmaxRealtimeManaging {
  readonly options: Readonly<RealtimeConfiguration>;
  readonly currentState: RealtimeState;
  readonly localAudioVolume: number;
  readonly remoteAudioVolume: number;
  setStateListener(listener: RealtimeStateListener | null): Promise<void>;
  setErrorListener(listener: RealtimeErrorListener | null): Promise<void>;
  setCameraPreviewReadyListener(
    listener: RealtimeCameraPreviewReadyListener | null,
  ): Promise<void>;
  setNetworkQualityListener(
    listener: RealtimeNetworkQualityListener | null,
  ): Promise<void>;
  setPerformanceAlarmListener(
    listener: RealtimePerformanceAlarmListener | null,
  ): Promise<void>;
  setLocalAudioVolume(volume: number): Promise<void>;
  setRemoteAudioVolume(volume: number): Promise<void>;
  createLocalCameraStream(
    options?: CameraStreamOptions,
  ): Promise<RealtimeMediaStream>;
  stopLocalCameraStream(): Promise<void>;
  switchCamera(): Promise<RealtimeMediaStream>;
  connect(options: {
    localStream: RealtimeMediaStream;
  }): Promise<RealtimeMediaStream>;
  disconnect(): Promise<void>;
  close(): Promise<void>;
  startGeneration(options: {
    localStream: RealtimeMediaStream;
    context?: RealtimeContext | null;
  }): Promise<RealtimeMediaStream>;
  startGeneration(options?: {
    context?: RealtimeContext | null;
  }): Promise<void>;
}
