import type { MediaReviewState } from './contracts';

export async function persistReviewedMedia(_input: Readonly<{
  draftId: string;
  mediaId: string;
  review: MediaReviewState;
  processorCacheUris: readonly string[];
}>): Promise<never> {
  throw new Error('secure_media_processing_unavailable');
}
