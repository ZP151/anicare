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
import { createSyntheticScenario, destroySyntheticScenario, type SyntheticActor } from './fixtures.js';
import { isExactMediaBoundaryFailure, type MediaBoundaryFailureExpectation } from './media-failure-shape.js';
import { inspectFinalizedMedia } from './inspection.js';
import { deterministicJpegFixture } from './jpeg-fixture.js';
import { fetchWithTimeout } from './network.js';

const PRIVATE_READ_TIMEOUT_MS = 5_000;
const DENIED_STATUSES = new Set([400, 401, 403, 404, 406]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type HttpFailure = Readonly<{
  stage: MediaBoundaryFailureExpectation['stage'];
  kind: 'http';
  status: MediaBoundaryFailureExpectation['status'];
  code: MediaBoundaryFailureExpectation['code'];
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

async function reserveFailsWith(
  action: Promise<unknown>,
  status: HttpFailure['status'],
  code: HttpFailure['code'],
): Promise<void> {
  try {
    await action;
  } catch (error) {
    expect(isExactMediaBoundaryFailure(error, { stage: 'reserve', status, code })).toBe(true);
    return;
  }
  expect(false).toBe(true);
}

function actorFailure(
  value: ActorResult,
  stage: HttpFailure['stage'],
  status: HttpFailure['status'],
  code: HttpFailure['code'],
): boolean {
  return !value.ok && value.stage === stage && value.kind === 'http' && value.status === status && value.code === code;
}

function clientHeaders(env: LocalStackEnvironment, actor: SyntheticActor | null): HeadersInit {
  const bearer = actor?.accessToken ?? env.anonKey;
  return { apikey: env.anonKey, Authorization: `Bearer ${bearer}` };
}

async function createAdditionalOwnerSighting(env: LocalStackEnvironment, actor: SyntheticActor): Promise<string> {
  const fieldNames = ['latitude', 'longitude', 'occurredAt', 'risk', 'traits', 'notes', 'clientDedupeKey'];
  const fieldValues: unknown[] = [
    Number(['1', '3003'].join('.')),
    Number(['103', '8003'].join('.')),
    new Date().toISOString(),
    'normal',
    Object.fromEntries([['synthetic', true]]),
    null,
    ['pilot', 'gate', '2a', 'owner', 'rebind', randomUUID()].join('-'),
  ];
  let response: Response;
  try {
    response = await fetchWithTimeout(`${env.apiUrl}/functions/v1/create-sighting`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${actor.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(fieldNames.map((name, index) => [name, fieldValues[index]]))),
    }, PRIVATE_READ_TIMEOUT_MS);
  } catch {
    throw new Error('fixture-sighting-create-failed');
  }
  const value = await response.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('fixture-sighting-create-failed');
  const result = value as Record<string, unknown>;
  if (response.status !== 201 || Object.keys(result).length !== 4 || !UUID.test(String(result.sightingId)) ||
      result.visibility !== 'public' || typeof result.visibleAt !== 'string' || !UUID.test(String(result.requestId))) {
    throw new Error('fixture-sighting-create-failed');
  }
  return result.sightingId as string;
}

async function expectStorageReadDenied(
  env: LocalStackEnvironment,
  actor: SyntheticActor | null,
  objectPath: string,
): Promise<void> {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  let response: Response;
  try {
    response = await fetchWithTimeout(`${env.apiUrl}/storage/v1/object/media-staging/${encodedPath}`, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: clientHeaders(env, actor),
    }, PRIVATE_READ_TIMEOUT_MS);
  } catch {
    throw new Error('private_read_failed');
  }
  expect(response.ok).toBe(false);
  expect(DENIED_STATUSES.has(response.status)).toBe(true);
}

describe('cross-user media isolation', () => {
  it('prevents a stranger from using an owner media capability while allowing owner-scoped media IDs', async () => {
    const env = readLocalStackEnvironment(process.env);
    const scenario = await createSyntheticScenario(env);
    try {
      const jpeg = deterministicJpegFixture();
      const mediaId = randomUUID();
      const ownerReceipt = receipt(
        scenario.ownerSightingId,
        mediaId,
        jpeg.sha256,
        jpeg.bytes.byteLength,
        jpeg.width,
        jpeg.height,
      );
      const ownerReservation = await reserveMedia(scenario.owner, ownerReceipt, env);
      const secondOwnerSightingId = await createAdditionalOwnerSighting(env, scenario.owner);
      await reserveFailsWith(reserveMedia(scenario.owner, receipt(
        secondOwnerSightingId,
        mediaId,
        jpeg.sha256,
        jpeg.bytes.byteLength,
        jpeg.width,
        jpeg.height,
      ), env), 409, 'media_reservation_conflict');
      expect((await putSignedMedia(ownerReservation, jpeg.bytes)).ok).toBe(true);

      const finalized = await finalizeMedia(scenario.owner, {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
      }, env);
      expect(finalized.ok).toBe(true);
      if (!finalized.ok || !finalized.mediaAssetId) throw new Error('owner_media_finalization_failed');

      await reserveFailsWith(
        reserveMedia(scenario.stranger, receipt(
          scenario.ownerSightingId,
          mediaId,
          jpeg.sha256,
          jpeg.bytes.byteLength,
          jpeg.width,
          jpeg.height,
        ), env),
        403,
        'media_not_found_or_forbidden',
      );
      expect(actorFailure(await finalizeMedia(scenario.stranger, {
        sightingId: scenario.ownerSightingId,
        mediaId,
        sha256: jpeg.sha256,
      }, env), 'finalize', 403, 'media_not_found_or_forbidden')).toBe(true);
      expect(actorFailure(
        await deleteMedia(scenario.stranger, finalized.mediaAssetId, env),
        'delete',
        403,
        'media_not_found_or_forbidden',
      )).toBe(true);

      const strangerReservation = await reserveMedia(scenario.stranger, receipt(
        scenario.strangerSightingId,
        mediaId,
        jpeg.sha256,
        jpeg.bytes.byteLength,
        jpeg.width,
        jpeg.height,
      ), env);
      expect(strangerReservation.jobId === ownerReservation.jobId).toBe(false);

      await expectStorageReadDenied(env, null, ownerReservation.path);
      await expectStorageReadDenied(env, scenario.owner, ownerReservation.path);
      await expectStorageReadDenied(env, scenario.stranger, ownerReservation.path);

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
