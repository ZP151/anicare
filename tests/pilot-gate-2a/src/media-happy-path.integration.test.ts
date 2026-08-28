import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { deleteMedia, finalizeMedia, putSignedMedia, reserveMedia, type ReserveInput } from './actors.js';
import { readLocalStackEnvironment, type LocalStackEnvironment } from './environment.js';
import { createSyntheticScenario, destroySyntheticScenario, type SyntheticActor } from './fixtures.js';
import { inspectFinalizedMedia } from './inspection.js';
import { deterministicJpegFixture } from './jpeg-fixture.js';
import { fetchWithTimeout } from './network.js';

const PRIVATE_READ_TIMEOUT_MS = 5_000;
const DENIED_STATUSES = new Set([400, 401, 403, 404, 406]);

function clientHeaders(env: LocalStackEnvironment, actor: SyntheticActor | null): HeadersInit {
  const bearer = actor?.accessToken ?? env.anonKey;
  return { apikey: env.anonKey, Authorization: `Bearer ${bearer}` };
}

async function boundedPrivateRead(
  env: LocalStackEnvironment,
  actor: SyntheticActor | null,
  url: string,
  headers: HeadersInit = {},
): Promise<Response> {
  return fetchWithTimeout(url, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    headers: { ...clientHeaders(env, actor), ...headers },
  }, PRIVATE_READ_TIMEOUT_MS);
}

async function expectStorageReadDenied(
  env: LocalStackEnvironment,
  actor: SyntheticActor | null,
  objectPath: string,
): Promise<void> {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const response = await boundedPrivateRead(
    env,
    actor,
    `${env.apiUrl}/storage/v1/object/media-staging/${encodedPath}`,
  );
  expect(response.ok).toBe(false);
  expect(DENIED_STATUSES.has(response.status)).toBe(true);
}

async function expectPrivateJobReadDenied(
  env: LocalStackEnvironment,
  actor: SyntheticActor | null,
  mediaId: string,
): Promise<void> {
  const query = new URLSearchParams({ select: 'id', media_id: `eq.${mediaId}`, limit: '1' });
  const response = await boundedPrivateRead(
    env,
    actor,
    `${env.apiUrl}/rest/v1/media_upload_jobs?${query.toString()}`,
    { 'Accept-Profile': 'private' },
  );
  expect(response.ok).toBe(false);
  expect(DENIED_STATUSES.has(response.status)).toBe(true);
}

async function expectAssetStateReadDenied(
  env: LocalStackEnvironment,
  actor: SyntheticActor | null,
  mediaId: string,
): Promise<void> {
  const query = new URLSearchParams({ select: 'id', client_media_id: `eq.${mediaId}`, limit: '1' });
  const response = await boundedPrivateRead(env, actor, `${env.apiUrl}/rest/v1/media_assets?${query.toString()}`);
  expect(response.ok).toBe(false);
  expect(DENIED_STATUSES.has(response.status)).toBe(true);
}

describe('real owner media happy path', () => {
  it('reserves, performs a non-upsert signed PUT and idempotently finalizes one quarantined asset', async () => {
    const env = readLocalStackEnvironment(process.env);
    const scenario = await createSyntheticScenario(env);
    let mediaAssetId: string | undefined;
    try {
      const jpeg = deterministicJpegFixture();
      const mediaId = randomUUID();
      const receipt: ReserveInput = {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
        byteLength: jpeg.bytes.byteLength,
        review: {
          recipeVersion: 'jpeg-srgb-2048-q88.v1',
          detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
          width: jpeg.width,
          height: jpeg.height,
          confirmedAtLocal: new Date().toISOString(),
        },
      };

      const reservation = await reserveMedia(scenario.owner, receipt, env);
      expect(reservation.mediaId).toBe(mediaId);
      expect(reservation.path === `jobs/${reservation.jobId}.jpg`).toBe(true);
      const signedUrl = new URL(reservation.signedUploadUrl);
      expect(signedUrl.origin).toBe(new URL(env.apiUrl).origin);
      expect(signedUrl.hostname).toBe('127.0.0.1');
      expect(Date.parse(reservation.reservationExpiresAt)).toBeGreaterThan(Date.now());
      expect(Date.parse(reservation.uploadCredentialUsableUntil)).toBeGreaterThan(
        Date.parse(reservation.reservationExpiresAt),
      );

      await expectPrivateJobReadDenied(env, null, mediaId);
      await expectPrivateJobReadDenied(env, scenario.stranger, mediaId);

      expect(await putSignedMedia(reservation, jpeg.bytes)).toEqual({ ok: true, status: 200 });
      await expectStorageReadDenied(env, null, reservation.path);
      await expectStorageReadDenied(env, scenario.stranger, reservation.path);

      const finalizeInput = {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
      };
      const finalized = await finalizeMedia(scenario.owner, finalizeInput, env);
      expect(finalized.ok).toBe(true);
      if (!finalized.ok || !finalized.mediaAssetId) throw new Error('owner_media_finalization_failed');
      mediaAssetId = finalized.mediaAssetId;

      const inspection = await inspectFinalizedMedia(env, {
        ownerId: scenario.owner.id,
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
        byteLength: jpeg.bytes.byteLength,
        width: jpeg.width,
        height: jpeg.height,
        mediaAssetId,
      });
      expect(inspection).toEqual({
        assetCountForMediaId: 1,
        matchingQuarantinedAssetCount: 1,
        jobCountForMediaId: 1,
        matchingFinalizedJobCount: 1,
      });

      await expectStorageReadDenied(env, null, reservation.path);
      await expectStorageReadDenied(env, scenario.stranger, reservation.path);
      await expectAssetStateReadDenied(env, null, mediaId);
      await expectAssetStateReadDenied(env, scenario.stranger, mediaId);
      await expectPrivateJobReadDenied(env, null, mediaId);
      await expectPrivateJobReadDenied(env, scenario.stranger, mediaId);

      const repeated = await finalizeMedia(scenario.owner, finalizeInput, env);
      expect(repeated).toEqual({ ok: true, status: 200, mediaAssetId });
      await expect(inspectFinalizedMedia(env, {
        ownerId: scenario.owner.id,
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
        byteLength: jpeg.bytes.byteLength,
        width: jpeg.width,
        height: jpeg.height,
        mediaAssetId,
      })).resolves.toEqual({
        assetCountForMediaId: 1,
        matchingQuarantinedAssetCount: 1,
        jobCountForMediaId: 1,
        matchingFinalizedJobCount: 1,
      });

      expect(await deleteMedia(scenario.owner, mediaAssetId, env)).toEqual({ ok: true, status: 200, deleted: true });
    } finally {
      await destroySyntheticScenario(env, scenario);
    }
  }, 60_000);
});
