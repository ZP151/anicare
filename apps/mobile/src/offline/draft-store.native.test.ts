import { DRAFT_LIST_SQL, DRAFT_SAVE_SQL, LEGACY_URI_CLEAR_SQL } from './draft-store.native';

describe('native draft storage privacy boundary', () => {
  it('never writes or reads photo_uri and clears legacy values', () => {
    expect(DRAFT_SAVE_SQL).not.toContain('photo_uri');
    expect(DRAFT_LIST_SQL).not.toContain('photo_uri');
    expect(LEGACY_URI_CLEAR_SQL).toBe('UPDATE sighting_drafts SET photo_uri = NULL;');
  });

  it('stores only the encrypted reviewed path, receipt, stable IDs and bounded retry fields', () => {
    for (const field of ['reviewed_media_path', 'review_receipt_json', 'media_id', 'sighting_id', 'upload_state', 'upload_attempts', 'next_attempt_at', 'last_error']) {
      expect(DRAFT_SAVE_SQL).toContain(field);
      expect(DRAFT_LIST_SQL).toContain(field);
    }
    for (const forbidden of ['source_uri', 'canonical_uri', 'latitude', 'longitude', 'access_token']) {
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
});
