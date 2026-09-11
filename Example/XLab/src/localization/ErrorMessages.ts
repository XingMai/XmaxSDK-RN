import type { MessageKey } from './messages';

const errorMessages: Readonly<Record<string, MessageKey>> = {
  INVALID_API_KEY: 'error.apiKey',
  INVALID_CONFIGURATION: 'error.configuration',
  INTERNAL_ERROR: 'error.internal',
  NETWORK_ERROR: 'error.network',
  API_ERROR: 'error.api',
  SESSION_ERROR: 'error.session',
  RTC_ERROR: 'error.rtc',
  MEDIA_ERROR: 'error.media',
  CAMERA_PERMISSION_DENIED: 'error.camera',
  MICROPHONE_PERMISSION_DENIED: 'error.microphone',
  CANCELLED: 'error.cancelled',
  TIMEOUT: 'error.timeout',
  UPLOAD_ERROR: 'storage.upload.error',
  DOWNLOAD_ERROR: 'error.download',
  UNSAFE_IMAGE: 'storage.unsafe',
};

/** Maps SDK failures to app copy without altering SDK errors or displaying native exception text. */
export function errorMessageKey(code: string): MessageKey {
  return Object.hasOwn(errorMessages, code)
    ? errorMessages[code]!
    : 'error.internal';
}
