/** The JSON API transport contract, independent of response streaming or media uploads. */
export type HttpTransport = (
  url: string,
  options: {
    method: string;
    headers: Readonly<Record<string, string>>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

/**
 * Uses RN's text XHR response to preserve native network failure descriptions.
 * The default fetch polyfill replaces those descriptions with a generic error.
 * Request cancellation and deadlines are owned by ApiService.
 */
export const requestHTTP: HttpTransport = (url, options) => {
  if (typeof XMLHttpRequest === 'undefined') return fetch(url, options);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const { signal } = options;
    let finished = false;
    const cleanup = () => {
      finished = true;
      signal.removeEventListener('abort', cancel);
      xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
    };
    const fail = (error: unknown) => {
      if (finished) return;

      cleanup();
      reject(error);
    };
    const aborted = () => {
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      fail(error);
    };
    const cancel = () => {
      if (finished) return;

      // Settle even when cancellation precedes send() and XHR emits no event.
      aborted();
      xhr.abort();
    };

    if (signal.aborted) {
      aborted();
      return;
    }

    try {
      xhr.open(options.method, url, true);
      xhr.responseType = 'text';
      xhr.withCredentials = false;
      for (const [name, value] of Object.entries(options.headers))
        xhr.setRequestHeader(name, value);

      xhr.onload = () => {
        if (finished) return;

        const status = xhr.status;
        const body = xhr.responseText;
        cleanup();
        resolve({
          status,
          ok: status >= 200 && status < 300,
          text: async () => body,
        });
      };
      // RN exposes localizedDescription / IOException.message through responseText
      // for failed text requests. The response getter intentionally hides it.
      xhr.onerror = () =>
        fail(new Error(xhr.responseText.trim() || 'Network request failed'));
      xhr.ontimeout = () =>
        fail(new Error(xhr.responseText.trim() || 'Network request timed out'));
      xhr.onabort = aborted;
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      else xhr.send(options.body ?? null);
    } catch (error) {
      fail(error);
    }
  });
};
