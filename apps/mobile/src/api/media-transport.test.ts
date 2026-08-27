import {
  finalizeMediaUpload,
  parseMediaFinalizationResponse,
  putReservedMedia,
  reserveMediaUpload,
} from './media-transport';

const supabaseUrl = 'https://storage.example.invalid';
const accessToken = 'access-token-that-must-not-be-retained';
const signedToken = 'signed-token-that-must-not-be-retained';
const responseUrl = `${supabaseUrl}/storage/v1/object/upload/sign/media-staging/jobs/job-12345678.jpg?token=${signedToken}`;
const receipt = {
  sanitizedSha256: 'a'.repeat(64),
  recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
  width: 640,
  height: 480,
  byteLength: 4,
  confirmedAtLocal: '2026-08-27T00:00:00.000Z',
} as const;
const reservationResponse = {
  jobId: 'job-12345678',
  mediaId: 'media-123456',
  reservationExpiresAt: '2026-08-27T00:10:00.000Z',
  uploadCredentialUsableUntil: '2026-08-27T02:00:00.000Z',
  upload: { signedUrl: responseUrl, token: signedToken },
};
const capability = {
  jobId: 'job-12345678',
  path: 'jobs/job-12345678.jpg',
  token: signedToken,
  usableUntil: '2026-08-27T02:00:00.000Z',
} as const;

function dependencies(fetch: typeof globalThis.fetch) {
  const deadlines = manualTransportDeadlines();
  return {
    fetch,
    supabaseUrl,
    now: () => new Date('2026-08-27T00:00:00.000Z'),
    insecureOrigins: [] as const,
    edgeRequestTimeoutMs: 30_000,
    uploadRequestTimeoutMs: 60_000,
    createAbortController: () => deadlines.createAbortController(),
    setTransportTimer: (callback: () => void, delayMs: number) => deadlines.set(callback, delayMs),
    clearTransportTimer: (handle: unknown) => deadlines.clear(handle),
  };
}

