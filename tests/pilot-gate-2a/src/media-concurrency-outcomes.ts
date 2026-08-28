import type { ActorResult, Reservation } from './actors.js';
import { isExactActorResultFailure, isExactMediaBoundaryFailure } from './media-failure-shape.js';
import type { MediaLifecycleInspection } from './inspection.js';

export type ReserveOutcome = 'reserved' | 'reservation_conflict' | 'unexpected';
export type FinalizeOutcome = 'idempotent_asset' | 'documented_conflict' | 'unexpected';
export type DeleteOutcome = 'deleted' | 'unexpected';
export type CleanupOutcome = 'cleanup_completed' | 'unexpected';
export type CleanupConvergence = 'retry_state' | 'unexpected_state';

export function normalizeReserveOutcome(
  outcome: PromiseSettledResult<Reservation>,
): ReserveOutcome {
  if (outcome.status === 'fulfilled') return 'reserved';
  return isExactMediaBoundaryFailure(outcome.reason, {
    stage: 'reserve', status: 409, code: 'media_reservation_conflict',
  }) ? 'reservation_conflict' : 'unexpected';
}

export function normalizeFinalizeOutcome(
  outcome: PromiseSettledResult<ActorResult>,
  expectedAssetId?: string,
): FinalizeOutcome {
  if (outcome.status === 'rejected') return 'unexpected';
  if (outcome.value.ok && outcome.value.status === 200 && outcome.value.mediaAssetId &&
      (expectedAssetId === undefined || outcome.value.mediaAssetId === expectedAssetId)) {
    return 'idempotent_asset';
  }
  return isExactActorResultFailure(outcome.value, {
    stage: 'finalize', status: 409, code: 'media_finalization_conflict',
  }) ? 'documented_conflict' : 'unexpected';
}

export function normalizeDeleteOutcome(
  outcome: PromiseSettledResult<ActorResult>,
): DeleteOutcome {
  return outcome.status === 'fulfilled' && outcome.value.ok && outcome.value.status === 200 &&
    outcome.value.deleted === true
    ? 'deleted'
    : 'unexpected';
}

export function normalizeCleanupOutcome(
  outcome: PromiseSettledResult<'cleanup_completed'>,
): CleanupOutcome {
  return outcome.status === 'fulfilled' && outcome.value === 'cleanup_completed'
    ? 'cleanup_completed'
    : 'unexpected';
}

export function normalizeCleanupConvergence(
  value: MediaLifecycleInspection,
): CleanupConvergence {
  const retry = value.jobCount === 1 && value.assetCount === 0 && value.jobStatus === 'reserved' &&
    value.reservationExpired && value.uploadCredentialWatermarkInFuture && value.cleanupScheduledInFuture &&
    !value.cleanupClaimed && !value.assetTombstoned && !value.stagingObjectExists;
  return retry ? 'retry_state' : 'unexpected_state';
}
