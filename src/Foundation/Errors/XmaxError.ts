export enum XmaxErrorCode {
  invalidAPIKey = 'INVALID_API_KEY',
  invalidConfiguration = 'INVALID_CONFIGURATION',
  internalError = 'INTERNAL_ERROR',
  networkError = 'NETWORK_ERROR',
  apiError = 'API_ERROR',
  sessionError = 'SESSION_ERROR',
  rtcError = 'RTC_ERROR',
  mediaError = 'MEDIA_ERROR',
  cameraPermissionDenied = 'CAMERA_PERMISSION_DENIED',
  microphonePermissionDenied = 'MICROPHONE_PERMISSION_DENIED',
  cancelled = 'CANCELLED',
  timeout = 'TIMEOUT',
}
export enum XmaxErrorSeverity {
  recoverable = 'RECOVERABLE',
  fatal = 'FATAL',
}
export class XmaxError extends Error {
  readonly name = 'XmaxError';
  readonly code: XmaxErrorCode;
  readonly severity: XmaxErrorSeverity;
  readonly apiCode: number | null;
  readonly httpStatus: number | null;
  constructor(options: {
    code: XmaxErrorCode;
    message: string;
    severity?: XmaxErrorSeverity;
    apiCode?: number | null;
    httpStatus?: number | null;
  }) {
    super(options.message);
    this.code = options.code;
    this.severity =
      options.severity ??
      ([
        XmaxErrorCode.invalidAPIKey,
        XmaxErrorCode.invalidConfiguration,
        XmaxErrorCode.cameraPermissionDenied,
        XmaxErrorCode.microphonePermissionDenied,
        XmaxErrorCode.cancelled,
      ].includes(options.code)
        ? XmaxErrorSeverity.recoverable
        : XmaxErrorSeverity.fatal);
    this.apiCode = options.apiCode ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }
  static from(error: unknown): XmaxError {
    if (error instanceof XmaxError) return error;
    return new XmaxError({
      code: XmaxErrorCode.internalError,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
export function invalid(message: string): XmaxError {
  return new XmaxError({ code: XmaxErrorCode.invalidConfiguration, message });
}
export function cancelledError(): XmaxError {
  return new XmaxError({
    code: XmaxErrorCode.cancelled,
    message: 'Realtime operation was cancelled',
  });
}
