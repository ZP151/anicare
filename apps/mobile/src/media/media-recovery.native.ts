import {
  getOfflineDraft,
  getPendingReviewedMediaVersionMismatch,
  cleanupPendingReviewedMediaReferences,
  listOfflineDrafts,
  markReviewedMediaVersionMismatch,
  saveOfflineDraft,
} from '../offline/draft-store';
import type { StoredDraft } from '../offline/draft-policy';
import { sweepOwnedProcessorCaches, sweepOwnedReviewedMedia, verifyReviewedMedia } from './draft-media';
import { recoverPendingReviewedDrafts, type ReviewedMediaJournal } from './reviewed-draft';

function mediaDraftUpdate(draft: StoredDraft, journal: ReviewedMediaJournal, state: 'upload_pending' | 'needs_user', lastError: string | null) {
  return {
    ...draft,
    id: journal.draftId,
    mediaId: journal.mediaId,
    encryptedReviewedRef: journal.encryptedReviewedRef,
    receipt: journal.receipt,
    uploadJob: { state, attempts: 0, nextAttemptAt: null, lastError },
  };
}

export async function recoverPendingMediaDrafts(): Promise<void> {
  await sweepOwnedProcessorCaches().catch(() => undefined);
  await cleanupPendingReviewedMediaReferences();
  const drafts = [...await listOfflineDrafts()];
  for (const [index, draft] of drafts.entries()) {
    const pending = getPendingReviewedMediaVersionMismatch(draft);
    if (!pending) continue;
    const marked = await markReviewedMediaVersionMismatch(
      draft.id,
      pending.expectedRevision,
      pending.expectedState,
    );
    if (marked) continue;
    const current = await getOfflineDraft(draft.id);
    if (!current || getPendingReviewedMediaVersionMismatch(current) ||
        current.mediaFailure !== 'version_mismatch' || current.uploadJob?.state !== 'needs_user' ||
        current.uploadJob.lastError !== 'version_mismatch') {
      throw new Error('version_mismatch_marker_conflict');
    }
    drafts[index] = current;
  }
  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  await recoverPendingReviewedDrafts(drafts, {
    cleanupStaleProcessorCaches: async () => undefined,
    inspectArtifact: verifyReviewedMedia,
    finalizeJournal: async (journal) => {
      const draft = byId.get(journal.draftId);
      if (!draft) throw new Error('missing_durable_media_journal');
      await saveOfflineDraft(mediaDraftUpdate(draft, journal, 'upload_pending', null));
    },
    markNeedsUser: async (journal, error) => {
      if (error === 'version_mismatch') {
        const draft = byId.get(journal.draftId);
        const pending = draft && getPendingReviewedMediaVersionMismatch(draft);
        if (!pending || !await markReviewedMediaVersionMismatch(
          journal.draftId, pending.expectedRevision, pending.expectedState,
        )) throw new Error('version_mismatch_marker_conflict');
        return;
      }
      const draft = byId.get(journal.draftId);
      if (!draft) return;
      await saveOfflineDraft(mediaDraftUpdate(draft, journal, 'needs_user', error));
    },
    sweepArtifacts: sweepOwnedReviewedMedia,
  });
}
