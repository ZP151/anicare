// Control-plane JSON (Auth and Edge responses) is intentionally bounded to 64 KiB.
export const MAX_HARNESS_RESPONSE_BYTES = 64 * 1024;

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error && signal.reason.message === 'request_timeout'
    ? signal.reason
    : new Error('request_aborted');
}

async function settleBeforeAbort<T>(work: Promise<T>, signal: AbortSignal, cancel: () => void): Promise<T> {
  let removeAbortListener: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    const abort = () => {
      cancel();
      reject(abortError(signal));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', abort);
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    removeAbortListener();
  }
}

function responseBody(response: Response): Readonly<{ read: Promise<Uint8Array>; cancel: () => void }> {
  if (!response.body) return { read: Promise.resolve(new Uint8Array()), cancel: () => undefined };

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_HARNESS_RESPONSE_BYTES) {
    void response.body.cancel().catch(() => undefined);
    return { read: Promise.reject(new Error('response_too_large')), cancel: () => undefined };
  }

  const reader = response.body.getReader();
  const cancel = () => {
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      // Best-effort cancellation must never delay the caller's abort result.
    }
  };
  const read = (async () => {
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_HARNESS_RESPONSE_BYTES) {
          cancel();
          throw new Error('response_too_large');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  })();
  return { read, cancel };
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortForCaller = () => controller.abort(new Error('request_aborted'));
  if (callerSignal?.aborted) abortForCaller();
  else callerSignal?.addEventListener('abort', abortForCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error('request_timeout')), timeoutMs);
  try {
    const response = await settleBeforeAbort(
      Promise.resolve(fetchImplementation(input, { ...init, signal: controller.signal })),
      controller.signal,
      () => undefined,
    );
    const body = responseBody(response);
    const bytes = await settleBeforeAbort(body.read, controller.signal, body.cancel);
    const buffered = new Response(bytes.byteLength === 0 ? null : (bytes as unknown as BodyInit), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    Object.defineProperty(buffered, 'redirected', { value: response.redirected });
    return buffered;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortForCaller);
  }
}
