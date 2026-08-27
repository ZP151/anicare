jest.mock('../offline/draft-store', () => ({
  listOfflineDrafts: jest.fn(),
  markReviewedMediaVersionMismatch: jest.fn(),
  saveOfflineDraft: jest.fn(),
}));
jest.mock('./draft-media', () => ({
  sweepOwnedProcessorCaches: jest.fn(),
  sweepOwnedReviewedMedia: jest.fn(),
  verifyReviewedMedia: jest.fn(),
}));

import { listOfflineDrafts, markReviewedMediaVersionMismatch, saveOfflineDraft } from '../offline/draft-store';
import { sweepOwnedProcessorCaches, sweepOwnedReviewedMedia, verifyReviewedMedia } from './draft-media';
import { recoverPendingMediaDrafts } from './media-recovery.native';

describe('native startup media recovery order', () => {
  it('cleans stale owned plaintext caches even when the encrypted draft database is temporarily unavailable', async () => {
    const events: string[] = [];
    jest.mocked(sweepOwnedProcessorCaches).mockImplementation(async () => { events.push('cache_cleanup'); });
    jest.mocked(listOfflineDrafts).mockImplementation(async () => {
      events.push('list_drafts');
      throw new Error('secure_store_locked');
    });

    await expect(recoverPendingMediaDrafts()).rejects.toThrow('secure_store_locked');
    expect(events).toEqual(['cache_cleanup', 'list_drafts']);
  });

  it('persists a deserialized unsupported version as needs_user/version_mismatch without artifact inspection', async () => {
    jest.mocked(listOfflineDrafts).mockResolvedValue([{
      id: 'draft-12345678', notes: 'preserved', risk: 'sensitive', mediaId: 'media-12345678',
      sightingId: 'sighting-12345678', encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryptionVersion: 'unsupported' as never,
      receipt: {
        sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
      uploadJob: { state: 'upload_pending', attempts: 2, nextAttemptAt: null, lastError: null },
    }]);
    jest.mocked(sweepOwnedProcessorCaches).mockResolvedValue(undefined);
    jest.mocked(sweepOwnedReviewedMedia).mockResolvedValue(undefined);
    jest.mocked(markReviewedMediaVersionMismatch).mockResolvedValue(undefined);

    await recoverPendingMediaDrafts();

    expect(markReviewedMediaVersionMismatch).toHaveBeenCalledWith('draft-12345678');
    expect(verifyReviewedMedia).not.toHaveBeenCalled();
    expect(saveOfflineDraft).not.toHaveBeenCalled();
  });
});
