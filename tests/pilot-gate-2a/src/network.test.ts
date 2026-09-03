import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithTimeout, MAX_HARNESS_RESPONSE_BYTES } from './network.js';

function delay<T>(value: T, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), timeoutMs));
}

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts a request that does not settle before its deadline', async () => {
    let aborted = false;
    const hungFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    });

    await expect(fetchWithTimeout('http://127.0.0.1', {}, 1, hungFetch)).rejects.toThrow('request_timeout');
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

  it('does not classify a caller cancellation with timeout text as a harness timeout', async () => {
    const caller = new AbortController();
    const hungFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
    const errorResult = fetchWithTimeout('http://127.0.0.1', { signal: caller.signal }, 100, hungFetch)
      .then(() => undefined, (error: unknown) => error);
    caller.abort(new Error('request_timeout'));

    await expect(errorResult).resolves.toMatchObject({ message: 'request_aborted' });
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

  it('accepts a bodyless response whose declared representation exceeds the body limit', async () => {
    const declaredLength = String(MAX_HARNESS_RESPONSE_BYTES + 1);
    const bodylessFetch: typeof fetch = async () => new Response(null, {
      status: 200,
      statusText: 'Ready',
      headers: { 'content-length': declaredLength, 'x-fixture': 'bodyless' },
    });

    const response = await fetchWithTimeout('http://127.0.0.1', {}, 100, bodylessFetch);

    expect(response.status).toBe(200);
    expect(response.statusText).toBe('Ready');
    expect(response.headers.get('content-length')).toBe(declaredLength);
    expect(response.headers.get('x-fixture')).toBe('bodyless');
    expect(response.body).toBeNull();
  });

  it('returns a bounded reconstructed response that callers can read normally', async () => {
    const original = new Response('ready', {
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'text/plain', 'x-fixture': 'normal' },
    });
    Object.defineProperty(original, 'url', { value: 'https://fhugdtpjbgiatqhvjioy.supabase.co/auth/v1/settings' });
    const normalFetch: typeof fetch = async () => original;

    const response = await fetchWithTimeout('http://127.0.0.1', {}, 100, normalFetch);

    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('x-fixture')).toBe('normal');
    expect(response.url).toBe('https://fhugdtpjbgiatqhvjioy.supabase.co/auth/v1/settings');
    await expect(response.text()).resolves.toBe('ready');
  });
});
