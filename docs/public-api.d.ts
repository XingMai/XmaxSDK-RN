/** RN 首版设计契约，2026-09-09。完整目标声明；摄像头、图片和存储子集已实现，当前导出见 src/index.ts 及对应 implementation 文档。 */
import type { ReactElement } from 'react';
import type { ViewProps } from 'react-native';

export enum XmaxEnvironment { china = 'china', global = 'global' }
export enum RealtimeModel { x2_0 = 'x2.0' }
export enum RealtimeMediaSource { camera = 'camera', image = 'image' }
export enum CameraPosition { front = 'front', back = 'back' }
export enum VideoContentMode { fill = 'fill', fit = 'fit' }
export enum XmaxLoggerOption { business = 1, performance = 2, all = 3 }
export enum RealtimeConnectionState {
  idle = 'Idle', connecting = 'Connecting', connected = 'Connected',
  generating = 'Generating', disconnecting = 'Disconnecting',
  disconnected = 'Disconnected', error = 'Error',
}
export enum RealtimeNetworkQualityLevel {
  unknown = 'Unknown', excellent = 'Excellent', good = 'Good', poor = 'Poor',
  bad = 'Bad', veryBad = 'VeryBad', down = 'Down',
}
export enum RealtimePerformanceStatus { limited = 'Limited', recovered = 'Recovered' }
export enum XmaxErrorSeverity { recoverable = 'RECOVERABLE', fatal = 'FATAL' }
export enum XmaxErrorCode {
  invalidAPIKey = 'INVALID_API_KEY', invalidConfiguration = 'INVALID_CONFIGURATION',
  internalError = 'INTERNAL_ERROR', networkError = 'NETWORK_ERROR',
  apiError = 'API_ERROR', sessionError = 'SESSION_ERROR', rtcError = 'RTC_ERROR',
  mediaError = 'MEDIA_ERROR', cameraPermissionDenied = 'CAMERA_PERMISSION_DENIED',
  microphonePermissionDenied = 'MICROPHONE_PERMISSION_DENIED',
  uploadError = 'UPLOAD_ERROR', downloadError = 'DOWNLOAD_ERROR',
  unsafeImage = 'UNSAFE_IMAGE', cancelled = 'CANCELLED', timeout = 'TIMEOUT',
}
export declare class XmaxError extends Error {
  readonly name: 'XmaxError';
  readonly code: XmaxErrorCode;
  readonly severity: XmaxErrorSeverity;
  readonly apiCode: number | null;
  readonly httpStatus: number | null;
  constructor(options: {
    code: XmaxErrorCode; message: string; severity?: XmaxErrorSeverity;
    apiCode?: number | null; httpStatus?: number | null;
  });
  static from(error: unknown): XmaxError;
}

