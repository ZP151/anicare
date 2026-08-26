import type { StoredDraft } from './draft-policy';

export function saveOfflineDraft(input: Record<string, unknown>): Promise<StoredDraft>;
export function listOfflineDrafts(): Promise<StoredDraft[]>;
export function deleteOfflineDraft(id: string): Promise<void>;
