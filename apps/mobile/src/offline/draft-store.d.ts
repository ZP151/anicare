import type { StoredDraft } from './draft-policy';
import type { ReviewedMediaJournal } from '../media/reviewed-draft';

export function saveOfflineDraft(input: Record<string, unknown>): Promise<StoredDraft>;
export function listOfflineDrafts(): Promise<StoredDraft[]>;
export function deleteOfflineDraft(id: string): Promise<void>;
export function markReviewedMediaVersionMismatch(id: string): Promise<void>;
export function saveReviewedMediaJournal(
  journal: ReviewedMediaJournal,
  state: 'local_persisting' | 'upload_pending' | 'needs_user',
  error: 'local_media_missing' | 'local_media_corrupt' | 'version_mismatch' | null,
): Promise<string | null>;
