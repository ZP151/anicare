import { randomUUID } from 'node:crypto';

import { describe, it } from 'vitest';

import {
  deleteMedia,
  finalizeMedia,
  putSignedMedia,
  reserveMedia,
  type Reservation,
  type ReserveInput,
} from './actors.js';
import { settleTwoAtBarrier } from './concurrency.js';
import { readLocalStackEnvironment, type LocalStackEnvironment } from './environment.js';
import { createSyntheticScenario, destroySyntheticScenario, type SyntheticActor } from './fixtures.js';
import {
  normalizeCleanupConvergence as cleanupConvergence,
  normalizeCleanupOutcome as normalizeCleanup,
  normalizeDeleteOutcome as normalizeDelete,
  normalizeFinalizeOutcome as normalizeFinalize,
  normalizeReserveOutcome as normalizeReserve,
} from './media-concurrency-outcomes.js';
import {
  controlMediaLifecycleTimestamps,
  inspectMediaConcurrency,
  inspectMediaLifecycle,
  type MediaConcurrencyInspection,
} from './inspection.js';
import { deterministicJpegFixture } from './jpeg-fixture.js';
import { fetchWithTimeout } from './network.js';

const RACE_ATTEMPTS = 3;
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
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
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

async function invokeCleanup(env: LocalStackEnvironment): Promise<'cleanup_completed'> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${env.apiUrl}/functions/v1/cleanup-media-staging`, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${env.serviceRoleKey}` },
    }, CLEANUP_TIMEOUT_MS);
  } catch {
    throw new Error('cleanup-race: request_failed');
  }
  const result = cleanupResult(await response.json().catch(() => null));
  if (response.status !== 200 || response.redirected || !result) {
    throw new Error('cleanup-race: invalid_response');
  }
  return 'cleanup_completed';
}

function scenarioName(race: string, attempt: number): string {
  return `${race}-${attempt + 1}`;
}

function report(scenario: string, outcomes: readonly string[]): void {
  console.info(`${scenario}: ${outcomes.join(',')}`);
}

function requireNormalized(scenario: string, outcomes: readonly string[], condition: boolean): void {
  if (!condition) throw new Error(`${scenario}: ${outcomes.join(',')}`);
}

async function normalizedStep<T>(
  scenario: string,
  outcome: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch {
    throw new Error(`${scenario}: ${outcome}`);
  }
}

function sameNormalizedState(
  actual: MediaConcurrencyInspection,
  expected: MediaConcurrencyInspection,
): boolean {
  return Object.keys(expected).every((key) =>
    actual[key as keyof MediaConcurrencyInspection] === expected[key as keyof MediaConcurrencyInspection]);
}

function activeConcurrencyState(): MediaConcurrencyInspection {
  return {
    jobCountForMediaId: 1,
    matchingOwnerJobCount: 1,
    distinctOwnerCount: 1,
    distinctObjectPathCount: 1,
    canonicalObjectPathCount: 1,
    assetCountForMediaId: 1,
    matchingOwnerSightingAssetCount: 1,
    matchingJobAssetCount: 1,
    activeQuarantinedAssetCount: 1,
    tombstonedAssetCount: 0,
    jobStatus: 'finalized',
    cleanupClaimed: false,
    stagingObjectExists: true,
  };
}

function tombstonedConcurrencyState(): MediaConcurrencyInspection {
  return {
    ...activeConcurrencyState(),
    activeQuarantinedAssetCount: 0,
    tombstonedAssetCount: 1,
    jobStatus: 'deletion_pending',
  };
}

async function reserveUploadAndFinalize(
  scenario: string,
  env: LocalStackEnvironment,
  owner: SyntheticActor,
  input: ReserveInput,
  bytes: Uint8Array,
): Promise<Readonly<{ reservation: Reservation; mediaAssetId: string }>> {
  let reservation: Reservation;
  try {
    reservation = await reserveMedia(owner, input, env);
  } catch {
    throw new Error(`${scenario}: reserve_unexpected`);
  }
  const upload = await putSignedMedia(reservation, bytes);
  if (!upload.ok || upload.status !== 200) throw new Error(`${scenario}: upload_unexpected`);
  const finalized = await finalizeMedia(owner, {
    sightingId: input.sightingId,
    mediaId: input.mediaId,
    sha256: input.sha256,
  }, env);
  if (!finalized.ok || finalized.status !== 200 || !finalized.mediaAssetId) {
    throw new Error(`${scenario}: finalize_unexpected`);
  }
  return { reservation, mediaAssetId: finalized.mediaAssetId };
}