describe('private media transport', () => {
  it('posts the exact reservation request with strict bearer authentication and rejects redirects', async () => {
    const fetchMock = jest.fn(async () => {
      const response = new Response(JSON.stringify(reservationResponse), { status: 201 });
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    });

    await expect(reserveMediaUpload({
      sightingId: 'sighting-123456',
      mediaId: 'media-123456',
      receipt,
      accessToken,
    }, dependencies(fetchMock as unknown as typeof fetch))).rejects.toEqual({
      stage: 'reserve', kind: 'invalid_response', status: null, code: 'invalid_response',
    });
    expect(fetchMock).toHaveBeenCalledWith(`${supabaseUrl}/functions/v1/reserve-media-upload`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sightingId: 'sighting-123456',
        mediaId: 'media-123456',
        sha256: 'a'.repeat(64),
        byteLength: 4,
        review: {
          recipeVersion: 'jpeg-srgb-2048-q88.v1',
          detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
          width: 640,
          height: 480,
          confirmedAtLocal: '2026-08-27T00:00:00.000Z',
        },
      }),
      signal: expect.anything(),
    });
  });

  it('posts the exact finalization request with strict bearer authentication', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({
      mediaAssetId: '00000000-0000-4000-8000-000000000911', status: 'quarantined',
    }), { status: 200 }));

    await expect(finalizeMediaUpload({
      sightingId: 'sighting-123456',
      mediaId: 'media-123456',
      sha256: 'a'.repeat(64),
      accessToken,
    }, dependencies(fetchMock as unknown as typeof fetch))).resolves.toEqual({
      mediaAssetId: '00000000-0000-4000-8000-000000000911', status: 'quarantined',
    });
    expect(fetchMock).toHaveBeenCalledWith(`${supabaseUrl}/functions/v1/finalize-media-upload`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sightingId: 'sighting-123456', mediaId: 'media-123456', sha256: 'a'.repeat(64),
      }),
      signal: expect.anything(),
    });
  });

  it('returns a capability whose response URL has been discarded after validation', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify(reservationResponse), { status: 201 }));

    await expect(reserveMediaUpload({
      sightingId: 'sighting-123456', mediaId: 'media-123456', receipt, accessToken,
    }, dependencies(fetchMock as unknown as typeof fetch))).resolves.toEqual(capability);
  });

  it.each([
    ['an oversized success body', new Response('x'.repeat(64 * 1024 + 1), { status: 201 })],
    ['a malformed success body', new Response('{', { status: 201 })],
    ['an extra finalization field', new Response(JSON.stringify({
      mediaAssetId: '00000000-0000-4000-8000-000000000911', status: 'quarantined', extra: true,
    }), { status: 200 })],
  ])('reports %s as a bounded invalid response', async (_name, response) => {
    const fetchMock = jest.fn(async () => response);
    const operation = _name === 'an extra finalization field'
      ? finalizeMediaUpload({ sightingId: 'sighting-123456', mediaId: 'media-123456', sha256: 'a'.repeat(64), accessToken }, dependencies(fetchMock as unknown as typeof fetch))
      : reserveMediaUpload({ sightingId: 'sighting-123456', mediaId: 'media-123456', receipt, accessToken }, dependencies(fetchMock as unknown as typeof fetch));

    await expect(operation).rejects.toMatchObject({ kind: 'invalid_response', status: null, code: 'invalid_response' });
  });

  it('maps only allow-listed Edge error codes and drops the response body', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ error: 'authentication_required', body: 'never retain me' }), {
      status: 401,
    }));

    await expect(reserveMediaUpload({
      sightingId: 'sighting-123456', mediaId: 'media-123456', receipt, accessToken,
    }, dependencies(fetchMock as unknown as typeof fetch))).rejects.toEqual({
      stage: 'reserve', kind: 'http', status: 401, code: 'authentication_required',
    });
  });

  it.each([
    ['an empty unauthorized response', 401, null],
    ['a malformed conflict response', 409, '{malformed-error-body'],
    ['an oversized unavailable response', 503, 'oversized-error-body-'.repeat(4 * 1024)],
  ])('retains the HTTP status for %s without serializing its body', async (_name, status, body) => {
    const fetchMock = jest.fn(async () => new Response(body, { status }));

    try {
      await reserveMediaUpload({
        sightingId: 'sighting-123456', mediaId: 'media-123456', receipt, accessToken,
      }, dependencies(fetchMock as unknown as typeof fetch));
      throw new Error('expected transport failure');
    } catch (error) {
      expect(error).toEqual({
        stage: 'reserve', kind: 'http', status, code: 'media_transport_failed',
      });
      expect(JSON.stringify(error)).not.toContain(body ?? 'empty-response-body');
      expect(Object.keys(error as object).sort()).toEqual(['code', 'kind', 'stage', 'status']);
    }
  });

  it('reconstructs the signed PUT URL and sends the scoped artifact backing ArrayBuffer without auth headers', async () => {
    const fetchMock = jest.fn(async () => new Response(null, { status: 200 }));
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

    await expect(putReservedMedia({ capability, artifact: { bytes } }, dependencies(fetchMock as unknown as typeof fetch)))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `${supabaseUrl}/storage/v1/object/upload/sign/media-staging/jobs/job-12345678.jpg?token=${signedToken}`,
      {
        method: 'PUT',
        redirect: 'error',
        cache: 'no-store',
        headers: {
          'Content-Type': 'image/jpeg',
          'x-upsert': 'false',
          'Cache-Control': 'no-cache',
        },
        body: bytes.buffer,
        signal: expect.anything(),
      },
    );
  });

  it.each(['reserve', 'upload'] as const)(
    'aborts and bounds a never-resolving %s fetch without retaining its late result',
    async (stage) => {
      const late = deferred<Response>();
      const run = transportHarness(jest.fn(() => late.promise) as unknown as typeof fetch);
      const operation = stage === 'upload'
        ? putReservedMedia({ capability, artifact: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) } }, run.dependencies)
        : reserveMediaUpload({
          sightingId: 'sighting-123456', mediaId: 'media-123456', receipt, accessToken,
        }, run.dependencies);
      await run.deadlines.waitForActive();
      run.deadlines.fire();
      await expect(operation).rejects.toEqual({
        stage, kind: 'network', status: null, code: 'network_error',
      });
      expect(run.deadlines.activeCount()).toBe(0);
      expect(run.deadlines.controllers[0].signal.aborted).toBe(true);
      late.resolve(new Response(stage === 'reserve' ? JSON.stringify(reservationResponse) : null, { status: 200 }));
      await Promise.resolve();
      expect(run.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('aborts and bounds a never-resolving Edge response body read', async () => {
    const body = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) });
    const run = transportHarness(jest.fn(async () => new Response(body, { status: 201 })) as unknown as typeof fetch);
    const operation = reserveMediaUpload({
      sightingId: 'sighting-123456', mediaId: 'media-123456', receipt, accessToken,
    }, run.dependencies);
    await run.deadlines.waitForActive();
    run.deadlines.fire();
    await expect(operation).rejects.toEqual({
      stage: 'reserve', kind: 'network', status: null, code: 'network_error',
    });
    expect(run.deadlines.activeCount()).toBe(0);
  });

  it('clears the transport timer and external abort listener without aborting after success', async () => {
    const run = transportHarness(jest.fn(async () => new Response(JSON.stringify(reservationResponse), { status: 201 })) as unknown as typeof fetch);
    const external = new AbortController();
    const removeListener = jest.spyOn(external.signal, 'removeEventListener');
    await expect(reserveMediaUpload({
      sightingId: 'sighting-123456', mediaId: 'media-123456', receipt, accessToken,
      signal: external.signal,
    }, run.dependencies)).resolves.toEqual(capability);
    expect(run.deadlines.activeCount()).toBe(0);
    expect(run.deadlines.controllers[0].signal.aborted).toBe(false);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('fails closed when the supplied artifact is not one exact ArrayBuffer span', async () => {
    const fetchMock = jest.fn(async () => new Response(null, { status: 200 }));
    const backing = new ArrayBuffer(5);
    const slicedBytes = new Uint8Array(backing, 1, 4);

    await expect(putReservedMedia({ capability, artifact: { bytes: slicedBytes } }, dependencies(fetchMock as unknown as typeof fetch)))
      .rejects.toEqual({ stage: 'upload', kind: 'invalid_response', status: null, code: 'invalid_response' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serializes transport failures without any secret, URL, path, or response body', async () => {
    const responseBody = 'response-body-that-must-not-be-retained';
    const fetchMock = jest.fn(async () => {
      throw new Error(`${accessToken} ${signedToken} ${responseUrl} ${capability.path} ${responseBody}`);
    });

    try {
      await putReservedMedia({ capability, artifact: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) } }, dependencies(fetchMock as unknown as typeof fetch));
      throw new Error('expected transport failure');
    } catch (error) {
      const serialized = JSON.stringify(error);
      expect(error).toEqual({ stage: 'upload', kind: 'network', status: null, code: 'network_error' });
      for (const secret of [accessToken, signedToken, responseUrl, capability.path, responseBody]) {
        expect(serialized).not.toContain(secret);
      }
      expect(Object.keys(error as object).sort()).toEqual(['code', 'kind', 'stage', 'status']);
    }
  });

  it('accepts only the exact quarantined finalization response', () => {
    expect(parseMediaFinalizationResponse({
      mediaAssetId: '00000000-0000-4000-8000-000000000911', status: 'quarantined',
    })).toEqual({ mediaAssetId: '00000000-0000-4000-8000-000000000911', status: 'quarantined' });
    expect(() => parseMediaFinalizationResponse({
      mediaAssetId: '00000000-0000-4000-0000-000000000911', status: 'public',
    })).toThrow('invalid_media_finalization_response');
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function manualTransportDeadlines() {
  type Handle = { callback: () => void; active: boolean };
  const handles: Handle[] = [];
  const controllers: AbortController[] = [];
  return {
    controllers,
    createAbortController() {
      const controller = new AbortController();
      controllers.push(controller);
      return controller;
    },
    set(callback: () => void, _delayMs: number): Handle {
      const handle = { callback, active: true };
      handles.push(handle);
      return handle;
    },
    clear(handle: unknown) { (handle as Handle).active = false; },
    activeCount: () => handles.filter(({ active }) => active).length,
    fire() {
      for (const handle of handles) {
        if (!handle.active) continue;
        handle.active = false;
        handle.callback();
      }
    },
    async waitForActive() {
      for (let index = 0; index < 20; index += 1) {
        if (handles.some(({ active }) => active)) return;
        await Promise.resolve();
      }
      throw new Error('transport_timer_not_started');
    },
  };
}

function transportHarness(fetch: typeof globalThis.fetch) {
  const deadlines = manualTransportDeadlines();
  return {
    fetch,
    deadlines,
    dependencies: {
      ...dependencies(fetch),
      edgeRequestTimeoutMs: 30_000,
      uploadRequestTimeoutMs: 60_000,
      createAbortController: () => deadlines.createAbortController(),
      setTransportTimer: (callback: () => void, delayMs: number) => deadlines.set(callback, delayMs),
      clearTransportTimer: (handle: unknown) => deadlines.clear(handle),
    },
  };
}
