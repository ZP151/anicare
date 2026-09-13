/** Auth calls hold the SDK session lock. Bound the transport, including its JSON
 * body, so a lost connection cannot indefinitely block later authenticated reads. */
export function createBoundedFetch(fetcher: typeof fetch): typeof fetch {
 return async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const authRequest = new URL(url).pathname.startsWith('/auth/v1/');
  const callerSignal = init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline: (reason: Error) => void = () => undefined;
  const abort = () => {
   controller.abort();
   const error = new Error('Request cancelled or timed out'); error.name = 'AbortError';
   rejectDeadline(error);
  };
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  callerSignal?.addEventListener('abort', abort, {once:true});
  if (callerSignal?.aborted) abort();
  else timer = setTimeout(abort, authRequest ? 15000 : 45000);
  try {
   if (controller.signal.aborted) return await deadline;
   const request = fetcher(input, {...init, signal:controller.signal}).then(async response => {
    if (!authRequest) return response;
    // Token responses are small JSON. Also bound a body that stalls after headers.
    const body = await response.text();
    return new Response([204,205,304].includes(response.status)?null:body, {status:response.status, statusText:response.statusText, headers:response.headers});
   });
   return await Promise.race([request, deadline]);
  } finally {
   if (timer) clearTimeout(timer);
   callerSignal?.removeEventListener('abort', abort);
  }
 };
}