export interface XmaxConfiguration {
  readonly apiKey: string;
  readonly environment?: XmaxEnvironment; // 默认 china
  readonly loggerOptions?: number; // 位掩码，默认 0，仅允许 XmaxLoggerOption 位
}
export interface RealtimeConfiguration { readonly model: RealtimeModel }
/** CGSize 的 RN 表示，属于平台类型适配。 */
export interface MediaSize { readonly width: number; readonly height: number }
export interface RealtimeVideoFormat extends MediaSize { readonly fps: number }
/** 本地图片输入；原件归调用方所有，准备副本由 Manager 清理。 */
export interface ImageStreamOptions {
  readonly fileURL: string;
  readonly videoFormat?: RealtimeVideoFormat | null;
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
export interface RealtimeNetworkQuality {
  readonly uplink: RealtimeNetworkQualityLevel;
  readonly downlink: RealtimeNetworkQualityLevel;
}
export interface RealtimePerformanceAlarm {
  readonly status: RealtimePerformanceStatus;
  readonly suggestedVideoFormat: RealtimeVideoFormat | null;
}
/** SDK 创建的对象。属性为当前元数据的只读 getter，不是可重建的 DTO。 */
export interface RealtimeVideoTrack {
  readonly id: string;
  readonly videoFormat: RealtimeVideoFormat | null;
  readonly position: CameraPosition | null;
}
export interface RealtimeMediaStream {
  readonly id: string;
  readonly videoTrack: RealtimeVideoTrack | null;
}
export type RealtimeStateListener = (state: RealtimeState) => void;
export type RealtimeErrorListener = (error: XmaxError) => void;
export type RealtimeCameraPreviewReadyListener = () => void;
export type RealtimeNetworkQualityListener = (quality: RealtimeNetworkQuality) => void;
export type RealtimePerformanceAlarmListener = (alarm: RealtimePerformanceAlarm) => void;

export declare class XmaxClient {
  readonly configuration: Readonly<Required<XmaxConfiguration>>;
  constructor(configuration: XmaxConfiguration);
  createRealtimeManager(options: RealtimeConfiguration): XmaxRealtimeManaging;
  createStorageManager(): XmaxStorageManaging;
  createMediaService(model?: RealtimeModel): MediaServicing;
}
export interface XmaxRealtimeManaging {
  readonly options: Readonly<RealtimeConfiguration>;
  readonly currentState: RealtimeState;
  readonly localAudioVolume: number;
  readonly remoteAudioVolume: number;
  setStateListener(listener: RealtimeStateListener | null): Promise<void>;
  setErrorListener(listener: RealtimeErrorListener | null): Promise<void>;
  setCameraPreviewReadyListener(listener: RealtimeCameraPreviewReadyListener | null): Promise<void>;
  setNetworkQualityListener(listener: RealtimeNetworkQualityListener | null): Promise<void>;
  setPerformanceAlarmListener(listener: RealtimePerformanceAlarmListener | null): Promise<void>;
  setLocalAudioVolume(volume: number): Promise<void>;
  setRemoteAudioVolume(volume: number): Promise<void>;
  createLocalCameraStream(options?: {
    videoFormat?: RealtimeVideoFormat;
    position?: CameraPosition;
    useMicrophone?: boolean;
  }): Promise<RealtimeMediaStream>;
  stopLocalCameraStream(): Promise<void>;
  switchCamera(): Promise<RealtimeMediaStream>;
  createLocalImageStream(options: ImageStreamOptions): Promise<RealtimeMediaStream>;
  stopLocalImageStream(): Promise<void>;
  connect(options: { localStream: RealtimeMediaStream }): Promise<RealtimeMediaStream>;
  disconnect(): Promise<void>;
  close(): Promise<void>;
  startGeneration(options: {
    localStream: RealtimeMediaStream;
    context?: RealtimeContext | null;
  }): Promise<RealtimeMediaStream>;
  startGeneration(options?: { context?: RealtimeContext | null }): Promise<void>;
}
/** Foundation.Progress 的 RN 表示；不是 iOS SDK 新增的业务类型。 */
export interface StorageProgress {
  readonly completedUnitCount: number;
  readonly totalUnitCount: number | null;
  readonly fractionCompleted: number | null;
}
export type XmaxStorageProgressHandler = (progress: StorageProgress) => void;
export interface XmaxUploadedFile {
  readonly url: string;
  readonly objectKey: string;
  readonly etag: string | null;
}
export interface XmaxDownloadedFile {
  readonly fileURL: string;
  readonly byteCount: number;
}
export interface UploadFileOptions {
  readonly fileURL: string;
  readonly contentType?: string | null;
  readonly progress?: XmaxStorageProgressHandler | null;
  readonly signal?: AbortSignal;
}
export interface DownloadFileOptions {
  readonly remoteURL: string;
  readonly destinationURL: string;
  readonly progress?: XmaxStorageProgressHandler | null;
  readonly signal?: AbortSignal;
}
export interface XmaxStorageManaging {
  uploadImage(options: UploadFileOptions): Promise<XmaxUploadedFile>;
  uploadImageWithSafetyCheck(options: UploadFileOptions): Promise<XmaxUploadedFile>;
  uploadVideo(options: UploadFileOptions): Promise<XmaxUploadedFile>;
  downloadImage(options: DownloadFileOptions): Promise<XmaxDownloadedFile>;
  downloadVideo(options: DownloadFileOptions): Promise<XmaxDownloadedFile>;
}
export interface MediaServicing {
  readonly model: RealtimeModel;
  resolveModelInputSize(size: MediaSize): MediaSize;
}
export interface XmaxVideoProps extends ViewProps {
  track?: RealtimeVideoTrack | null;
  videoContentMode?: VideoContentMode;
  isInteractionEnabled?: boolean;
}
export interface XmaxRealtimeVideoProps extends ViewProps {
  localTrack?: RealtimeVideoTrack | null;
  remoteTrack?: RealtimeVideoTrack | null;
  videoContentMode?: VideoContentMode;
  isInteractionEnabled?: boolean;
}
export declare function XmaxVideo(props: XmaxVideoProps): ReactElement;
export declare function XmaxRealtimeVideo(props: XmaxRealtimeVideoProps): ReactElement;

/** 当前基础工程已实现；其余业务声明仍为设计契约。 */
export declare const XmaxSDKInfo: Readonly<{ version: string }>;
