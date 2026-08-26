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
  receipt: ReviewReceipt;
}>): Promise<never> { return unavailable(); }

export async function cleanupProcessorCacheUris(_uris: readonly string[]): Promise<void> { unavailable(); }
export async function deleteReviewedMediaReference(_reference: string): Promise<void> { unavailable(); }
export async function sweepOwnedReviewedMedia(_activeReferences: ReadonlySet<string>): Promise<void> { unavailable(); }
