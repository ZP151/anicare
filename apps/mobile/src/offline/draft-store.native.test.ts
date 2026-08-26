import { DRAFT_LIST_SQL, DRAFT_SAVE_SQL, LEGACY_URI_CLEAR_SQL } from './draft-store.native';

describe('native draft storage privacy boundary', () => {
  it('never writes or reads photo_uri and clears legacy values', () => {
    expect(DRAFT_SAVE_SQL).not.toContain('photo_uri');
    expect(DRAFT_LIST_SQL).not.toContain('photo_uri');
    expect(LEGACY_URI_CLEAR_SQL).toBe('UPDATE sighting_drafts SET photo_uri = NULL;');
  });
});
