// Log only explicit SDK metadata, never prompts, API responses, keys or authentication headers.
/**
 * Writes explicitly selected SDK metadata according to the client logging
 * bitmask.
 *
 * Callers must never pass credentials, prompts or full API responses.
 */
export class XmaxLogger {
  constructor(private readonly options: number) {}

  business(event: string, metadata?: object): void {
    if (this.options === 1 || this.options === 3)
      console.info('[XmaxSDK]', event, metadata ?? '');
  }

  performance(metadata: object): void {
    if (this.options === 2 || this.options === 3)
      console.info('[XmaxSDK:performance]', metadata);
  }

  listenerFailure(): void {
    this.business('Listener threw an exception');
  }
}
