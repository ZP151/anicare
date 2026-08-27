import type { MediaFinalizationResponse, MediaTransportFailure } from '../api/media-transport';
import type { ValidatedUploadCapability } from '../api/media';
import type { ScopedReviewedArtifact } from './draft-media';
import type { StoredDraft } from '../offline/draft-policy';
import type { MediaUploadClaim } from '../offline/draft-store';
import { nextUploadOutcome, type UploadAttemptResult, type UploadJob } from '../offline/upload-job';

export type MediaUploadRunResult = 'quarantined' | 'waiting' | 'needs_user' | 'stale';

export type MediaUploadCoordinatorDependencies = Readonly<{
  getOfflineDraft(id: string): Promise<StoredDraft | null>;
  transitionClaimedMediaUpload(id: string, expectedRevision: number, next: UploadJob): Promise<boolean>;
  getOwnerSubject(): Promise<string | null>;
  getAccessToken(signal?: AbortSignal): Promise<string>;
  withDecryptedReviewedJpeg<T>(
    input: Readonly<{
      draftId: string;
      mediaId: string;
      encryptedReviewedRef: string;
      encryptionVersion: 'aes-256-gcm.v1';
      receipt: MediaUploadClaim['receipt'];
    }>,
    consume: (artifact: ScopedReviewedArtifact) => Promise<T> | T,
  ): Promise<T>;
  reserveMediaUpload(input: Readonly<{
    sightingId: string;
    mediaId: string;
    receipt: MediaUploadClaim['receipt'];
    accessToken: string;
    signal?: AbortSignal;
  }>): Promise<ValidatedUploadCapability>;
  putReservedMedia(input: Readonly<{
    capability: ValidatedUploadCapability;
    artifact: Readonly<{ bytes: Uint8Array }>;
    signal?: AbortSignal;
  }>): Promise<void>;
  finalizeMediaUpload(input: Readonly<{
    sightingId: string;
    mediaId: string;
    sha256: string;
    accessToken: string;
    signal?: AbortSignal;
  }>): Promise<MediaFinalizationResponse>;
  deleteReviewedMediaReference(reference: string): Promise<void>;
  drainPendingCleanup(draftId: string): Promise<void>;
  cleanupQuarantinedMedia(draftId: string, expectedRevision: number): Promise<void>;
  now(): Date;
  random(): number;
  /** Finite ceiling for token, reservation, and PUT while authenticated plaintext is in scope. */
  plaintextDeadlineMs: number;
  createAbortController(): AbortController;
  setDeadlineTimer(callback: () => void, delayMs: number): unknown;
  clearDeadlineTimer(handle: unknown): void;
  cancellationSignal?: AbortSignal;
}>;

type MutableAttempt = {
  claim: MediaUploadClaim;
  revision: number;
  job: UploadJob & Readonly<{ state: 'uploading' | 'finalizing' }>;
};

const inFlight = new Map<string, Promise<MediaUploadRunResult>>();

function sameReceipt(left: MediaUploadClaim['receipt'], right: MediaUploadClaim['receipt']): boolean {
  return left.sanitizedSha256.toLowerCase() === right.sanitizedSha256.toLowerCase() &&
    left.recipeVersion === right.recipeVersion && left.width === right.width && left.height === right.height &&
    left.byteLength === right.byteLength && left.confirmedAtLocal === right.confirmedAtLocal &&
    left.detectorVersions.cats === right.detectorVersions.cats &&
    left.detectorVersions.people === right.detectorVersions.people &&
    left.detectorVersions.plates === right.detectorVersions.plates;
}

function currentMatchesClaim(current: StoredDraft, claim: MediaUploadClaim): boolean {
  return current.revision === claim.revision && current.id === claim.draftId &&
    current.mediaId === claim.mediaId && current.sightingId === claim.sightingId && current.ownerSubject === claim.ownerSubject &&
    current.encryptedReviewedRef === claim.encryptedReviewedRef &&
    current.encryptionVersion === claim.encryptionVersion && !!current.receipt &&
    sameReceipt(current.receipt, claim.receipt) && current.uploadJob?.state === claim.uploadJob.state &&
    current.uploadJob.attempts === claim.uploadJob.attempts &&
    current.uploadJob.attemptStartedAt === claim.uploadJob.attemptStartedAt && !current.mediaFailure;
}

function mediaInput(claim: MediaUploadClaim) {
  return {
    draftId: claim.draftId,
    mediaId: claim.mediaId,
    encryptedReviewedRef: claim.encryptedReviewedRef,
    encryptionVersion: claim.encryptionVersion,
    receipt: claim.receipt,
  };
}

