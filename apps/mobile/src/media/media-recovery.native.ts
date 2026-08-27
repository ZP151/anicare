import { listOfflineDrafts, markReviewedMediaVersionMismatch, saveOfflineDraft } from '../offline/draft-store';
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
  const drafts = await listOfflineDrafts();
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
        await markReviewedMediaVersionMismatch(journal.draftId);
        return;
      }
      const draft = byId.get(journal.draftId);
      if (!draft) return;
      await saveOfflineDraft(mediaDraftUpdate(draft, journal, 'needs_user', error));
    },
    sweepArtifacts: sweepOwnedReviewedMedia,
  });
}
