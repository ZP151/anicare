import { describe, expect, it } from 'vitest';

import { fetchWithTimeout, MAX_HARNESS_RESPONSE_BYTES } from './network.js';

function delay<T>(value: T, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), timeoutMs));
}

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

  it('rejects a response whose body never finishes within the request deadline', async () => {
    const responseWithHangingBody: typeof fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([123]));
      },
    }));
    const bodyRead = fetchWithTimeout('http://127.0.0.1', {}, 10, responseWithHangingBody)
      .then((response) => response.text());

    await expect(Promise.race([
      bodyRead.then(() => 'completed', () => 'rejected'),
      delay('deadline', 100),
    ])).resolves.toBe('rejected');
  });

  it('fails closed when a control-plane response exceeds the explicit body limit', async () => {
    const oversized = new Uint8Array(MAX_HARNESS_RESPONSE_BYTES + 1);
    const oversizedFetch: typeof fetch = async () => new Response(oversized);

    await expect(fetchWithTimeout('http://127.0.0.1', {}, 100, oversizedFetch)).rejects.toThrow('response_too_large');
  });

  it('returns a bounded reconstructed response that callers can read normally', async () => {
    const normalFetch: typeof fetch = async () => new Response('ready', {
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'text/plain', 'x-fixture': 'normal' },
    });

    const response = await fetchWithTimeout('http://127.0.0.1', {}, 100, normalFetch);

    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('x-fixture')).toBe('normal');
    await expect(response.text()).resolves.toBe('ready');
  });
});
