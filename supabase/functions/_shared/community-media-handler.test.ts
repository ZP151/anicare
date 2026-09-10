import { describe, expect, it } from 'vitest';

import { createCommunityMediaHandler, parseCommunityMediaRequest, type CommunityMediaDependencies } from './community-media-handler.js';
import { deterministicJpegFixture } from '../../../tests/pilot-gate-2a/src/jpeg-fixture.js';

const SHA = 'a'.repeat(64);
const REQUEST_ID = '00000000-0000-4000-8000-000000003701';

describe('community media request parser', () => {
  it('accepts exactly two bounded JPEG variants for a reserve request', () => {
    expect(parseCommunityMediaRequest({
      action: 'reserve', requestId: REQUEST_ID,
      thumb: { sha256: SHA, byteLength: 512, width: 480, height: 320 },
      display: { sha256: SHA, byteLength: 4096, width: 2048, height: 1365 },
    })).toEqual({
      action: 'reserve', requestId: REQUEST_ID,
      thumb: { sha256: SHA, byteLength: 512, width: 480, height: 320 },
      display: { sha256: SHA, byteLength: 4096, width: 2048, height: 1365 },
    });
  });

  it('rejects a display variant that exceeds the image contract', () => {
    expect(() => parseCommunityMediaRequest({
      action: 'reserve', requestId: REQUEST_ID,
      thumb: { sha256: SHA, byteLength: 512, width: 480, height: 320 },
      display: { sha256: SHA, byteLength: 4 * 1024 * 1024 + 1, width: 2048, height: 1365 },
    })).toThrow('invalid_community_media_request');
  });

  it('rejects a request with unrecognised fields so path and variant choice stay server-owned', () => {
    expect(() => parseCommunityMediaRequest({ action: 'finalize', jobId: REQUEST_ID, variant: 'display' }))
      .toThrow('invalid_community_media_request');
  });
});

describe('community media handler', () => {
  it('finalizes only after both inspected JPEG variants match the reservation', async () => {
    const jpeg = deterministicJpegFixture();
    const dependencies: CommunityMediaDependencies = {
      allowedOrigin: 'https://app.example.test', serviceAvailable: true,
      authenticate: async () => '00000000-0000-4000-8000-000000003701',
      reserve: async () => ({ jobId: REQUEST_ID, reservationExpiresAt: new Date(Date.now() + 60_000).toISOString(), thumbPath: `media/${REQUEST_ID}/thumb.jpg`, displayPath: `media/${REQUEST_ID}/display.jpg` }),
      createSignedUpload: async path => ({ signedUrl: `https://uploads.example.test/${path}`, token: 'opaque' }),
      getJob: async () => ({ status: 'reserved', reservationExpiresAt: new Date(Date.now() + 60_000).toISOString(), thumb: { ...jpeg, path: `media/${REQUEST_ID}/thumb.jpg`, byteLength: jpeg.bytes.byteLength }, display: { ...jpeg, path: `media/${REQUEST_ID}/display.jpg`, byteLength: jpeg.bytes.byteLength } }),
      download: async () => new Blob([jpeg.bytes], { type: 'image/jpeg' }),
      finalize: async () => REQUEST_ID,
      resolve: async () => null,
    };
    const response = await createCommunityMediaHandler(dependencies)(new Request('https://project.test/community-media', { method: 'POST', headers: { origin: 'https://app.example.test', authorization: 'Bearer access', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'finalize', jobId: REQUEST_ID }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaId: REQUEST_ID });
  });

  it('refuses invalid bearer identity on a public read instead of treating it as a guest', async () => {
    const dependencies: CommunityMediaDependencies = {
      allowedOrigin: 'https://app.example.test', serviceAvailable: true,
      authenticate: async () => null, reserve: async () => null, createSignedUpload: async () => null,
      getJob: async () => null, download: async () => null, finalize: async () => null, resolve: async () => null,
    };
    const response = await createCommunityMediaHandler(dependencies)(new Request(`https://project.test/community-media?postId=${REQUEST_ID}&mediaId=${REQUEST_ID}&variant=thumb`, { headers: { origin: 'https://app.example.test', authorization: 'Bearer invalid' } }));
    expect(response.status).toBe(401);
  });
});
