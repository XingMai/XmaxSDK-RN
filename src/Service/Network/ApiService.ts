import { ApiLogger } from './ApiLogger';
import { requestHTTP, type HttpTransport } from './HttpTransport';
import { XmaxError, XmaxErrorCode } from '../../Foundation/Errors/XmaxError';
import type { RuntimeInfo } from '../../Foundation/Runtime/RuntimeInfo';

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The internal JSON request boundary shared by realtime and storage services.
 */
export interface ApiServicing {
  /**
   * Sends a request relative to the configured API base and returns the
   * unwrapped data payload. Forwards cancellation to the transport; a response
   * that wins the cancellation race is returned so its resources can be reclaimed.
   */
  request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

/**
 * Adds Xmax authentication and runtime headers, unwraps API envelopes and
 * normalizes transport failures.
 */
export class ApiService implements ApiServicing {
  constructor(
    private readonly apiKey: string,
    private readonly baseURL: string,
    private readonly runtime: RuntimeInfo,
    private readonly transport: HttpTransport = requestHTTP,
  ) {}

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.apiKey)
      throw new XmaxError({
        code: XmaxErrorCode.invalidAPIKey,
        message: 'API key cannot be empty',
      });

    const started = Date.now();
    let responseLogged = false;
    let status: number | null = null;
    const controller = new AbortController();
    let abortCause: 'cancelled' | 'timeout' | null = null;
    const abort = (cause: 'cancelled' | 'timeout') => {
      if (abortCause) return;

      abortCause = cause;
      controller.abort();
    };
    const cancel = () => abort('cancelled');
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(() => abort('timeout'), 15000);

    try {
      if (controller.signal.aborted) throw new Error('Request aborted');

      const response = await this.transport(`${this.baseURL}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
          'X-Platform': this.runtime.platform,
          'X-OS-Version': this.runtime.os_version,
          'X-SDK-Version': this.runtime.sdk_version,
          'X-Device-Model': this.runtime.device_model,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      status = response.status;
      const text = await response.text();
      let value: unknown;

      try {
        value = JSON.parse(text);
      } catch {
        throw new XmaxError({
          code: XmaxErrorCode.apiError,
          message: 'Server returned invalid JSON',
          httpStatus: response.status,
        });
      }

      const envelope = record(value);
      const successful =
        response.ok && envelope?.success === true && envelope.data != null;
      ApiLogger.response(
        method,
        path,
        response.status,
        ApiLogger.byteLength(text),
        Date.now() - started,
        successful,
        envelope?.code,
      );
      responseLogged = true;

      if (!response.ok || envelope?.success !== true)
        throw new XmaxError({
          code: XmaxErrorCode.apiError,
          message: nonEmpty(envelope?.message) ?? 'Xmax API request failed',
          httpStatus: response.status,
          apiCode: typeof envelope?.code === 'number' ? envelope.code : null,
        });
      if (envelope.data === undefined || envelope.data === null)
        throw new XmaxError({
          code: XmaxErrorCode.apiError,
          message: 'Server returned no data',
          httpStatus: response.status,
        });

      return envelope.data;
    } catch (error) {
      const failure = transportError(error, abortCause);
      if (!responseLogged)
        ApiLogger.failure(
          method,
          path,
          Date.now() - started,
          failure.code,
          status,
        );
      throw failure;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
}

/** Keeps cancellation distinct from HTTP timeouts and preserves transport details. */
function transportError(
  error: unknown,
  abortCause: 'cancelled' | 'timeout' | null,
): XmaxError {
  const details = record(error);
  if (
    abortCause === 'cancelled' ||
    (abortCause === null &&
      (details?.name === 'AbortError' || details?.code === 'ABORT_ERR'))
  )
    return new XmaxError({
      code: XmaxErrorCode.cancelled,
      message: 'API request was cancelled',
    });
  if (abortCause === null && error instanceof XmaxError) return error;

  const message =
    abortCause === 'timeout'
      ? 'API request timed out'
      : nonEmpty(details?.message) ??
        nonEmpty(error) ??
        'Network request failed';
  const platformCode = details?.code;
  const suffix =
    abortCause === null &&
    ((typeof platformCode === 'number' && Number.isFinite(platformCode)) ||
      (typeof platformCode === 'string' && platformCode.trim()))
      ? `（平台错误码：${platformCode}）`
      : '';

  return new XmaxError({
    // HTTP timeouts are network failures; RTC confirmation waits retain TIMEOUT.
    code: XmaxErrorCode.networkError,
    message: `HTTP request failed: ${message}${suffix}`,
  });
}
