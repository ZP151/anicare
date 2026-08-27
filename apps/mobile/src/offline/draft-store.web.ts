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

export async function markReviewedMediaVersionMismatch(_id: string): Promise<void> {
  return unavailable();
}

export async function getOfflineDraft(_id: string): Promise<StoredDraft | null> {
  return unavailable();
}

export async function claimMediaUploadAttempt(_id: string, _now: Date, _leaseMs: number): Promise<never> {
  return unavailable();
}

export async function transitionClaimedMediaUpload(_id: string, _revision: number, _next: unknown): Promise<never> {
  return unavailable();
}

export async function attachSightingToDraft(_id: string, _sightingId: string, _ownerSubject: string): Promise<boolean> {
  return unavailable();
}

export async function cleanupQuarantinedMedia(_id: string, _revision: number): Promise<void> {
  return unavailable();
}

export async function deleteOfflineDraft(_id: string): Promise<void> {
  return unavailable();
}
