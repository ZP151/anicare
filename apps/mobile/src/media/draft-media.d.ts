import type { MediaReviewState } from './contracts';

export type PersistedReviewedMedia = Readonly<{
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  mediaId: string;
}>;

export function persistReviewedMedia(input: Readonly<{
  draftId: string;
  mediaId: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
}>): Promise<PersistedReviewedMedia>;
