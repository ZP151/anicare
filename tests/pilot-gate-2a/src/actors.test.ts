import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LocalStackEnvironment } from './environment.js';
import {
  deleteMedia,
  finalizeMedia,
  putSignedMedia,
  reserveMedia,
  type FinalizeInput,
  type Reservation,
  type ReserveInput,
} from './actors.js';

const UUID_JOB = '11111111-1111-4111-8111-111111111111';
const UUID_MEDIA = '22222222-2222-4222-8222-222222222222';
const UUID_SIGHTING = '33333333-3333-4333-8333-333333333333';
const UUID_ASSET = '44444444-4444-4444-8444-444444444444';

function localEnvironment(): LocalStackEnvironment {
  const apiUrl = ['http:', '//127.0.0.1:54321'].join('');
  return {
    apiUrl,
    anonKey: ['local', 'anon', randomUUID()].join('-'),
    serviceRoleKey: ['local', 'service', randomUUID()].join('-'),
    databaseUrl: ['postgresql:', '//', 'postgres', ':', 'postgres', '@127.0.0.1:54322/postgres'].join(''),
    allowedOrigin: apiUrl,
    preciseLocationEncryptionKey: Buffer.alloc(32, 17).toString('base64'),
  };
}

function actor() {
  return { id: randomUUID(), accessToken: ['actor', 'access', randomUUID()].join('-') };
}

function reserveInput(): ReserveInput {
  return {
    sightingId: UUID_SIGHTING,
    mediaId: UUID_MEDIA,
    sha256: 'a'.repeat(64),
    byteLength: 631,
    review: {
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 1,
      height: 1,
      confirmedAtLocal: new Date(Date.now() - 1_000).toISOString(),
    },
  };
}

function finalizeInput(): FinalizeInput {
  return { sightingId: UUID_SIGHTING, mediaId: UUID_MEDIA, sha256: 'a'.repeat(64) };
}

function reservationResponse(env: LocalStackEnvironment) {
  const token = ['signed', 'upload', randomUUID()].join('-');
  const path = ['jobs', `${UUID_JOB}.jpg`].join('/');
  const signedUploadUrl = new URL(
    ['/storage/v1/object/upload/sign/media-staging', path].join('/'),
    env.apiUrl,
  );
  signedUploadUrl.searchParams.set('token', token);
  return {
    body: {
      jobId: UUID_JOB,
      mediaId: UUID_MEDIA,
      reservationExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      uploadCredentialUsableUntil: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      upload: { signedUrl: signedUploadUrl.toString(), token },
    },
    path,
    signedUploadUrl: signedUploadUrl.toString(),
  };
}

