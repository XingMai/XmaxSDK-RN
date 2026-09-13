import './Foundation/RTC/RtcTypeCompatibility';

/**
 * Version metadata for the installed Xmax React Native SDK.
 */
export const XmaxSDKInfo = Object.freeze({ version: '1.0.0' });

export { XmaxClient } from './Core/XmaxClient';

export {
  XmaxEnvironment,
  XmaxLoggerOption,
  type XmaxConfiguration,
} from './Core/XmaxConfiguration';

export type {
  XmaxRealtimeManaging,
  RealtimeStateListener,
  RealtimeNetworkQualityListener,
  RealtimePerformanceAlarmListener,
} from './Core/Realtime/XmaxRealtimeManaging';

export * from './Service/Realtime/RealtimeTypes';

export type { MediaServicing } from './Service/Media/MediaService';

export { XmaxError, XmaxErrorCode } from './Foundation/Errors/XmaxError';

export { XmaxVideo, type XmaxVideoProps } from './Render/Video/XmaxVideo';

export {
  XmaxRealtimeVideo,
  type XmaxRealtimeVideoProps,
} from './Render/Video/XmaxRealtimeVideo';

export type {
  XmaxStorageManaging,
  XmaxUploadedFile,
  XmaxDownloadedFile,
  StorageProgress,
  XmaxStorageProgressHandler,
  UploadFileOptions,
  DownloadFileOptions,
} from './Core/Storage/XmaxStorageManaging';

export { DefaultTrajectoryEffectRenderer } from './Render/Trajectory/DefaultTrajectoryEffectRenderer';

export type {
  TrajectoryEffectRendering,
  TrajectoryID,
  TrajectoryPoint,
} from './Render/Trajectory/TrajectoryEffectRendering';
