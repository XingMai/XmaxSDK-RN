import { cancelledError, XmaxError, XmaxErrorCode } from '../Errors/XmaxError';
export function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledError();
}
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
