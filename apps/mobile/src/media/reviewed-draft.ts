import type { MediaReviewState, ReviewReceipt } from './contracts';
import type { ReviewedMediaArtifactStatus } from './draft-media';
import { createReviewedMediaReference, isReviewedMediaReference, isStableMediaId } from './media-reference';
import { canStageMedia } from './review-policy';
import {
  UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION,
  type StoredDraft,
} from '../offline/draft-policy';
import type { UploadJobState } from '../offline/upload-job';

export type ReviewedMediaJournal = Readonly<{
  draftId: string;
  mediaId: string;
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  receipt: ReviewReceipt;
}>;

export type ReviewedDraftResult = Readonly<{
  status: 'saved' | 'local_persisting' | 'needs_user';
  journal: ReviewedMediaJournal;
}>;

export type ReviewedDraftCommitInput = Readonly<{
  draftId: string;
  mediaId: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
}>;

export type ReviewedDraftCommitDependencies = Readonly<{
  createCommitId(): string;
  prepareJournal(journal: ReviewedMediaJournal): Promise<void>;
  inspectArtifact(journal: ReviewedMediaJournal): Promise<ReviewedMediaArtifactStatus>;
  commitMedia(input: ReviewedDraftCommitInput & { intendedEncryptedRef: string }): Promise<unknown>;
  finalizeJournal(journal: ReviewedMediaJournal): Promise<void>;
  markNeedsUser(journal: ReviewedMediaJournal, error: 'local_media_missing' | 'local_media_corrupt' | 'version_mismatch'): Promise<void>;
  cleanupCaches(uris: readonly string[]): Promise<void>;
}>;

type RecoveryDependencies = Pick<ReviewedDraftCommitDependencies, 'inspectArtifact' | 'finalizeJournal' | 'markNeedsUser'>;

function validJournalIdentity(journal: ReviewedMediaJournal): boolean {
  return isStableMediaId(journal.draftId) && isStableMediaId(journal.mediaId) &&
    isReviewedMediaReference(journal.encryptedReviewedRef, journal.mediaId) && !!journal.receipt;
}

function validJournal(journal: ReviewedMediaJournal): boolean {
  return validJournalIdentity(journal) && journal.encryptionVersion === 'aes-256-gcm.v1';
}

function sameReceipt(left: ReviewReceipt | null, right: ReviewReceipt): boolean {
  if (!left) return false;
  const leftVersions = Object.entries(left.detectorVersions).sort(([a], [b]) => a.localeCompare(b));
  const rightVersions = Object.entries(right.detectorVersions).sort(([a], [b]) => a.localeCompare(b));
  return left.sanitizedSha256 === right.sanitizedSha256 && left.recipeVersion === right.recipeVersion &&
    left.width === right.width && left.height === right.height && left.byteLength === right.byteLength &&
    left.confirmedAtLocal === right.confirmedAtLocal && JSON.stringify(leftVersions) === JSON.stringify(rightVersions);
}

export function decideLocalMediaRecovery(
  state: UploadJobState,
  artifact: ReviewedMediaArtifactStatus,
): 'finalize' | 'needs_reselection' | 'needs_user_corrupt' | 'needs_user_version' | 'retry_later' | 'none' {
  if (state !== 'local_persisting') return 'none';
  if (artifact === 'valid') return 'finalize';
  if (artifact === 'retryable_unavailable') return 'retry_later';
  if (artifact === 'version_mismatch') return 'needs_user_version';
  return artifact === 'absent' ? 'needs_reselection' : 'needs_user_corrupt';
}

export async function recoverReviewedDraft(journal: ReviewedMediaJournal, dependencies: RecoveryDependencies): Promise<ReviewedDraftResult> {
  if (!validJournalIdentity(journal)) throw new Error('invalid_reviewed_media_journal');
  if (!validJournal(journal)) {
    await dependencies.markNeedsUser(journal, 'version_mismatch');
    return { status: 'needs_user', journal };
  }
  const artifact = await dependencies.inspectArtifact(journal);
  const decision = decideLocalMediaRecovery('local_persisting', artifact);
  if (decision === 'retry_later') return { status: 'local_persisting', journal };
  if (decision === 'finalize') {
    try {
      await dependencies.finalizeJournal(journal);
      return { status: 'saved', journal };
    } catch {
      return { status: 'local_persisting', journal };
    }
  }
  const error = decision === 'needs_reselection' ? 'local_media_missing'
    : decision === 'needs_user_version' ? 'version_mismatch'
      : 'local_media_corrupt';
  await dependencies.markNeedsUser(journal, error);
  return { status: 'needs_user', journal };
}

