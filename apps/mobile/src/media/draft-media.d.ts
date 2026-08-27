import type { MediaReviewState, ReviewReceipt } from './contracts';

export type PersistedReviewedMedia = Readonly<{
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  mediaId: string;
}>;
export type ReviewedMediaArtifactStatus = 'absent' | 'valid' | 'corrupt' | 'version_mismatch' | 'retryable_unavailable';
export type VerifyReviewedMediaInput = Readonly<{
  draftId: string;
  mediaId: string;
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  receipt: ReviewReceipt;
}>;
export type ScopedReviewedArtifact = Readonly<{
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
}>;

export function persistReviewedMedia(input: Readonly<{
  draftId: string;
  mediaId: string;
  intendedEncryptedRef: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
}>): Promise<PersistedReviewedMedia>;
export function verifyReviewedMedia(input: VerifyReviewedMediaInput): Promise<ReviewedMediaArtifactStatus>;
export function withDecryptedReviewedJpeg<T>(
  input: VerifyReviewedMediaInput,
  consume: (artifact: ScopedReviewedArtifact) => Promise<T> | T,
): Promise<T>;
export function cleanupProcessorCacheUris(uris: readonly string[]): Promise<void>;
export function deleteReviewedMediaReference(reference: string): Promise<void>;
export function sweepOwnedReviewedMedia(): Promise<void>;
export function sweepOwnedProcessorCaches(): Promise<void>;
