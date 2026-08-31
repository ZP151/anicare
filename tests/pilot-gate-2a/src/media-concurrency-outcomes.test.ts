import { describe, expect, it } from 'vitest';

import {
  normalizeCleanupConvergence,
  normalizeCleanupOutcome,
  normalizeDeleteOutcome,
  normalizeFinalizeOutcome,
  normalizeReserveOutcome,
} from './media-concurrency-outcomes.js';
import type { ActorResult, Reservation } from './actors.js';
import type { MediaLifecycleInspection } from './inspection.js';

const RESERVATION = {
  jobId: '10000000-0000-4000-8000-000000000001',
  path: 'jobs/10000000-0000-4000-8000-000000000001.jpg',
  token: 'bounded-token',
  usableUntil: '2099-01-01T00:00:00.000Z',
  mediaId: '10000000-0000-4000-8000-000000000002',
  origin: 'http://127.0.0.1:54321',
} satisfies Reservation;

function fulfilled<T>(value: T): PromiseSettledResult<T> {
  return { status: 'fulfilled', value };
}

function rejected<T>(reason: unknown): PromiseSettledResult<T> {
  return { status: 'rejected', reason };
}

describe('media concurrency HTTP outcome normalization', () => {
  it('keeps only allowed reserve, finalize, delete and cleanup semantics', () => {
    const assetId = '10000000-0000-4000-8000-000000000003';
    const finalized = fulfilled<ActorResult>({ ok: true, status: 200, mediaAssetId: assetId });
    const conflict = fulfilled<ActorResult>({
      ok: false,
      stage: 'finalize',
      kind: 'http',
      status: 409,
      code: 'media_finalization_conflict',
    });

    expect([
      normalizeReserveOutcome(fulfilled(RESERVATION)),
      normalizeReserveOutcome(rejected({
        stage: 'reserve', kind: 'http', status: 409, code: 'media_reservation_conflict',
      })),
      normalizeReserveOutcome(rejected(new Error('discarded'))),
      normalizeFinalizeOutcome(finalized, assetId),
      normalizeFinalizeOutcome(finalized, '10000000-0000-4000-8000-000000000004'),
      normalizeFinalizeOutcome(conflict, assetId),
      normalizeDeleteOutcome(fulfilled<ActorResult>({ ok: true, status: 200, deleted: true })),
      normalizeDeleteOutcome(conflict),
      normalizeCleanupOutcome(fulfilled('cleanup_completed')),
      normalizeCleanupOutcome(rejected(new Error('discarded'))),
    ]).toEqual([
      'reserved',
      'reservation_conflict',
      'unexpected',
      'idempotent_asset',
      'unexpected',
      'documented_conflict',
      'deleted',
      'unexpected',
      'cleanup_completed',
      'unexpected',
    ]);
  });
});

describe('media concurrency cleanup convergence normalization', () => {
  it('rejects terminal purge while the forced-expired job credential watermark remains live', () => {
    const retry: MediaLifecycleInspection = {
      jobCount: 1,
      assetCount: 0,
      jobStatus: 'reserved',
      reservationExpired: true,
      uploadCredentialWatermarkInFuture: true,
      cleanupScheduledInFuture: true,
      cleanupClaimed: false,
      assetTombstoned: false,
      stagingObjectExists: false,
    };

    expect([
      normalizeCleanupConvergence(retry),
      normalizeCleanupConvergence({
        ...retry,
        jobCount: 0,
        jobStatus: 'missing',
        reservationExpired: false,
        uploadCredentialWatermarkInFuture: false,
        cleanupScheduledInFuture: false,
      }),
      normalizeCleanupConvergence({ ...retry, cleanupClaimed: true }),
      normalizeCleanupConvergence({ ...retry, stagingObjectExists: true }),
    ]).toEqual(['retry_state', 'unexpected_state', 'unexpected_state', 'unexpected_state']);
  });
});