describe('bounded media concurrency convergence', () => {
  it('converges concurrent same-media reserves and finalizations to one owner job, path and asset', async () => {
    const env = readLocalStackEnvironment(process.env);
    const scenario = await createSyntheticScenario(env);
    try {
      const jpeg = deterministicJpegFixture();
      for (let attempt = 0; attempt < RACE_ATTEMPTS; attempt += 1) {
        const name = scenarioName('reserve-finalize-race', attempt);
        const mediaId = randomUUID();
        const reserveInput = receipt(
          scenario.ownerSightingId,
          mediaId,
          jpeg.sha256,
          jpeg.bytes.byteLength,
          jpeg.width,
          jpeg.height,
        );
        const reserveOutcomes = await settleTwoAtBarrier(
          () => reserveMedia(scenario.owner, reserveInput, env),
          () => reserveMedia(scenario.owner, reserveInput, env),
        );
        const reserveLabels = reserveOutcomes.map(normalizeReserve);
        requireNormalized(name, reserveLabels,
          reserveLabels[0] === 'reserved' && reserveLabels[1] === 'reserved');
        const reservations = reserveOutcomes.flatMap((outcome) =>
          outcome.status === 'fulfilled' ? [outcome.value] : []);
        if (reservations.length !== 2) throw new Error(`${name}: reserve_unexpected`);
        const firstReservation = reservations[0];
        const secondReservation = reservations[1];
        if (!firstReservation || !secondReservation) throw new Error(`${name}: reserve_unexpected`);
        requireNormalized(name, [...reserveLabels, 'reservation_invariant_unexpected'],
          firstReservation.jobId === secondReservation.jobId &&
          firstReservation.path === secondReservation.path &&
          firstReservation.mediaId === secondReservation.mediaId &&
          firstReservation.origin === secondReservation.origin &&
          firstReservation.token !== secondReservation.token);

        const upload = await putSignedMedia(firstReservation, jpeg.bytes);
        requireNormalized(name, [...reserveLabels, upload.ok && upload.status === 200 ? 'uploaded' : 'upload_unexpected'],
          upload.ok && upload.status === 200);
        const finalizeInput = {
          sightingId: scenario.ownerSightingId,
          mediaId,
          sha256: jpeg.sha256,
        };
        const finalizeOutcomes = await settleTwoAtBarrier(
          () => finalizeMedia(scenario.owner, finalizeInput, env),
          () => finalizeMedia(scenario.owner, finalizeInput, env),
        );
        const finalizeLabels = finalizeOutcomes.map((outcome) => normalizeFinalize(outcome));
        const finalizedIds = finalizeOutcomes.flatMap((outcome) =>
          outcome.status === 'fulfilled' && outcome.value.ok && outcome.value.mediaAssetId
            ? [outcome.value.mediaAssetId]
            : []);
        requireNormalized(name, [...reserveLabels, ...finalizeLabels], finalizeLabels.every((label) =>
          label === 'idempotent_asset' || label === 'documented_conflict'));
        requireNormalized(name, [...reserveLabels, ...finalizeLabels, 'asset_identity_unexpected'],
          finalizedIds.length >= 1 && finalizedIds.every((id) => id === finalizedIds[0]));
        const mediaAssetId = finalizedIds[0];
        if (!mediaAssetId) throw new Error(`${name}: finalize_unexpected`);

        const inspection = await normalizedStep(name, 'inspection_unexpected', () => inspectMediaConcurrency(env, {
          jobId: firstReservation.jobId,
          ownerId: scenario.owner.id,
          sightingId: scenario.ownerSightingId,
          mediaId,
        }));
        requireNormalized(name, [...reserveLabels, ...finalizeLabels, 'active_state_unexpected'],
          sameNormalizedState(inspection, activeConcurrencyState()));
        report(name, [...reserveLabels, ...finalizeLabels, 'one_active_asset']);
      }
    } finally {
      await destroySyntheticScenario(env, scenario);
    }
  }, 120_000);

  it('converges deletion racing repeated finalization to one tombstoned asset', async () => {
    const env = readLocalStackEnvironment(process.env);
    const scenario = await createSyntheticScenario(env);
    try {
      const jpeg = deterministicJpegFixture();
      for (let attempt = 0; attempt < RACE_ATTEMPTS; attempt += 1) {
        const name = scenarioName('delete-finalize-race', attempt);
        const mediaId = randomUUID();
        const input = receipt(
          scenario.ownerSightingId,
          mediaId,
          jpeg.sha256,
          jpeg.bytes.byteLength,
          jpeg.width,
          jpeg.height,
        );
        const prepared = await reserveUploadAndFinalize(
          name, env, scenario.owner, input, jpeg.bytes,
        );
        const raceOutcomes = await settleTwoAtBarrier(
          () => deleteMedia(scenario.owner, prepared.mediaAssetId, env),
          () => finalizeMedia(scenario.owner, {
            sightingId: scenario.ownerSightingId,
            mediaId,
            sha256: jpeg.sha256,
          }, env),
        );
        const deleteLabel = normalizeDelete(raceOutcomes[0]);
        const finalizeLabel = normalizeFinalize(raceOutcomes[1], prepared.mediaAssetId);
        requireNormalized(name, [deleteLabel, finalizeLabel], deleteLabel === 'deleted' &&
          (finalizeLabel === 'idempotent_asset' || finalizeLabel === 'documented_conflict'));

        const inspection = await normalizedStep(name, 'inspection_unexpected', () => inspectMediaConcurrency(env, {
          jobId: prepared.reservation.jobId,
          ownerId: scenario.owner.id,
          sightingId: scenario.ownerSightingId,
          mediaId,
        }));
        requireNormalized(name, [deleteLabel, finalizeLabel, 'tombstone_state_unexpected'],
          sameNormalizedState(inspection, tombstonedConcurrencyState()));
        const postRace = await finalizeMedia(scenario.owner, {
          sightingId: scenario.ownerSightingId,
          mediaId,
          sha256: jpeg.sha256,
        }, env);
        const postRaceLabel = normalizeFinalize({ status: 'fulfilled', value: postRace }, prepared.mediaAssetId);
        requireNormalized(name, [deleteLabel, finalizeLabel, postRaceLabel],
          postRaceLabel === 'documented_conflict');
        report(name, [deleteLabel, finalizeLabel, postRaceLabel, 'one_tombstoned_asset']);
      }
    } finally {
      await destroySyntheticScenario(env, scenario);
    }
  }, 120_000);

  it('gives one forced-expired staging job one effective cleanup claim and removal', async () => {
    const env = readLocalStackEnvironment(process.env);
    const scenario = await createSyntheticScenario(env);
    try {
      const jpeg = deterministicJpegFixture();
      for (let attempt = 0; attempt < RACE_ATTEMPTS; attempt += 1) {
        const name = scenarioName('cleanup-race', attempt);
        const mediaId = randomUUID();
        const input = receipt(
          scenario.ownerSightingId,
          mediaId,
          jpeg.sha256,
          jpeg.bytes.byteLength,
          jpeg.width,
          jpeg.height,
        );
        let reservation: Reservation;
        try {
          reservation = await reserveMedia(scenario.owner, input, env);
        } catch {
          throw new Error(`${name}: reserve_unexpected`);
        }
        const upload = await putSignedMedia(reservation, jpeg.bytes);
        if (!upload.ok || upload.status !== 200) throw new Error(`${name}: upload_unexpected`);
        await normalizedStep(name, 'time_control_unexpected', () => controlMediaLifecycleTimestamps(env, {
          operation: 'expire_reservation',
          jobId: reservation.jobId,
          ownerId: scenario.owner.id,
          mediaId,
        }));

        const cleanupOutcomes = await settleTwoAtBarrier(
          () => invokeCleanup(env),
          () => invokeCleanup(env),
        );
        const cleanupLabels = cleanupOutcomes.map(normalizeCleanup);
        requireNormalized(name, cleanupLabels,
          cleanupLabels[0] === 'cleanup_completed' && cleanupLabels[1] === 'cleanup_completed');
        const convergence = cleanupConvergence(await normalizedStep(
          name,
          'inspection_unexpected',
          () => inspectMediaLifecycle(env, {
          jobId: reservation.jobId,
          ownerId: scenario.owner.id,
          mediaId,
          }),
        ));
        requireNormalized(name, [...cleanupLabels, convergence],
          convergence === 'retry_state' || convergence === 'terminal_state');
        report(name, [...cleanupLabels, convergence, 'one_effective_removal']);
      }
    } finally {
      await destroySyntheticScenario(env, scenario);
    }
  }, 120_000);
});
