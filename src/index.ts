export const XmaxSDKInfo = Object.freeze({ version: '0.0.1' });
export { XmaxClient } from './Core/XmaxClient';
export {
  XmaxEnvironment,
  XmaxLoggerOption,
  type XmaxConfiguration,
} from './Core/XmaxConfiguration';
export type {
  XmaxRealtimeManaging,
  RealtimeStateListener,
  RealtimeErrorListener,
  RealtimeCameraPreviewReadyListener,
  RealtimeNetworkQualityListener,
  RealtimePerformanceAlarmListener,
} from './Core/Realtime/XmaxRealtimeManaging';
export * from './Service/Realtime/RealtimeTypes';
export type { MediaServicing } from './Service/Media/MediaService';
export {
  XmaxError,
  XmaxErrorCode,
  XmaxErrorSeverity,
} from './Foundation/Errors/XmaxError';
export { XmaxVideo, type XmaxVideoProps } from './Render/Video/XmaxVideo';
export {
  XmaxRealtimeVideo,
  type XmaxRealtimeVideoProps,
} from './Render/Video/XmaxRealtimeVideo';