function reservation(env: LocalStackEnvironment): Reservation {
  const fixture = reservationResponse(env);
  return {
    jobId: UUID_JOB,
    mediaId: UUID_MEDIA,
    path: fixture.path,
    reservationExpiresAt: fixture.body.reservationExpiresAt,
    uploadCredentialUsableUntil: fixture.body.uploadCredentialUsableUntil,
    signedUploadUrl: fixture.signedUploadUrl,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('owner media actors', () => {
  it('maps the exact owner reservation request and retains only a validated in-memory capability', async () => {
    const env = localEnvironment();
    const owner = actor();
    const input = reserveInput();
    const response = reservationResponse(env);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response.body), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await reserveMedia(owner, input, env);
    expect({
      jobId: result.jobId,
      mediaId: result.mediaId,
      reservationExpiresAt: result.reservationExpiresAt,
      uploadCredentialUsableUntil: result.uploadCredentialUsableUntil,
    }).toEqual({
      jobId: UUID_JOB,
      mediaId: UUID_MEDIA,
      reservationExpiresAt: response.body.reservationExpiresAt,
      uploadCredentialUsableUntil: response.body.uploadCredentialUsableUntil,
    });
    expect(Object.keys(result).sort()).toEqual([
      'jobId',
      'mediaId',
      'path',
      'reservationExpiresAt',
      'signedUploadUrl',
      'uploadCredentialUsableUntil',
    ]);
    expect(result.path === response.path && result.signedUploadUrl === response.signedUploadUrl).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[0]!;
    expect(url).toBe(`${env.apiUrl}/functions/v1/reserve-media-upload`);
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${owner.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      sightingId: UUID_SIGHTING,
      mediaId: UUID_MEDIA,
      sha256: 'a'.repeat(64),
      byteLength: 631,
      review: input.review,
    });
  });

  it('rejects redirected and non-exact reservation responses without retaining their contents', async () => {
    const env = localEnvironment();
    const owner = actor();
    const response = reservationResponse(env);
    const redirected = new Response(JSON.stringify(response.body), { status: 201 });
    Object.defineProperty(redirected, 'redirected', { value: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirected)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...response.body, extra: 'discard-me' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(reserveMedia(owner, reserveInput(), env)).rejects.toEqual({
      stage: 'reserve', kind: 'invalid_response', status: null, code: 'invalid_response',
    });
    await expect(reserveMedia(owner, reserveInput(), env)).rejects.toEqual({
      stage: 'reserve', kind: 'invalid_response', status: null, code: 'invalid_response',
    });
  });

  it('normalizes HTTP errors and drops credentials, capabilities and response payloads', async () => {
    const env = localEnvironment();
    const owner = actor();
    const response = reservationResponse(env);
    const payloadMarker = ['response', 'payload', randomUUID()].join('-');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'authentication_required',
      detail: `${payloadMarker} ${owner.accessToken} ${response.signedUploadUrl}`,
    }), { status: 401 })));

    try {
      await reserveMedia(owner, reserveInput(), env);
      throw new Error('expected reservation failure');
    } catch (error) {
      expect(error).toEqual({ stage: 'reserve', kind: 'http', status: 401, code: 'authentication_required' });
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(payloadMarker);
      expect(serialized).not.toContain(owner.accessToken);
      expect(serialized).not.toContain(response.signedUploadUrl);
    }
  });

  it('performs the signed JPEG PUT with non-upsert semantics and no actor credential', async () => {
    const env = localEnvironment();
    const capability = reservation(env);
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      Key: ['media-staging', capability.path].join('/'),
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(putSignedMedia(capability, bytes)).resolves.toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[0]!;
    expect(url === capability.signedUploadUrl).toBe(true);
    expect(init).toMatchObject({
      method: 'PUT',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
        'Cache-Control': 'no-cache',
      },
    });
    expect(init?.headers).not.toHaveProperty('Authorization');
    expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(bytes);
  });

  it('refuses a stale signed capability before starting an upload', async () => {
    const env = localEnvironment();
    const stale = {
      ...reservation(env),
      reservationExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      Key: ['media-staging', stale.path].join('/'),
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(putSignedMedia(stale, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).resolves.toEqual({
      ok: false, stage: 'upload', kind: 'invalid_response', status: null, code: 'invalid_response',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps the exact finalization request and accepts only one quarantined asset response', async () => {
    const env = localEnvironment();
    const owner = actor();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      mediaAssetId: UUID_ASSET,
      status: 'quarantined',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(finalizeMedia(owner, finalizeInput(), env)).resolves.toEqual({
      ok: true, status: 200, mediaAssetId: UUID_ASSET,
    });
    const [url, init] = (fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[0]!;
    expect(url).toBe(`${env.apiUrl}/functions/v1/finalize-media-upload`);
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${owner.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual(finalizeInput());

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      mediaAssetId: UUID_ASSET, status: 'quarantined', duplicate: true,
    }), { status: 200 }));
    await expect(finalizeMedia(owner, finalizeInput(), env)).resolves.toEqual({
      ok: false, stage: 'finalize', kind: 'invalid_response', status: null, code: 'invalid_response',
    });
  });

  it('maps deletion and accepts only the exact deletion acknowledgement', async () => {
    const env = localEnvironment();
    const owner = actor();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true, path: 'discard-me' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteMedia(owner, UUID_ASSET, env)).resolves.toEqual({ ok: true, status: 200, deleted: true });
    const [url, init] = (fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[0]!;
    expect(url).toBe(`${env.apiUrl}/functions/v1/delete-media`);
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${owner.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({ mediaId: UUID_ASSET });
    await expect(deleteMedia(owner, UUID_ASSET, env)).resolves.toEqual({
      ok: false, stage: 'delete', kind: 'invalid_response', status: null, code: 'invalid_response',
    });
  });
});
