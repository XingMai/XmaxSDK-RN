import { invalid } from '../../Foundation/Errors/XmaxError';
import { ensureActive } from '../../Foundation/Runtime/Async';
export class RealtimeCoordinator {
  private operation: {
    controller: AbortController;
    completion: Promise<void>;
  } | null = null;
  private closing: Promise<void> | null = null;
  run<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.operation || this.closing)
      return Promise.reject(
        invalid('Another realtime operation is in progress'),
      );
    const controller = new AbortController();
    let finish!: () => void;
    const entry = {
      controller,
      completion: new Promise<void>(resolve => {
        finish = resolve;
      }),
    };
    this.operation = entry;
    return Promise.resolve()
      .then(() => {
        ensureActive(controller.signal);
        return action(controller.signal);
      })
      .finally(() => {
        if (this.operation === entry) this.operation = null;
        finish();
      });
  }
  interrupt(cleanup: () => Promise<void>): Promise<void> {
    if (this.closing) return this.closing;
    const operation = this.operation;
    operation?.controller.abort();
    // Resource cleanup begins immediately; it never queues behind a remote confirmation.
    const closing = Promise.resolve()
      .then(cleanup)
      .finally(async () => {
        await operation?.completion;
        if (this.closing === closing) this.closing = null;
      });
    this.closing = closing;
    return closing;
  }
}
