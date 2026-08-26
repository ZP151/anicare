import type { MediaReviewState } from './contracts';

export type PersistedReviewedMedia = Readonly<{
  encryptedReviewedPath: string;
  encryptionVersion: 'aes-256-gcm.v1';
  mediaId: string;
}>;

export function persistReviewedMedia(input: Readonly<{
  draftId: string;
  mediaId: string;
  review: MediaReviewState;
  transientUris: readonly string[];
}>): Promise<PersistedReviewedMedia>;
