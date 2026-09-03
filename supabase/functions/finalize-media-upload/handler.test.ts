import { describe, expect, it, vi } from 'vitest';

import { deterministicJpegFixture } from '../../../tests/pilot-gate-2a/src/jpeg-fixture.js';
import {
  createFinalizeMediaUploadHandler,
  type FinalizeMediaUploadDependencies,
  type FinalizeTimingEvent,
} from './handler.js';

const USER_ID = '00000000-0000-0000-0000-000000000111';
const SIGHTING_ID = '00000000-0000-0000-0000-000000000222';
const JOB_ID = '00000000-0000-0000-0000-000000000333';
const ASSET_ID = '00000000-0000-0000-0000-000000000444';
const MEDIA_ID = 'media-finalize-123';
const ORIGIN = 'https://app.example.test';

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const jpeg = deterministicJpegFixture();
  return {
    job_id: JOB_ID,
    object_path: `jobs/${JOB_ID}.jpg`,
    sha256: jpeg.sha256,
    byte_length: jpeg.bytes.byteLength,
    width: jpeg.width,
    height: jpeg.height,
    recipe_version: 'jpeg-srgb-2048-q88.v1',
    detector_versions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
    confirmed_at_local: new Date().toISOString(),
    reservation_expires_at: new Date(Date.now() + 60_000).toISOString(),
    status: 'reserved',
    media_asset_id: null,
    media_deleted_at: null,
    ...overrides,
  };
}

function request(): Request {
  const jpeg = deterministicJpegFixture();
  return new Request('https://project.supabase.co/functions/v1/finalize-media-upload', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      origin: ORIGIN,
    },
    body: JSON.stringify({ sightingId: SIGHTING_ID, mediaId: MEDIA_ID, sha256: jpeg.sha256 }),
  });
}

function dependencies(overrides: Partial<FinalizeMediaUploadDependencies> = {}) {
  const jpeg = deterministicJpegFixture();
  let clock = 0;
  const timings: FinalizeTimingEvent[] = [];
  const value: FinalizeMediaUploadDependencies = {
    allowedOrigin: ORIGIN,
    serviceAvailable: true,
    authenticate: vi.fn(async () => USER_ID),
    preflight: vi.fn(async () => job()),
    download: vi.fn(async () => new Blob([jpeg.bytes], { type: 'image/jpeg' })),
    finalize: vi.fn(async () => ASSET_ID),
    now: () => { clock += 1; return clock; },
    onTiming: (timing) => { timings.push(timing); },
    ...overrides,
  };
  return { value, timings };
}

describe('finalize media upload handler', () => {
  it('runs one preflight before storage and finalization and emits only fixed timing fields', async () => {
    const order: string[] = [];
    const fixture = dependencies({
      authenticate: async () => { order.push('auth'); return USER_ID; },
      preflight: async () => { order.push('preflight'); return job(); },
      download: async () => {
        order.push('download');
        const jpeg = deterministicJpegFixture();
        return new Blob([jpeg.bytes], { type: 'image/jpeg' });
      },
      finalize: async () => { order.push('finalize'); return ASSET_ID; },
    });

    const response = await createFinalizeMediaUploadHandler(fixture.value)(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaAssetId: ASSET_ID, status: 'quarantined' });
    expect(order).toEqual(['auth', 'preflight', 'download', 'finalize']);
    expect(fixture.timings).toHaveLength(1);
    expect(Object.keys(fixture.timings[0]!)).toEqual([
      'outcome',
      'request_parse_ms',
      'auth_ms',
      'db_preflight_ms',
      'storage_download_ms',
      'media_validation_ms',
      'finalize_rpc_ms',
      'total_ms',
    ]);
    expect(fixture.timings[0]).toMatchObject({ outcome: 'success' });
    expect(Object.values(fixture.timings[0]!).slice(1).every(
      (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    )).toBe(true);
    expect(JSON.stringify(fixture.timings)).not.toMatch(/jobs\/|00000000|test-token|media-finalize/i);
  });

  it('returns an active finalized asset without storage or transaction work', async () => {
    const fixture = dependencies({
      preflight: async () => job({ status: 'finalized', media_asset_id: ASSET_ID }),
    });

    const response = await createFinalizeMediaUploadHandler(fixture.value)(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mediaAssetId: ASSET_ID, status: 'quarantined' });
    expect(fixture.value.download).not.toHaveBeenCalled();
    expect(fixture.value.finalize).not.toHaveBeenCalled();
    expect(fixture.timings).toHaveLength(1);
    expect(fixture.timings[0]?.outcome).toBe('success');
  });

  it('keeps authorization denial indistinguishable and still emits one safe timing event', async () => {
    const fixture = dependencies({ preflight: async () => null });

    const response = await createFinalizeMediaUploadHandler(fixture.value)(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'media_not_found_or_forbidden' });
    expect(fixture.value.download).not.toHaveBeenCalled();
    expect(fixture.value.finalize).not.toHaveBeenCalled();
    expect(fixture.timings).toHaveLength(1);
    expect(fixture.timings[0]?.outcome).toBe('authorization_denied');
  });

  it('preserves the service-unavailable response before calling remote dependencies', async () => {
    const fixture = dependencies({ serviceAvailable: false });

    const response = await createFinalizeMediaUploadHandler(fixture.value)(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'service_unavailable' });
    expect(fixture.value.authenticate).not.toHaveBeenCalled();
    expect(fixture.value.preflight).not.toHaveBeenCalled();
    expect(fixture.timings).toHaveLength(1);
    expect(fixture.timings[0]?.outcome).toBe('internal_failure');
  });
});
