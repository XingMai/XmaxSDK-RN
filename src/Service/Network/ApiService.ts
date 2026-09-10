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
export interface ApiServicing {
  request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<unknown>;
}
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
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new XmaxError({
          code: XmaxErrorCode.apiError,
          message: 'Server returned invalid JSON',
          httpStatus: response.status,
        });
      }
      const envelope = record(value);
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
