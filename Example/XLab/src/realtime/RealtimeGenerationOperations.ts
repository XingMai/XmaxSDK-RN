/**
 * Owns XLab's replaceable generation task, matching UIKit's cancel-and-await flow.
 * Only the latest request may start after prior work and native cleanup settle.
 * Finished generation stays connected so subsequent contexts can reuse its task.
 * Independent reference uploads are deliberately outside this queue.
 */
export class RealtimeGenerationOperations {
  private controller: AbortController | null = null;
  private completion: Promise<void> = Promise.resolve();

  constructor(private readonly disconnect: () => Promise<void>) {}

  /** Replaces pending preparation, connection or generation with the latest intent. */
  run(action: (signal: AbortSignal) => Promise<void>): Promise<void> {
    return this.replace(action);
  }

  /** Stops generation, or closes all media when the screen leaves its lifecycle. */
  cancel(cleanup = this.disconnect): Promise<void> {
    return this.replace(async () => {}, cleanup);
  }

  private replace(
    action: (signal: AbortSignal) => Promise<void>,
    cleanup?: () => Promise<void>,
  ): Promise<void> {
    const previous = this.controller;
    const completion = this.completion;
    previous?.abort();

    const controller = new AbortController();
    this.controller = controller;
    // Interrupt the SDK now, rather than waiting behind its remote confirmation.
    const interrupt = cleanup ?? (previous ? this.disconnect : null);
    const interrupted = interrupt
      ? Promise.resolve().then(interrupt)
      : Promise.resolve();
    const operation = (async () => {
      const [, result] = await Promise.allSettled([completion, interrupted]);
      if (controller.signal.aborted) return;
      if (result.status === 'rejected') throw result.reason;

      try {
        await action(controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        await this.disconnect().catch(() => {});
        if (!controller.signal.aborted) throw error;
      }
    })().finally(() => {
      if (this.controller === controller) this.controller = null;
    });

    // A superseded failure cannot poison the next request or escape as unhandled.
    this.completion = operation.catch(() => {});

    return operation;
  }
}
