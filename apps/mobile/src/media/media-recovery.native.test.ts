jest.mock('../offline/draft-store', () => ({
  listOfflineDrafts: jest.fn(),
  saveOfflineDraft: jest.fn(),
}));
jest.mock('./draft-media', () => ({
  sweepOwnedProcessorCaches: jest.fn(),
  sweepOwnedReviewedMedia: jest.fn(),
  verifyReviewedMedia: jest.fn(),
}));

import { listOfflineDrafts } from '../offline/draft-store';
import { sweepOwnedProcessorCaches } from './draft-media';
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
});