export async function resumeReviewedDraftCommit(
  journal: ReviewedMediaJournal,
  input: Pick<ReviewedDraftCommitInput, 'review' | 'processorCacheUris'>,
  dependencies: ReviewedDraftCommitDependencies,
): Promise<ReviewedDraftResult> {
  if (!validJournalIdentity(journal) || !canStageMedia(input.review) || !sameReceipt(input.review.receipt, journal.receipt)) {
    throw new Error('media_review_required');
  }
  if (!validJournal(journal)) {
    await dependencies.markNeedsUser(journal, 'version_mismatch');
    return { status: 'needs_user', journal };
  }
  let artifact: ReviewedMediaArtifactStatus;
  try {
    artifact = await dependencies.inspectArtifact(journal);
  } catch {
    return { status: 'local_persisting', journal };
  }
  if (artifact === 'absent') {
    try {
      await dependencies.commitMedia({
        draftId: journal.draftId,
        mediaId: journal.mediaId,
        intendedEncryptedRef: journal.encryptedReviewedRef,
        review: input.review,
        processorCacheUris: input.processorCacheUris,
      });
    } catch {
      return { status: 'local_persisting', journal };
    }
    try {
      artifact = await dependencies.inspectArtifact(journal);
    } catch {
      return { status: 'local_persisting', journal };
    }
  }
  if (artifact === 'retryable_unavailable') return { status: 'local_persisting', journal };
  if (artifact !== 'valid') {
    await dependencies.markNeedsUser(journal, artifact === 'absent' ? 'local_media_missing'
      : artifact === 'version_mismatch' ? 'version_mismatch'
        : 'local_media_corrupt');
    return { status: 'needs_user', journal };
  }
  try {
    await dependencies.finalizeJournal(journal);
  } catch {
    return { status: 'local_persisting', journal };
  }
  await dependencies.cleanupCaches([
    ...input.processorCacheUris,
    ...(input.review.rendered ? [input.review.rendered.uri] : []),
  ]);
  return { status: 'saved', journal };
}

export async function commitReviewedDraft(
  input: ReviewedDraftCommitInput,
  dependencies: ReviewedDraftCommitDependencies,
): Promise<ReviewedDraftResult> {
  if (!isStableMediaId(input.draftId) || !isStableMediaId(input.mediaId) || !canStageMedia(input.review) || !input.review.receipt) {
    throw new Error('media_review_required');
  }
  const journal: ReviewedMediaJournal = {
    draftId: input.draftId,
    mediaId: input.mediaId,
    encryptedReviewedRef: createReviewedMediaReference(input.mediaId, dependencies.createCommitId()),
    encryptionVersion: 'aes-256-gcm.v1',
    receipt: input.review.receipt,
  };
  await dependencies.prepareJournal(journal);
  return resumeReviewedDraftCommit(journal, input, dependencies);
}

export async function recoverPendingReviewedDrafts(
  drafts: readonly StoredDraft[],
  dependencies: RecoveryDependencies & Readonly<{
    cleanupStaleProcessorCaches(): Promise<void>;
    sweepArtifacts(): Promise<void>;
  }>,
): Promise<void> {
  await dependencies.cleanupStaleProcessorCaches().catch(() => undefined);
  try {
    for (const draft of drafts) {
      if (!draft.mediaId || !draft.encryptedReviewedRef || !draft.encryptionVersion || !draft.receipt) continue;
      if (draft.encryptionVersion === UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION) {
        if (draft.uploadJob?.state === 'needs_user' && draft.uploadJob.lastError === 'version_mismatch') continue;
        await recoverReviewedDraft({
          draftId: draft.id,
          mediaId: draft.mediaId,
          encryptedReviewedRef: draft.encryptedReviewedRef,
          encryptionVersion: draft.encryptionVersion as never,
          receipt: draft.receipt,
        }, dependencies);
        continue;
      }
      if (draft.uploadJob?.state !== 'local_persisting') continue;
      await recoverReviewedDraft({
        draftId: draft.id,
        mediaId: draft.mediaId,
        encryptedReviewedRef: draft.encryptedReviewedRef,
        encryptionVersion: draft.encryptionVersion,
        receipt: draft.receipt,
      }, dependencies);
    }
  } finally {
    await dependencies.sweepArtifacts().catch(() => undefined);
  }
}
