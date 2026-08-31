jest.mock('../offline/draft-store', () => ({
  ...jest.requireActual('../offline/draft-store.native'),
  cleanupPendingReviewedMediaReferences: jest.fn(),
  getOfflineDraft: jest.fn(),
  listOfflineDrafts: jest.fn(),
  markReviewedMediaVersionMismatch: jest.fn(),
  saveOfflineDraft: jest.fn(),
}));
jest.mock('./draft-media', () => ({
  sweepOwnedProcessorCaches: jest.fn(),
  sweepOwnedReviewedMedia: jest.fn(),
  verifyReviewedMedia: jest.fn(),
}));

import { cleanupPendingReviewedMediaReferences, getOfflineDraft, listOfflineDrafts, markReviewedMediaVersionMismatch, saveOfflineDraft } from '../offline/draft-store';
import { sweepOwnedProcessorCaches, sweepOwnedReviewedMedia, verifyReviewedMedia } from './draft-media';
import { recoverPendingMediaDrafts } from './media-recovery.native';

const { deserializeDraftRows } = jest.requireActual('../offline/draft-store.native') as {
  deserializeDraftRows(rows: readonly ReturnType<typeof versionRow>[]): import('../offline/draft-policy').StoredDraft[];
};

describe('native startup media recovery order', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cleans stale owned plaintext caches even when the encrypted draft database is temporarily unavailable', async () => {
    const events: string[] = [];
    jest.mocked(sweepOwnedProcessorCaches).mockImplementation(async () => { events.push('cache_cleanup'); });
    jest.mocked(cleanupPendingReviewedMediaReferences).mockImplementation(async () => { events.push('final_cleanup'); });
    jest.mocked(listOfflineDrafts).mockImplementation(async () => {
      events.push('list_drafts');
      throw new Error('secure_store_locked');
    });

    await expect(recoverPendingMediaDrafts()).rejects.toThrow('secure_store_locked');
    expect(events).toEqual(['cache_cleanup', 'final_cleanup', 'list_drafts']);
  });

  it('drains durable final-reference cleanup before reading journals or considering transport', async () => {
    const events: string[] = [];
    jest.mocked(sweepOwnedProcessorCaches).mockImplementation(async () => { events.push('cache_cleanup'); });
    jest.mocked(cleanupPendingReviewedMediaReferences).mockImplementation(async () => { events.push('final_cleanup'); });
    jest.mocked(listOfflineDrafts).mockImplementation(async () => { events.push('list_drafts'); return []; });
    jest.mocked(sweepOwnedReviewedMedia).mockResolvedValue(undefined);

    await recoverPendingMediaDrafts();

    expect(events).toEqual(['cache_cleanup', 'final_cleanup', 'list_drafts']);
  });

  it('persists a raw unsupported-version row through an exact CAS before recovery filtering', async () => {
    const drafts = deserializeDraftRows([versionRow('upload_pending', null, 2)]);
    jest.mocked(listOfflineDrafts).mockResolvedValue(drafts);
    jest.mocked(sweepOwnedProcessorCaches).mockResolvedValue(undefined);
    jest.mocked(sweepOwnedReviewedMedia).mockResolvedValue(undefined);
    jest.mocked(markReviewedMediaVersionMismatch).mockResolvedValue(true);

    await recoverPendingMediaDrafts();

    expect(markReviewedMediaVersionMismatch).toHaveBeenCalledWith('draft-12345678', 2, 'upload_pending');
    expect(verifyReviewedMedia).not.toHaveBeenCalled();
    expect(saveOfflineDraft).not.toHaveBeenCalled();
  });

  it('does not rewrite an already durably marked unsupported-version row', async () => {
    jest.mocked(listOfflineDrafts).mockResolvedValue(deserializeDraftRows([
      versionRow('needs_user', 'version_mismatch', 3),
    ]));
    jest.mocked(sweepOwnedProcessorCaches).mockResolvedValue(undefined);
    jest.mocked(sweepOwnedReviewedMedia).mockResolvedValue(undefined);

    await recoverPendingMediaDrafts();

    expect(markReviewedMediaVersionMismatch).not.toHaveBeenCalled();
    expect(verifyReviewedMedia).not.toHaveBeenCalled();
  });

  it('re-reads and converges when the targeted version marker loses a stale CAS', async () => {
    jest.mocked(listOfflineDrafts).mockResolvedValue(deserializeDraftRows([
      versionRow('uploading', null, 4, '2026-08-27T00:00:00.000Z'),
    ]));
    jest.mocked(markReviewedMediaVersionMismatch).mockResolvedValue(false);
    jest.mocked(getOfflineDraft).mockResolvedValue(deserializeDraftRows([
      versionRow('needs_user', 'version_mismatch', 5),
    ])[0]);
    jest.mocked(sweepOwnedProcessorCaches).mockResolvedValue(undefined);
    jest.mocked(sweepOwnedReviewedMedia).mockResolvedValue(undefined);

    await recoverPendingMediaDrafts();

    expect(markReviewedMediaVersionMismatch).toHaveBeenCalledTimes(1);
    expect(markReviewedMediaVersionMismatch).toHaveBeenCalledWith('draft-12345678', 4, 'uploading');
    expect(getOfflineDraft).toHaveBeenCalledWith('draft-12345678');
    expect(verifyReviewedMedia).not.toHaveBeenCalled();
  });
});

function versionRow(
  state: 'upload_pending' | 'uploading' | 'needs_user',
  lastError: string | null,
  revision: number,
  attemptStartedAt: string | null = null,
) {
  return {
    id: 'draft-12345678', notes: 'preserved', risk: 'sensitive' as const,
    media_id: 'media-12345678', sighting_id: 'sighting-12345678', owner_subject: 'owner-12345678',
    reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
    encryption_version: 'aes-256-gcm.v2',
    review_receipt_json: JSON.stringify({
      sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    }),
    upload_state: state,
    upload_attempts: state === 'uploading' ? 1 : 2,
    next_attempt_at: null,
    last_error: lastError,
    upload_resume_state: null,
    upload_attempt_started_at: attemptStartedAt,
    revision,
  };
}
