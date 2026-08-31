import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  deleteMedia,
  finalizeMedia,
  putSignedMedia,
  reserveMedia,
  type ActorResult,
  type ReserveInput,
} from './actors.js';
import { readLocalStackEnvironment, type LocalStackEnvironment } from './environment.js';
import { edgeEndpointUrl } from './edge-endpoints.js';
import { createSyntheticScenario, destroySyntheticScenario } from './fixtures.js';
import { isExactActorResultFailure } from './media-failure-shape.js';
import { classifyActorResult } from './media-diagnostic-outcomes.js';
import {
  controlMediaLifecycleTimestamps,
  inspectMediaLifecycle,
  inspectStoredStagingObject,
} from './inspection.js';
import { deterministicJpegFixture } from './jpeg-fixture.js';
import { fetchWithTimeout } from './network.js';

const CLEANUP_TIMEOUT_MS = 5_000;
const MAX_CLEANUP_JOBS = 25;

type CleanupResult = Readonly<{ processed: number; removed: number }>;

function receipt(
  sightingId: string,
  mediaId: string,
  sha256: string,
  byteLength: number,
  width: number,
  height: number,
): ReserveInput {
  return {
    sightingId,
    mediaId,
    sha256,
    byteLength,
    review: {
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width,
      height,
      confirmedAtLocal: new Date().toISOString(),
    },
  };
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function cleanupResult(value: unknown): CleanupResult | null {
  if (!exactObject(value, ['processed', 'removed'])) return null;
  if (!Number.isInteger(value.processed) || !Number.isInteger(value.removed)) return null;
  const processed = value.processed as number;
  const removed = value.removed as number;
  return processed >= 0 && processed <= MAX_CLEANUP_JOBS && removed >= 0 && removed <= processed
    ? { processed, removed }
    : null;
}

async function invokeCleanup(env: LocalStackEnvironment): Promise<CleanupResult> {
  let response: Response;
  try {
    response = await fetchWithTimeout(edgeEndpointUrl(env.apiUrl, 'cleanupMediaStaging'), {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${env.serviceRoleKey}` },
    }, CLEANUP_TIMEOUT_MS);
  } catch {
    throw new Error('media_cleanup_request_failed');
  }
  const result = cleanupResult(await response.json().catch(() => null));
  if (response.status !== 200 || response.redirected || !result) {
    throw new Error('media_cleanup_request_failed');
  }
  return result;
}

function strangerDeleteDenied(value: ActorResult): boolean {
  return isExactActorResultFailure(value, {
    stage: 'delete', status: 403, code: 'media_not_found_or_forbidden',
  });
}

function signedReplayFailed(value: ActorResult): boolean {
  return isExactActorResultFailure(value, {
    stage: 'upload', status: 400, code: 'storage_upload_failed',
  });
}

describe('media expiry, deletion and cleanup lifecycle', () => {
  it('expires finalization, removes and retries the staged object, and leaves the minted upload token usable', async () => {
    const env = readLocalStackEnvironment(process.env);
    const scenario = await createSyntheticScenario(env);
    try {
      const jpeg = deterministicJpegFixture();
      const mediaId = randomUUID();
      const reservation = await reserveMedia(scenario.owner, receipt(
        scenario.ownerSightingId,
        mediaId,
        jpeg.sha256,
        jpeg.bytes.byteLength,
        jpeg.width,
        jpeg.height,
      ), env);
      expect(await putSignedMedia(reservation, jpeg.bytes)).toEqual({ ok: true, status: 200 });
      expect(strangerDeleteDenied(await deleteMedia(scenario.stranger, reservation.jobId, env))).toBe(true);

      await controlMediaLifecycleTimestamps(env, {
        operation: 'expire_reservation',
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      });
      expect(await inspectMediaLifecycle(env, {
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      })).toEqual({
        jobCount: 1,
        assetCount: 0,
        jobStatus: 'reserved',
        reservationExpired: true,
        uploadCredentialWatermarkInFuture: true,
        cleanupScheduledInFuture: false,
        cleanupClaimed: false,
        assetTombstoned: false,
        stagingObjectExists: true,
      });
      expect(strangerDeleteDenied(await deleteMedia(scenario.stranger, reservation.jobId, env))).toBe(true);

      const expiredFinalization = await finalizeMedia(scenario.owner, {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
      }, env);
      expect(isExactActorResultFailure(expiredFinalization, {
        stage: 'finalize', status: 409, code: 'media_finalization_conflict',
      })).toBe(true);

      const firstCleanup = await invokeCleanup(env);
      expect(firstCleanup.processed).toBeGreaterThan(0);
      expect(firstCleanup.removed).toBeGreaterThan(0);
      expect(await inspectMediaLifecycle(env, {
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      })).toEqual({
        jobCount: 1,
        assetCount: 0,
        jobStatus: 'reserved',
        reservationExpired: true,
        uploadCredentialWatermarkInFuture: true,
        cleanupScheduledInFuture: true,
        cleanupClaimed: false,
        assetTombstoned: false,
        stagingObjectExists: false,
      });
      expect(strangerDeleteDenied(await deleteMedia(scenario.stranger, reservation.jobId, env))).toBe(true);

      expect(await putSignedMedia(reservation, jpeg.bytes)).toEqual({ ok: true, status: 200 });
      await controlMediaLifecycleTimestamps(env, {
        operation: 'schedule_cleanup_now',
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      });
      const secondCleanup = await invokeCleanup(env);
      expect(secondCleanup.processed).toBeGreaterThan(0);
      expect(secondCleanup.removed).toBeGreaterThan(0);
      expect(await inspectMediaLifecycle(env, {
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      })).toEqual({
        jobCount: 1,
        assetCount: 0,
        jobStatus: 'reserved',
        reservationExpired: true,
        uploadCredentialWatermarkInFuture: true,
        cleanupScheduledInFuture: true,
        cleanupClaimed: false,
        assetTombstoned: false,
        stagingObjectExists: false,
      });
    } finally {
      await destroySyntheticScenario(env, scenario);
    }
  }, 90_000);

  it('tombstones finalized media but retains its object until the real upload token lifetime passes', async () => {
    const env = readLocalStackEnvironment(process.env);
    const scenario = await createSyntheticScenario(env);
    try {
      const jpeg = deterministicJpegFixture();
      const mediaId = randomUUID();
      const reservation = await reserveMedia(scenario.owner, receipt(
        scenario.ownerSightingId,
        mediaId,
        jpeg.sha256,
        jpeg.bytes.byteLength,
        jpeg.width,
        jpeg.height,
      ), env);
      expect(await putSignedMedia(reservation, jpeg.bytes)).toEqual({ ok: true, status: 200 });
      const finalized = await finalizeMedia(scenario.owner, {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
      }, env);
      expect(finalized.ok).toBe(true);
      if (!finalized.ok || !finalized.mediaAssetId) throw new Error('owner_media_finalization_failed');

      expect(strangerDeleteDenied(await deleteMedia(
        scenario.stranger, finalized.mediaAssetId, env,
      ))).toBe(true);
      expect(await deleteMedia(scenario.owner, finalized.mediaAssetId, env)).toEqual({
        ok: true, status: 200, deleted: true,
      });
      expect(strangerDeleteDenied(await deleteMedia(
        scenario.stranger, finalized.mediaAssetId, env,
      ))).toBe(true);
      expect(await inspectMediaLifecycle(env, {
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      })).toEqual({
        jobCount: 1,
        assetCount: 1,
        jobStatus: 'deletion_pending',
        reservationExpired: false,
        uploadCredentialWatermarkInFuture: true,
        cleanupScheduledInFuture: true,
        cleanupClaimed: false,
        assetTombstoned: true,
        stagingObjectExists: true,
      });

      await controlMediaLifecycleTimestamps(env, {
        operation: 'schedule_cleanup_now',
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      });
      expect((await inspectMediaLifecycle(env, {
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      })).cleanupScheduledInFuture).toBe(false);
      const cleanup = await invokeCleanup(env);
      expect(cleanup.processed).toBeGreaterThan(0);
      expect(await inspectMediaLifecycle(env, {
        jobId: reservation.jobId,
        ownerId: scenario.owner.id,
        mediaId,
      })).toEqual({
        jobCount: 1,
        assetCount: 1,
        jobStatus: 'deletion_pending',
        reservationExpired: false,
        uploadCredentialWatermarkInFuture: true,
        cleanupScheduledInFuture: true,
        cleanupClaimed: false,
        assetTombstoned: true,
        stagingObjectExists: true,
      });

      const replayBytes = jpeg.bytes.slice();
      replayBytes[replayBytes.byteLength - 2] = replayBytes[replayBytes.byteLength - 2]! ^ 1;
      const replayResult = await putSignedMedia(reservation, replayBytes);
      if (!signedReplayFailed(replayResult)) {
        throw new Error(`lifecycle_signed_replay_${classifyActorResult(replayResult)}`);
      }
      await expect(inspectStoredStagingObject(env, {
        jobId: reservation.jobId,
        sha256: jpeg.sha256,
        byteLength: jpeg.bytes.byteLength,
      })).resolves.toEqual({ objectHashMatches: true, objectLengthMatches: true });
      expect(strangerDeleteDenied(await deleteMedia(
        scenario.stranger, finalized.mediaAssetId, env,
      ))).toBe(true);

      // Deliberately unresolved here: real post-token-expiry purge and replay
      // require the fixed Storage lifetime to pass or separately approved clock control.
    } finally {
      await destroySyntheticScenario(env, scenario);
    }
  }, 90_000);
});
