import {
  deleteOfflineDraftWithDependencies,
  deserializeDraftRows,
  DRAFT_LIST_SQL,
  DRAFT_SAVE_SQL,
  LEGACY_REVIEWED_PATH_CLEAR_SQL,
  LEGACY_URI_CLEAR_SQL,
} from './draft-store.native';
import { selectReviewedMediaSweepTargets } from '../media/media-reference';

describe('native draft storage privacy boundary', () => {
  it('never writes or reads photo_uri and clears legacy values', () => {
    expect(DRAFT_SAVE_SQL).not.toContain('photo_uri');
    expect(DRAFT_LIST_SQL).not.toContain('photo_uri');
    expect(LEGACY_URI_CLEAR_SQL).toBe('UPDATE sighting_drafts SET photo_uri = NULL;');
  });

  it('clears the legacy absolute reviewed-media path during schema migration', () => {
    expect(LEGACY_REVIEWED_PATH_CLEAR_SQL).toBe('UPDATE sighting_drafts SET reviewed_media_path = NULL;');
  });

  it('stores only the opaque reviewed reference, receipt, stable IDs and bounded retry fields', () => {
    for (const field of ['reviewed_media_ref', 'review_receipt_json', 'media_id', 'sighting_id', 'upload_state', 'upload_attempts', 'next_attempt_at', 'last_error']) {
      expect(DRAFT_SAVE_SQL).toContain(field);
      expect(DRAFT_LIST_SQL).toContain(field);
    }
    for (const forbidden of ['reviewed_media_path', 'source_uri', 'canonical_uri', 'latitude', 'longitude', 'access_token']) {
      expect(DRAFT_SAVE_SQL).not.toContain(forbidden);
      expect(DRAFT_LIST_SQL).not.toContain(forbidden);
    }
  });

  it('replaces the complete retry snapshot for media updates so stale errors and delays can clear', () => {
    expect(DRAFT_SAVE_SQL).toContain(
      'next_attempt_at = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.next_attempt_at',
    );
    expect(DRAFT_SAVE_SQL).toContain(
      'last_error = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.last_error',
    );
  });

  it('contains a corrupt receipt row instead of rejecting the entire draft list', () => {
    const validReceipt = JSON.stringify({
      sanitizedSha256: 'a'.repeat(64),
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 100,
      height: 100,
      byteLength: 100,
      confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    });
    const drafts = deserializeDraftRows([
      {
        id: 'draft-12345678', notes: 'valid', risk: 'normal', media_id: 'media-12345678', sighting_id: null,
        reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm', review_receipt_json: validReceipt,
        upload_state: 'upload_pending', upload_attempts: 0, next_attempt_at: null, last_error: null,
      },
      {
        id: 'draft-87654321', notes: 'corrupt receipt', risk: 'sensitive', media_id: 'media-87654321', sighting_id: null,
        reviewed_media_ref: 'reviewed-media/media-87654321.commit-87654321.agcm', review_receipt_json: '{broken',
        upload_state: 'local_persisting', upload_attempts: 0, next_attempt_at: null, last_error: null,
      },
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].encryptedReviewedRef).toBe('reviewed-media/media-12345678.commit-12345678.agcm');
    expect(drafts[1]).toEqual({ id: 'draft-87654321', notes: 'corrupt receipt', risk: 'sensitive' });
    expect(selectReviewedMediaSweepTargets([
      'reviewed-media/media-87654321.commit-87654321.agcm',
    ])).toEqual([]);
  });

  it.each([
    ['reviewed-media/media-12345678.commit-12345678.agcm', ['reviewed-media/media-12345678.commit-12345678.agcm']],
    ['file:///attacker/reviewed-media/media-12345678.commit-12345678.agcm', []],
    ['reviewed-media/../media-12345678.commit-12345678.agcm', []],
  ] as const)('deletes only an anchored owned ciphertext after deleting its draft: %s', async (reference, expectedDeleted) => {
    const events: string[] = [];
    await deleteOfflineDraftWithDependencies('draft-12345678', {
      loadReviewedReference: async () => reference,
      deleteRow: async () => { events.push('row'); },
      deleteOwnedReference: async (value) => { events.push(value); },
    });
    expect(events).toEqual(['row', ...expectedDeleted]);
  });
});
