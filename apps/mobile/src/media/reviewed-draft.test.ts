import { saveReviewedDraft } from './reviewed-draft';

const persisted = {
  encryptedReviewedRef: 'reviewed-media/media-12345678.agcm',
  encryptionVersion: 'aes-256-gcm.v1' as const,
  mediaId: 'media-12345678',
};
const receipt = {
  sanitizedSha256: 'a'.repeat(64),
  recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
  width: 10,
  height: 10,
  byteLength: 10,
  confirmedAtLocal: '2026-08-27T00:00:00.000Z',
};
const review = {
  status: 'reviewed' as const,
  rendered: {
    uri: 'file:///cache/animalhelper-reviewed-12345678.jpg',
    sha256: receipt.sanitizedSha256,
    mimeType: 'image/jpeg' as const,
    width: receipt.width,
    height: receipt.height,
    byteLength: receipt.byteLength,
    recipeVersion: receipt.recipeVersion,
    detectorVersions: receipt.detectorVersions,
  },
  masks: [],
  receipt,
};

describe('reviewed draft metadata recovery', () => {
  it('retains encrypted state after SQL failure and retries metadata without re-encrypting', async () => {
    let encryptions = 0;
    let saves = 0;
    const dependencies = {
      persistMedia: async () => { encryptions += 1; return persisted; },
      saveMetadata: async () => {
        saves += 1;
        if (saves === 1) throw new Error('database_locked');
      },
    };

    const first = await saveReviewedDraft({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      review,
      processorCacheUris: [],
      pending: null,
    }, dependencies);
    expect(first.status).toBe('metadata_retry');
    expect(first.pending).toEqual({ persisted, receipt });

    const second = await saveReviewedDraft({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      review: { status: 'needs_review' as const, rendered: null, masks: [], receipt: null },
      processorCacheUris: [],
      pending: first.pending,
    }, dependencies);
    expect(second).toEqual({ status: 'saved', pending: null });
    expect(encryptions).toBe(1);
    expect(saves).toBe(2);
  });
});
