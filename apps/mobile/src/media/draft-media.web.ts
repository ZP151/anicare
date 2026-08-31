import type { MediaReviewState, ReviewReceipt } from './contracts';

function unavailable(): never {
  throw new Error('secure_media_processing_unavailable');
}

export async function persistReviewedMedia(_input: Readonly<{
  draftId: string;
  mediaId: string;
  intendedEncryptedRef: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
}>): Promise<never> {
  return unavailable();
}

export async function verifyReviewedMedia(_input: Readonly<{
  draftId: string;
  mediaId: string;
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  receipt: ReviewReceipt;
}>): Promise<never> { return unavailable(); }

export async function withDecryptedReviewedJpeg<T>(
  _input: Readonly<{
    draftId: string;
    mediaId: string;
    encryptedReviewedRef: string;
    encryptionVersion: 'aes-256-gcm.v1';
    receipt: ReviewReceipt;
  }>,
  _consume: (artifact: Readonly<{ bytes: Uint8Array; sha256: string; byteLength: number }>) => Promise<T> | T,
): Promise<T> {
  return unavailable();
}

export async function cleanupProcessorCacheUris(_uris: readonly string[]): Promise<void> { unavailable(); }
export async function deleteReviewedMediaReference(_reference: string): Promise<void> { unavailable(); }
export async function sweepOwnedReviewedMedia(): Promise<void> { unavailable(); }
export async function sweepOwnedProcessorCaches(): Promise<void> { unavailable(); }
