import { ApiLogger } from './ApiLogger';
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
   * unwrapped data payload.
   */
  request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
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
    private readonly transport: typeof fetch = fetch,
  ) {}

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
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
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
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
      if (!responseLogged)
        ApiLogger.failure(
          method,
          path,
          Date.now() - started,
          error instanceof XmaxError
            ? error.code
            : controller.signal.aborted
            ? XmaxErrorCode.timeout
            : XmaxErrorCode.networkError,
          status,
        );
      if (error instanceof XmaxError) throw error;

      throw new XmaxError({
        code: controller.signal.aborted
          ? XmaxErrorCode.timeout
          : XmaxErrorCode.networkError,
        message: controller.signal.aborted
          ? 'API request timed out'
          : 'Unable to reach Xmax service',
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
