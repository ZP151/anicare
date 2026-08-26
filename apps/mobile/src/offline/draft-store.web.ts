import type { StoredDraft } from './draft-policy';

function unavailable(): never {
  throw new Error('secure_offline_storage_unavailable');
}

export async function saveOfflineDraft(_input: Record<string, unknown>): Promise<StoredDraft> {
  return unavailable();
}

export async function listOfflineDrafts(): Promise<StoredDraft[]> {
  return unavailable();
}

export async function deleteOfflineDraft(_id: string): Promise<void> {
  return unavailable();
}
