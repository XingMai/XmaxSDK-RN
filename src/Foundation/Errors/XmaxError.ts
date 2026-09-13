/**
 * Stable error identifiers used by synchronous throws and rejected SDK
 * operations.
 */
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
  uploadError = 'UPLOAD_ERROR',
  downloadError = 'DOWNLOAD_ERROR',
  unsafeImage = 'UNSAFE_IMAGE',
}

/**
 * An SDK failure with a stable code and optional API/HTTP metadata.
 *
 * Native or unknown failures can be normalized with XmaxError.from().
 */
export class XmaxError extends Error {
  readonly name = 'XmaxError';

  /**
   * The stable SDK error identifier.
   */
  readonly code: XmaxErrorCode;

  /**
   * The service response code, or null when unavailable.
   */
  readonly apiCode: number | null;

  /**
   * The HTTP response status, or null when unavailable.
   */
  readonly httpStatus: number | null;

  constructor(options: {
    code: XmaxErrorCode;
    message: string;
    apiCode?: number | null;
    httpStatus?: number | null;
  }) {
    super(options.message);
    this.code = options.code;
    this.apiCode = options.apiCode ?? null;
    this.httpStatus = options.httpStatus ?? null;
  }

  /**
   * Preserves an existing XmaxError, or wraps an unknown failure as
   * INTERNAL_ERROR.
   */
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
