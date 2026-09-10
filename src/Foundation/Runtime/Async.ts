import { cancelledError, XmaxError, XmaxErrorCode } from '../Errors/XmaxError';

/**
 * Throws CANCELLED when the operation signal has already been aborted.
 */
export function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledError();
}

/**
 * Waits for a subscribed event with a timeout and cancellation. Always removes
 * the subscription on settlement.
 */
export function waitFor<T>(
  subscribe: (
    resolve: (value: T) => void,
    reject: (error: unknown) => void,
  ) => () => void,
  signal: AbortSignal,
  milliseconds: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(cancelledError());
      return;
    }

    let done = false;
    let unsubscribe = () => {};
    const finish = (error: unknown, value?: T) => {
      if (done) return;

      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      unsubscribe();
      if (error) reject(error);
      else resolve(value as T);
    };
    const abort = () => finish(cancelledError());
    const timer = setTimeout(
      () =>
        finish(
          new XmaxError({
            code: XmaxErrorCode.timeout,
            message: `${label} timed out`,
          }),
        ),
      milliseconds,
    );

    signal.addEventListener('abort', abort);

    try {
      unsubscribe = subscribe(
        value => finish(null, value),
        error => finish(error),
      );
      if (done) unsubscribe();
    } catch (error) {
      finish(error);
    }
  });
}

/**
 * Schedules non-overlapping heartbeats and returns a function that stops future
 * ticks and error delivery.
 */
export function repeatHeartbeat(
  action: () => Promise<void>,
  onError: (error: unknown) => void,
  interval = 10000,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    try {
      await action();
    } catch (error) {
      if (!stopped) onError(error);
    }
    if (!stopped) timer = setTimeout(tick, interval);
  };

  timer = setTimeout(tick, interval);

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * Stops waiting when cancelled without cancelling the underlying promise.
 *
 * Use this only when late completion does not require additional resource
 * cleanup.
 */
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelledError());

    if (signal.aborted) {
      void promise.catch(() => {});
      reject(cancelledError());
      return;
    }

    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
