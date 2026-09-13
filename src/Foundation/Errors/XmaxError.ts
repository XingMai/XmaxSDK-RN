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
   * Preserves SDK errors, including known codes serialized by the native bridge.
   * Unrecognized platform codes remain INTERNAL_ERROR.
   */
  static from(error: unknown): XmaxError {
    if (error instanceof XmaxError) return error;

    const details =
      typeof error === 'object' && error !== null
        ? (error as Record<string, unknown>)
        : null;
    const code = Object.values(XmaxErrorCode).find(
      value => value === details?.code,
    );

    return new XmaxError({
      code: code ?? XmaxErrorCode.internalError,
      message:
        typeof details?.message === 'string' ? details.message : String(error),
      ...(code && {
        apiCode: numericMetadata(details?.apiCode),
        httpStatus: numericMetadata(details?.httpStatus),
      }),
    });
  }
}

/** Native bridge metadata must retain the public numeric-or-null contract. */
function numericMetadata(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
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
