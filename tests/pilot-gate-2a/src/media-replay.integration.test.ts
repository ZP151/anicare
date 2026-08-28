import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  finalizeMedia,
  putSignedMedia,
  reserveMedia,
  type ActorResult,
  type ReserveInput,
} from './actors.js';
import { readLocalStackEnvironment } from './environment.js';
import { createSyntheticScenario, destroySyntheticScenario } from './fixtures.js';
import { inspectFinalizedMedia, inspectStoredStagingObject } from './inspection.js';
import { deterministicJpegFixture } from './jpeg-fixture.js';

type ReserveFailure = Readonly<{
  stage: 'reserve';
  kind: 'http';
  status: 409;
  code: 'media_reservation_conflict';
}>;

function receipt(sightingId: string, mediaId: string, sha256: string, byteLength: number, width: number, height: number): ReserveInput {
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

function exactReserveConflict(value: unknown): value is ReserveFailure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  return Object.keys(actual).length === 5 && actual.stage === 'reserve' && actual.kind === 'http' &&
    actual.status === 409 && actual.code === 'media_reservation_conflict';
}

async function expectReserveConflict(action: Promise<unknown>): Promise<void> {
  try {
    await action;
  } catch (error) {
    expect(exactReserveConflict(error)).toBe(true);
    return;
  }
  expect(false).toBe(true);
}

function isFinalizationNotFound(value: ActorResult): boolean {
  return !value.ok && value.stage === 'finalize' && value.kind === 'http' && value.status === 403 &&
    value.code === 'media_not_found_or_forbidden';
}

function isReplayPutFailure(value: ActorResult): boolean {
  return !value.ok && value.stage === 'upload' && value.kind === 'http' && value.status !== null;
}

function mismatchedSha256(sha256: string): string {
  const last = sha256.at(-1);
  return sha256.slice(0, -1).concat(last === 'a' ? 'b' : 'a');
}

describe('media capability replay boundaries', () => {
  it('rejects signed-PUT replay without changing the staged object or creating another asset', async () => {
    const env = readLocalStackEnvironment(process.env);
    const scenario = await createSyntheticScenario(env);
    try {
      const jpeg = deterministicJpegFixture();
      const mediaId = randomUUID();
      const originalReceipt = receipt(
        scenario.ownerSightingId,
        mediaId,
        jpeg.sha256,
        jpeg.bytes.byteLength,
        jpeg.width,
        jpeg.height,
      );
      const reservation = await reserveMedia(scenario.owner, originalReceipt, env);
      expect((await putSignedMedia(reservation, jpeg.bytes)).ok).toBe(true);

      await expect(inspectStoredStagingObject(env, {
        jobId: reservation.jobId,
        sha256: jpeg.sha256,
        byteLength: jpeg.bytes.byteLength,
      })).resolves.toEqual({ objectHashMatches: true, objectLengthMatches: true });

      const replayBytes = jpeg.bytes.slice();
      replayBytes[replayBytes.byteLength - 2] = replayBytes[replayBytes.byteLength - 2]! ^ 1;
      expect(isReplayPutFailure(await putSignedMedia(reservation, replayBytes))).toBe(true);
      await expect(inspectStoredStagingObject(env, {
        jobId: reservation.jobId,
        sha256: jpeg.sha256,
        byteLength: jpeg.bytes.byteLength,
      })).resolves.toEqual({ objectHashMatches: true, objectLengthMatches: true });

      const finalized = await finalizeMedia(scenario.owner, {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
      }, env);
      expect(finalized.ok).toBe(true);
      if (!finalized.ok || !finalized.mediaAssetId) throw new Error('owner_media_finalization_failed');

      const repeated = await finalizeMedia(scenario.owner, {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
      }, env);
      expect(repeated.ok && repeated.status === 200 && repeated.mediaAssetId === finalized.mediaAssetId).toBe(true);

      const mismatchedHash = mismatchedSha256(jpeg.sha256);
      await expectReserveConflict(reserveMedia(scenario.owner, receipt(
        scenario.ownerSightingId,
        mediaId,
        mismatchedHash,
        jpeg.bytes.byteLength,
        jpeg.width,
        jpeg.height,
      ), env));
      expect(isFinalizationNotFound(await finalizeMedia(scenario.owner, {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: mismatchedHash,
      }, env))).toBe(true);

      expect(await inspectFinalizedMedia(env, {
        ownerId: scenario.owner.id,
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
        byteLength: jpeg.bytes.byteLength,
        width: jpeg.width,
        height: jpeg.height,
        mediaAssetId: finalized.mediaAssetId,
      })).toEqual({
        assetCountForMediaId: 1,
        matchingQuarantinedAssetCount: 1,
        jobCountForMediaId: 1,
        matchingFinalizedJobCount: 1,
      });
    } finally {
      await destroySyntheticScenario(env, scenario);
    }
  }, 60_000);
});
