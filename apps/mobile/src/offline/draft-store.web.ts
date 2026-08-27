import type { StoredDraft } from './draft-policy';
import type { ReviewedMediaJournal } from '../media/reviewed-draft';

function unavailable(): never {
  throw new Error('secure_offline_storage_unavailable');
}

export async function saveOfflineDraft(_input: Record<string, unknown>): Promise<StoredDraft> {
  return unavailable();
}

export async function listOfflineDrafts(): Promise<StoredDraft[]> {
  return unavailable();
}

export async function saveReviewedMediaJournal(
  _journal: ReviewedMediaJournal,
  _state: 'local_persisting' | 'upload_pending' | 'needs_user',
  _error: 'local_media_missing' | 'local_media_corrupt' | 'version_mismatch' | null,
): Promise<string | null> {
  return unavailable();
}

export async function deleteOfflineDraft(_id: string): Promise<void> {
  return unavailable();
}