function isTransportFailure(value: unknown): value is MediaTransportFailure {
  if (!value || typeof value !== 'object') return false;
  const failure = value as Partial<MediaTransportFailure>;
  return (failure.stage === 'reserve' || failure.stage === 'upload' || failure.stage === 'finalize') &&
    (failure.kind === 'network' || failure.kind === 'http' || failure.kind === 'invalid_response') &&
    (failure.status === null || (Number.isInteger(failure.status) && failure.status! >= 100 && failure.status! <= 599)) &&
    typeof failure.code === 'string';
}

function isMissingObject(value: unknown): boolean {
  return isTransportFailure(value) && value.stage === 'finalize' && value.kind === 'http' &&
    value.status === 409 && value.code === 'media_finalization_conflict';
}

function isPutConflict(value: unknown): boolean {
  return isTransportFailure(value) && value.stage === 'upload' && value.kind === 'http' &&
    value.status === 409 && value.code === 'storage_upload_failed';
}

function isAbortFailure(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError';
}

function transportOutcome(value: unknown): UploadAttemptResult {
  if (isAbortFailure(value)) return { kind: 'network' };
  if (value instanceof Error && value.message === 'media_upload_cancelled') return { kind: 'network' };
  if (!isTransportFailure(value)) return { kind: 'upload_error' };
  if (value.code === 'authentication_required') return { kind: 'authentication_required' };
  if (value.kind === 'network') return { kind: 'network' };
  if (value.kind === 'http' && value.status !== null) return { kind: 'http', status: value.status };
  return { kind: 'upload_error' };
}

function localOutcome(value: unknown): UploadAttemptResult {
  if (isAbortFailure(value)) return { kind: 'network' };
  const message = value instanceof Error ? value.message : '';
  if (message === 'media_upload_cancelled') return { kind: 'network' };
  if (message === 'media_upload_timeout') return { kind: 'network' };
  if (message === 'authentication_required') return { kind: 'authentication_required' };
  if (message === 'local_media_unavailable' || message === 'secure_media_processing_unavailable') {
    return { kind: 'local_media_unavailable' };
  }
  if (message === 'version_mismatch') return { kind: 'version_mismatch' };
  if (message === 'local_media_key_missing') return { kind: 'local_media_key_missing' };
  if (message === 'local_media_missing') return { kind: 'local_media_missing' };
  if (message === 'local_media_corrupt' || message === 'hash_mismatch' || message === 'metadata_mismatch') {
    return { kind: 'local_media_corrupt' };
  }
  return { kind: 'upload_error' };
}

function untilAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new Error('media_upload_timeout')));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    void operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

async function withAttemptDeadline<T>(
  dependencies: MediaUploadCoordinatorDependencies,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(dependencies.plaintextDeadlineMs) || dependencies.plaintextDeadlineMs <= 0) {
    throw new Error('media_upload_timeout');
  }
  const controller = dependencies.createAbortController();
  const abortOnCancellation = () => controller.abort();
  if (dependencies.cancellationSignal?.aborted) controller.abort();
  dependencies.cancellationSignal?.addEventListener('abort', abortOnCancellation, { once: true });
  const timer = dependencies.setDeadlineTimer(() => controller.abort(), dependencies.plaintextDeadlineMs);
  try {
    return await operation(controller.signal);
  } finally {
    dependencies.clearDeadlineTimer(timer);
    dependencies.cancellationSignal?.removeEventListener('abort', abortOnCancellation);
  }
}

function getBoundedAccessToken(dependencies: MediaUploadCoordinatorDependencies): Promise<string> {
  return withAttemptDeadline(
    dependencies,
    (signal) => untilAbort(dependencies.getAccessToken(signal), signal),
  );
}

async function move(
  attempt: MutableAttempt,
  next: UploadJob,
  dependencies: MediaUploadCoordinatorDependencies,
  allowCancelledFinalizing = false,
): Promise<boolean> {
  if (dependencies.cancellationSignal?.aborted && next.state !== 'waiting' &&
      !(next.state === 'needs_user' && attempt.job.attempts >= 5) &&
      !(allowCancelledFinalizing && next.state === 'finalizing')) {
    throw new Error('media_upload_cancelled');
  }
  try {
    const changed = await dependencies.transitionClaimedMediaUpload(
      attempt.claim.draftId, attempt.revision, next,
    );
    if (!changed) return false;
    attempt.revision += 1;
    attempt.job = next as MutableAttempt['job'];
    return true;
  } catch {
    throw new Error('media_upload_state_unavailable');
  }
}

async function persistOutcome(
  attempt: MutableAttempt,
  result: UploadAttemptResult,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  const next = nextUploadOutcome(attempt.job, result, dependencies.now(), dependencies.random);
  if (!await move(attempt, next, dependencies)) return 'stale';
  return next.state === 'waiting' ? 'waiting' : next.state === 'quarantined' ? 'quarantined' : 'needs_user';
}

