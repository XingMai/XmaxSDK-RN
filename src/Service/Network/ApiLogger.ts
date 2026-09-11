import { XmaxLogger } from '../../Foundation/Logging/XmaxLogger';

/** Logs API timing and allowlisted response metadata without copying sensitive response text. */
export class ApiLogger {
  /** Counts UTF-8 response bytes without relying on a browser TextEncoder global. */
  static byteLength(text: string): number {
    let bytes = 0;

    for (const character of text) {
      const point = character.codePointAt(0)!;
      bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    }

    return bytes;
  }

  /** Limits paths to SDK endpoint structure; query strings and identifiers stay private. */
  static path(path: string): string {
    return path
      .split('?')[0]!
      .split('/')
      .map(part =>
        [
          'realtime',
          'sessions',
          'session',
          'cos',
          'sts',
          'image',
          'check',
          '',
        ].includes(part)
          ? part
          : ':id',
      )
      .join('/');
  }

  /** Captures HTTP status, actual body size and safe API envelope fields on failure. */
  static response(
    method: string,
    path: string,
    status: number,
    bytes: number,
    duration: number,
    successful: boolean,
    code: unknown,
  ): void {
    const message = () =>
      `${method} ${this.path(path)}\n` +
      `├─ 状态 (Status)：${status}\n` +
      `├─ 耗时 (Duration)：${duration} ms\n` +
      `└─ 响应 (Response Size)：${bytes} bytes` +
      (successful
        ? ''
        : `\n失败响应 (Failure)：code=${
            typeof code === 'number' ? code : 'unavailable'
          }; body omitted`);

    if (successful) XmaxLogger.api.debug(message);
    else XmaxLogger.api.error(message);
  }

  /** Logs transport/parse failures using SDK codes, never backend or fetch error messages. */
  static failure(
    method: string,
    path: string,
    duration: number,
    code: string,
    status: number | null,
  ): void {
    XmaxLogger.api.error(
      () =>
        `${method} ${this.path(path)} 失败 (Request Failed)\n` +
        `├─ 耗时 (Duration)：${duration} ms\n` +
        `├─ 状态 (Status)：${status ?? 'unavailable'}\n` +
        `└─ 原因 (Reason)：${code}`,
    );
  }
}
