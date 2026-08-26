import type { MediaReviewState, ReviewReceipt } from './contracts';
import type { PersistedReviewedMedia } from './draft-media';

export type PendingReviewedDraft = Readonly<{
  persisted: PersistedReviewedMedia;
  receipt: ReviewReceipt;
}>;

export type SaveReviewedDraftInput = Readonly<{
  draftId: string;
  mediaId: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
  pending: PendingReviewedDraft | null;
}>;

export type SaveReviewedDraftDependencies = Readonly<{
  persistMedia(input: Omit<SaveReviewedDraftInput, 'pending'>): Promise<PersistedReviewedMedia>;
  saveMetadata(input: Record<string, unknown>): Promise<unknown>;
}>;

export async function saveReviewedDraft(
  input: SaveReviewedDraftInput,
  dependencies: SaveReviewedDraftDependencies,
): Promise<Readonly<{ status: 'saved' | 'metadata_retry'; pending: PendingReviewedDraft | null }>> {
  const pending = input.pending ?? {
    persisted: await dependencies.persistMedia({
      draftId: input.draftId,
      mediaId: input.mediaId,
      review: input.review,
      processorCacheUris: input.processorCacheUris,
    }),
    receipt: input.review.receipt!,
  };

  try {
    await dependencies.saveMetadata({
      id: input.draftId,
      mediaId: pending.persisted.mediaId,
      encryptedReviewedRef: pending.persisted.encryptedReviewedRef,
      receipt: pending.receipt,
      uploadJob: { state: 'upload_pending', attempts: 0, nextAttemptAt: null, lastError: null },
    });
    return { status: 'saved', pending: null };
  } catch {
    return { status: 'metadata_retry', pending };
  }
}
