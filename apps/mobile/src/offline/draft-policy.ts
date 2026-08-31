import type { SightingRisk } from '../api/sightings';
import { MAX_REVIEWED_MEDIA_BYTES, type ReviewReceipt } from '../media/contracts';
import { isReviewedMediaReference } from '../media/media-reference';
import type { UploadJob, UploadResumeState } from './upload-job';

export const UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION = 'unsupported' as const;

export type StoredDraft = {
  id: string;
  notes: string;
  risk: SightingRisk;
  mediaId?: string;
  sightingId?: string;
  ownerSubject?: string;
  pendingMediaCleanupRef?: string;
  encryptedReviewedRef?: string;
  encryptionVersion?: 'aes-256-gcm.v1' | typeof UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION;
  receipt?: ReviewReceipt;
  uploadJob?: UploadJob;
  revision?: number;
  mediaFailure?: 'local_media_corrupt' | 'version_mismatch' | 'auth_ownership';
};

const risks = new Set<SightingRisk>(['normal', 'sensitive', 'critical']);
const uploadStates = new Set<UploadJob['state']>([
  'local_persisting', 'upload_pending', 'uploading', 'finalizing', 'waiting', 'needs_user', 'quarantined', 'complete',
]);
const resumeStates = new Set<UploadResumeState>(['uploading', 'finalizing']);

function stableId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/.test(value);
}

function validReceipt(value: unknown): value is ReviewReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<ReviewReceipt>;
  const versions = receipt.detectorVersions;
  const requiredVersions = ['cats', 'people', 'plates'] as const;
  return typeof receipt.sanitizedSha256 === 'string' && /^[a-f0-9]{64}$/i.test(receipt.sanitizedSha256) &&
    receipt.recipeVersion === 'jpeg-srgb-2048-q88.v1' &&
    !!versions && typeof versions === 'object' &&
    Object.keys(versions).length === 3 &&
    requiredVersions.every((key) => Object.prototype.hasOwnProperty.call(versions, key)) &&
    versions.cats === 'unavailable' && versions.people === 'unavailable' && versions.plates === 'unavailable' &&
    Number.isInteger(receipt.width) && receipt.width! > 0 && receipt.width! <= 2048 &&
    Number.isInteger(receipt.height) && receipt.height! > 0 && receipt.height! <= 2048 &&
    Number.isInteger(receipt.byteLength) && receipt.byteLength! > 0 && receipt.byteLength! <= MAX_REVIEWED_MEDIA_BYTES &&
    typeof receipt.confirmedAtLocal === 'string' && receipt.confirmedAtLocal.length <= 40 &&
    Number.isFinite(Date.parse(receipt.confirmedAtLocal));
}

function sanitizeUploadJob(value: unknown): UploadJob | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const job = value as Partial<UploadJob>;
  if (!job.state || !uploadStates.has(job.state) || !Number.isInteger(job.attempts) || job.attempts! < 0 || job.attempts! > 5) {
    throw new Error('invalid_reviewed_media_draft');
  }
  const validNextAttemptAt = typeof job.nextAttemptAt === 'string' && job.nextAttemptAt.length <= 40 &&
    Number.isFinite(Date.parse(job.nextAttemptAt));
  const validAttemptStartedAt = typeof job.attemptStartedAt === 'string' && job.attemptStartedAt.length <= 40 &&
    Number.isFinite(Date.parse(job.attemptStartedAt));
  const resumeState = typeof job.resumeState === 'string' && resumeStates.has(job.resumeState as UploadResumeState)
    ? job.resumeState as UploadResumeState
    : null;
  if (job.state === 'waiting' && (!validNextAttemptAt || resumeState === null || job.attemptStartedAt !== null)) {
    throw new Error('invalid_reviewed_media_draft');
  }
  if ((job.state === 'uploading' || job.state === 'finalizing') &&
      (!validAttemptStartedAt || job.resumeState !== null || job.nextAttemptAt !== null || job.attempts! < 1)) {
    throw new Error('invalid_reviewed_media_draft');
  }
  const nextAttemptAt = job.state === 'waiting' ? job.nextAttemptAt as string : null;
  const attemptStartedAt = job.state === 'uploading' || job.state === 'finalizing'
    ? job.attemptStartedAt as string
    : null;
  const lastError = typeof job.lastError === 'string' &&
    /^(network|http_[1-5][0-9]{2}|authentication_required|hash_mismatch|metadata_mismatch|version_mismatch|auth_ownership|retry_limit_reached|invalid_upload_attempt|local_media_missing|local_media_key_missing|local_media_unavailable|local_media_corrupt|upload_error)$/.test(job.lastError)
    ? job.lastError
    : null;
  return {
    state: job.state,
    attempts: job.attempts!,
    nextAttemptAt,
    lastError,
    resumeState: job.state === 'waiting' ? resumeState : null,
    attemptStartedAt,
  };
}

export function sanitizeDraftForStorage(input: Record<string, unknown>): StoredDraft {
  if (!stableId(input.id)) throw new Error('invalid_draft_id');
  const risk = typeof input.risk === 'string' && risks.has(input.risk as SightingRisk)
    ? (input.risk as SightingRisk)
    : 'normal';

  const draft: StoredDraft = {
    id: input.id,
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 1000) : '',
    risk,
  };

  const hasAnyMedia = input.mediaId !== undefined || input.encryptedReviewedRef !== undefined ||
    input.encryptionVersion !== undefined || input.receipt !== undefined || input.uploadJob !== undefined;
  if (!hasAnyMedia) return {
    ...draft,
    ...(stableId(input.sightingId) ? { sightingId: input.sightingId } : {}),
    ...(stableId(input.ownerSubject) ? { ownerSubject: input.ownerSubject } : {}),
    ...(typeof input.pendingMediaCleanupRef === 'string' && isReviewedMediaReference(input.pendingMediaCleanupRef)
      ? { pendingMediaCleanupRef: input.pendingMediaCleanupRef } : {}),
  };

  if (!stableId(input.mediaId) || !isReviewedMediaReference(input.encryptedReviewedRef, input.mediaId) ||
      input.encryptionVersion !== 'aes-256-gcm.v1' || !validReceipt(input.receipt)) {
    throw new Error('invalid_reviewed_media_draft');
  }
  const uploadJob = sanitizeUploadJob(input.uploadJob) ?? {
    state: 'upload_pending' as const,
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    resumeState: null,
    attemptStartedAt: null,
  };
  return {
    ...draft,
    mediaId: input.mediaId,
    encryptedReviewedRef: input.encryptedReviewedRef,
    encryptionVersion: input.encryptionVersion,
    receipt: input.receipt,
    uploadJob,
    ...(stableId(input.sightingId) ? { sightingId: input.sightingId } : {}),
    ...(stableId(input.ownerSubject) ? { ownerSubject: input.ownerSubject } : {}),
    ...(typeof input.pendingMediaCleanupRef === 'string' && isReviewedMediaReference(input.pendingMediaCleanupRef)
      ? { pendingMediaCleanupRef: input.pendingMediaCleanupRef } : {}),
  };
}
