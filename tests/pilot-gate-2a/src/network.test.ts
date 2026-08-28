import { describe, expect, it } from 'vitest';

import { fetchWithTimeout } from './network.js';

describe('fetchWithTimeout', () => {
  it('aborts a request that does not settle before its deadline', async () => {
    let aborted = false;
    const hungFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    });

    await expect(fetchWithTimeout('http://127.0.0.1', {}, 1, hungFetch)).rejects.toBeDefined();
    expect(aborted).toBe(true);
  });

  it('propagates a caller cancellation to the underlying request', async () => {
    const caller = new AbortController();
    let aborted = false;
    const hungFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    });

    const request = fetchWithTimeout('http://127.0.0.1', { signal: caller.signal }, 100, hungFetch);
    caller.abort();

    await expect(request).rejects.toBeDefined();
    expect(aborted).toBe(true);
  });
});
