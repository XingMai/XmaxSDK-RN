import { XmaxLoggerOption } from '../../Core/XmaxConfiguration';

/** Native sinks receive preformatted, credential-free messages at their original level. */
export type LogSink = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  option: XmaxLoggerOption,
) => void;

type Message = string | (() => string);

/**
 * Global categorized SDK logging, matching the iOS logger's last-client-wins policy.
 * Messages are evaluated only when enabled. Callers must select safe metadata;
 * never pass credentials, prompts, URLs with query strings or raw response bodies.
 */
export class XmaxLogger {
  static readonly realtime = new XmaxLogger('Realtime');
  static readonly rtc = new XmaxLogger('RTC');
  static readonly media = new XmaxLogger('Media');
  static readonly api = new XmaxLogger('API');
  static readonly storage = new XmaxLogger('Storage');
  static readonly room = new XmaxLogger('Room');
  static readonly stream = new XmaxLogger('Stream');
  static readonly render = new XmaxLogger('Render');
  static readonly interaction = new XmaxLogger('Interaction');
  static readonly permission = new XmaxLogger('Permission');

  private static options = 0;
  private static sink: LogSink = () => {};

  private constructor(private readonly category: string) {}

  /** Applies to existing and future SDK services, including independent storage tasks. */
  static configure(options: number, sink: LogSink): void {
    this.options = options;
    this.sink = sink;
  }

  /** Tests the category bitmask without building a message or crossing the native bridge. */
  static isEnabled(option: number): boolean {
    // Bitmask semantics match the public OptionSet contract.
    // eslint-disable-next-line no-bitwise
    return option !== 0 && (this.options & option) === option;
  }

  /** Writes diagnostic details under the business category unless explicitly overridden. */
  debug(message: Message, option = XmaxLoggerOption.business): void {
    this.write('debug', message, option);
  }

  /** Writes a normal lifecycle or operation event. */
  info(message: Message, option = XmaxLoggerOption.business): void {
    this.write('info', message, option);
  }

  /** Writes a recoverable condition or a host callback failure. */
  warn(message: Message, option = XmaxLoggerOption.business): void {
    this.write('warn', message, option);
  }

  /** Writes an operation failure without affecting its error propagation. */
  error(message: Message, option = XmaxLoggerOption.business): void {
    this.write('error', message, option);
  }

  private write(
    level: Parameters<LogSink>[0],
    message: Message,
    option: XmaxLoggerOption,
  ): void {
    if (!XmaxLogger.isEnabled(option)) return;

    // Logging failures, including native transport failures, cannot interrupt SDK work.
    try {
      const text = typeof message === 'function' ? message() : message;
      const formatted = text
        .split(/\r?\n/)
        .map(line => `[Xmax][${this.category}] ${line}`)
        .join('\n');
      XmaxLogger.sink(level, formatted, option);
    } catch {
      // No recursive console fallback: it could bypass logging/privacy settings.
    }
  }
}
