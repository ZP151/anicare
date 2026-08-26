import type { MediaReviewState, ReviewReceipt } from './contracts';

export type PersistedReviewedMedia = Readonly<{
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  mediaId: string;
}>;
export type ReviewedMediaArtifactStatus = 'absent' | 'valid' | 'corrupt' | 'retryable_unavailable';
export type VerifyReviewedMediaInput = Readonly<{
  draftId: string;
  mediaId: string;
  encryptedReviewedRef: string;
  receipt: ReviewReceipt;
}>;

export function persistReviewedMedia(input: Readonly<{
  draftId: string;
  mediaId: string;
  intendedEncryptedRef: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
}>): Promise<PersistedReviewedMedia>;
export function verifyReviewedMedia(input: VerifyReviewedMediaInput): Promise<ReviewedMediaArtifactStatus>;
export function cleanupProcessorCacheUris(uris: readonly string[]): Promise<void>;
export function deleteReviewedMediaReference(reference: string): Promise<void>;
export function sweepOwnedReviewedMedia(): Promise<void>;
export function sweepOwnedProcessorCaches(): Promise<void>;