async function cleanupTerminal(
  draftId: string,
  reference: string,
  revision: number,
  ownerSubject: string,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<'quarantined'> {
  try {
    const assertLiveOwner = async () => {
      if (dependencies.cancellationSignal?.aborted) throw new Error('media_upload_cancelled');
      const liveOwner = await dependencies.getOwnerSubject();
      if (dependencies.cancellationSignal?.aborted || liveOwner !== ownerSubject) throw new Error('media_upload_cancelled');
    };
    await assertLiveOwner();
    await dependencies.drainPendingCleanup(draftId);
    await assertLiveOwner();
    const current = await dependencies.getOfflineDraft(draftId);
    await assertLiveOwner();
    if (!current || current.ownerSubject !== ownerSubject || current.pendingMediaCleanupRef ||
        current.uploadJob?.state !== 'quarantined' || current.encryptedReviewedRef !== reference) {
      throw new Error('terminal_cleanup_conflict');
    }
    await dependencies.deleteReviewedMediaReference(reference);
    await assertLiveOwner();
    await dependencies.cleanupQuarantinedMedia(draftId, current.revision ?? revision);
    return 'quarantined';
  } catch {
    throw new Error('terminal_cleanup_failed');
  }
}

async function persistFinalizing(
  attempt: MutableAttempt,
  dependencies: MediaUploadCoordinatorDependencies,
  allowCancelledFinalizing = false,
): Promise<boolean> {
  if (attempt.job.state === 'finalizing') return true;
  return move(attempt, {
    ...attempt.job,
    state: 'finalizing',
    nextAttemptAt: null,
    lastError: null,
    resumeState: null,
  }, dependencies, allowCancelledFinalizing);
}

async function persistQuarantined(
  attempt: MutableAttempt,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  const result = await persistOutcome(attempt, { kind: 'quarantined' }, dependencies);
  if (result !== 'quarantined') return result;
  return cleanupTerminal(
    attempt.claim.draftId, attempt.claim.encryptedReviewedRef, attempt.revision, attempt.claim.ownerSubject, dependencies,
  );
}

async function finalize(
  attempt: MutableAttempt,
  accessToken: string,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<void> {
  if (dependencies.cancellationSignal?.aborted) throw new Error('media_upload_cancelled');
  await dependencies.finalizeMediaUpload({
    sightingId: attempt.claim.sightingId,
    mediaId: attempt.claim.mediaId,
    sha256: attempt.claim.receipt.sanitizedSha256,
    accessToken,
    signal: dependencies.cancellationSignal,
  });
}

async function reserve(
  attempt: MutableAttempt,
  accessToken: string,
  dependencies: MediaUploadCoordinatorDependencies,
  signal?: AbortSignal,
): Promise<ValidatedUploadCapability> {
  if (dependencies.cancellationSignal?.aborted) throw new Error('media_upload_cancelled');
  return dependencies.reserveMediaUpload({
    sightingId: attempt.claim.sightingId,
    mediaId: attempt.claim.mediaId,
    receipt: attempt.claim.receipt,
    accessToken,
    signal: signal ?? dependencies.cancellationSignal,
  });
}

async function readAndPut(
  attempt: MutableAttempt,
  capability: ValidatedUploadCapability | null,
  accessToken: string | null,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<{ putConflict: boolean; accessToken: string }> {
  return dependencies.withDecryptedReviewedJpeg(mediaInput(attempt.claim), async (artifact) => {
    if (artifact.sha256.toLowerCase() !== attempt.claim.receipt.sanitizedSha256.toLowerCase()) {
      throw new Error('hash_mismatch');
    }
    if (artifact.byteLength !== attempt.claim.receipt.byteLength || artifact.bytes.byteLength !== artifact.byteLength) {
      throw new Error('metadata_mismatch');
    }
    return withAttemptDeadline(dependencies, async (signal) => {
      if (dependencies.cancellationSignal?.aborted) throw new Error('media_upload_cancelled');
      const activeToken = accessToken ?? await untilAbort(dependencies.getAccessToken(signal), signal);
      const activeCapability = capability ?? await untilAbort(reserve(attempt, activeToken, dependencies, signal), signal);
      try {
        if (dependencies.cancellationSignal?.aborted) throw new Error('media_upload_cancelled');
        let putSucceeded = false;
        const putOperation = dependencies.putReservedMedia({ capability: activeCapability, artifact, signal }).then(() => {
          putSucceeded = true;
        });
        try {
          await untilAbort(putOperation, signal);
        } catch (error) {
          // A completed PUT is remote truth: preserve it locally as finalizing before settling cancellation.
          if (!putSucceeded) throw error;
        }
        return { putConflict: false, accessToken: activeToken };
      } catch (error) {
        if (isPutConflict(error)) return { putConflict: true, accessToken: activeToken };
        throw error;
      }
    });
  });
}

async function handleFailure(
  attempt: MutableAttempt,
  error: unknown,
  local: boolean,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  return persistOutcome(attempt, local ? localOutcome(error) : transportOutcome(error), dependencies);
}

async function finishAfterPut(
  attempt: MutableAttempt,
  accessToken: string,
  putConflict: boolean,
  allowRecovery: boolean,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  try {
    if (!await persistFinalizing(attempt, dependencies, true)) return 'stale';
    await finalize(attempt, accessToken, dependencies);
    return persistQuarantined(attempt, dependencies);
  } catch (error) {
    if (isMissingObject(error) && (putConflict || !allowRecovery)) {
      return persistOutcome(attempt, { kind: 'upload_error' }, dependencies);
    }
    if (!isMissingObject(error)) return handleFailure(attempt, error, false, dependencies);
  }
  return recoverAfterMissing(attempt, accessToken, dependencies);
}

async function recoverAfterMissing(
  attempt: MutableAttempt,
  accessToken: string,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  let capability: ValidatedUploadCapability | null = null;
  try {
    capability = await reserve(attempt, accessToken, dependencies);
    await finalize(attempt, accessToken, dependencies);
    if (!await persistFinalizing(attempt, dependencies)) return 'stale';
    return persistQuarantined(attempt, dependencies);
  } catch (error) {
    if (!isMissingObject(error)) return handleFailure(attempt, error, false, dependencies);
    if (!capability) {
      return persistOutcome(attempt, { kind: 'upload_error' }, dependencies);
    }
  }

  if (attempt.claim.recoveryOnly) {
    return persistOutcome(attempt, { kind: 'upload_error' }, dependencies);
  }

  let putResult: { putConflict: boolean; accessToken: string };
  try {
    putResult = await readAndPut(attempt, capability, accessToken, dependencies);
  } catch (error) {
    return handleFailure(attempt, error, !isTransportFailure(error), dependencies);
  }
  return finishAfterPut(attempt, accessToken, putResult.putConflict, false, dependencies);
}

async function runFresh(
  attempt: MutableAttempt,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  let putResult: { putConflict: boolean; accessToken: string };
  try {
    putResult = await readAndPut(attempt, null, null, dependencies);
  } catch (error) {
    return handleFailure(attempt, error, !isTransportFailure(error), dependencies);
  }
  return finishAfterPut(attempt, putResult.accessToken, putResult.putConflict, true, dependencies);
}

async function runRecovering(
  attempt: MutableAttempt,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  let accessToken: string;
  try {
    accessToken = await getBoundedAccessToken(dependencies);
  } catch (error) {
    return handleFailure(attempt, error, true, dependencies);
  }
  try {
    if (!await persistFinalizing(attempt, dependencies)) return 'stale';
    await finalize(attempt, accessToken, dependencies);
    return persistQuarantined(attempt, dependencies);
  } catch (error) {
    if (!isMissingObject(error)) return handleFailure(attempt, error, false, dependencies);
  }
  return recoverAfterMissing(attempt, accessToken!, dependencies);
}

async function runInternal(
  claim: MediaUploadClaim,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  if (dependencies.cancellationSignal?.aborted) {
    const attempt: MutableAttempt = { claim, revision: claim.revision, job: claim.uploadJob };
    return persistOutcome(attempt, { kind: 'network' }, dependencies);
  }
  let current: StoredDraft | null;
  try {
    current = await dependencies.getOfflineDraft(claim.draftId);
  } catch {
    throw new Error('media_upload_state_unavailable');
  }
  if (!current || current.ownerSubject !== await dependencies.getOwnerSubject()) return 'stale';
  if (current.uploadJob?.state === 'quarantined' && current.encryptedReviewedRef) {
    return cleanupTerminal(current.id, current.encryptedReviewedRef, current.revision ?? claim.revision, claim.ownerSubject, dependencies);
  }
  if (!currentMatchesClaim(current, claim)) return 'stale';
  const attempt: MutableAttempt = { claim, revision: claim.revision, job: claim.uploadJob };
  if (dependencies.cancellationSignal?.aborted) {
    return persistOutcome(attempt, { kind: 'network' }, dependencies);
  }
  return claim.recovering ? runRecovering(attempt, dependencies) : runFresh(attempt, dependencies);
}

export function runMediaUploadAttempt(
  claim: MediaUploadClaim,
  dependencies: MediaUploadCoordinatorDependencies,
): Promise<MediaUploadRunResult> {
  const current = inFlight.get(claim.draftId);
  if (current) return current;
  const running = runInternal(claim, dependencies);
  inFlight.set(claim.draftId, running);
  void running.finally(() => {
    if (inFlight.get(claim.draftId) === running) inFlight.delete(claim.draftId);
  }).catch(() => undefined);
  return running;
}
