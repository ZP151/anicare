import { buildPublicFeedRpcArgs, listPublicSightings, parsePublicSightingFeed } from './feed';

const safeRow = {
  sightingId: '00000000-0000-4000-8000-000000000101',
  animalId: '00000000-0000-4000-8000-000000000102',
  primaryAlias: 'Mochi',
  verification: 'community_confirmed',
  publicCellId: '8928308280fffff',
  timeBucket: 'today',
  coverMediaId: null,
  cursor: '00000000-0000-4000-8000-000000000101',
} as const;

describe('public sighting feed API', () => {
  it('maps only the narrow public projection and returns the opaque page cursor', () => {
    expect(parsePublicSightingFeed([safeRow])).toEqual({
      items: [safeRow],
      nextCursor: '00000000-0000-4000-8000-000000000101',
    });
  });

  it.each([
    ['visible_at', '2026-08-27T08:00:00.000Z'],
    ['occurred_at', '2026-08-27T07:30:00.000Z'],
    ['reporter_id', '00000000-0000-4000-8000-000000000103'],
    ['uploader_id', '00000000-0000-4000-8000-000000000104'],
    ['storage_path', 'private/user/cat.jpg'],
    ['notes', 'behind the loading bay'],
    ['traits', { coat: 'tortoiseshell' }],
    ['risk', 'normal'],
    ['internal_score', 0.91],
  ])('rejects an RPC row containing unexpected field %s', (field, value) => {
    expect(() => parsePublicSightingFeed([{ ...safeRow, [field]: value }]))
      .toThrow('invalid_public_sighting_feed');
  });

  it('rejects exact timestamps hidden inside the coarse time bucket or cursor', () => {
    expect(() => parsePublicSightingFeed([{ ...safeRow, timeBucket: '2026-08-27T08:00:00.000Z' }]))
      .toThrow('invalid_public_sighting_feed');
    expect(() => parsePublicSightingFeed([{ ...safeRow, cursor: '2026-08-27T08:00:00.000Z' }]))
      .toThrow('invalid_public_sighting_feed');
  });

  it('clamps page size and rejects malformed cursors or unexpected request fields', () => {
    expect(buildPublicFeedRpcArgs({ limit: 0 })).toEqual({ p_cursor: null, p_limit: 1 });
    expect(buildPublicFeedRpcArgs({ limit: 999 })).toEqual({ p_cursor: null, p_limit: 50 });
    expect(buildPublicFeedRpcArgs({ cursor: safeRow.cursor, limit: 12 })).toEqual({
      p_cursor: safeRow.cursor,
      p_limit: 12,
    });
    expect(() => buildPublicFeedRpcArgs({ cursor: 'timestamp:2026-08-27T08:00:00Z' }))
      .toThrow('invalid_public_feed_request');
    expect(() => buildPublicFeedRpcArgs({ limit: 10, reporterId: safeRow.sightingId } as never))
      .toThrow('invalid_public_feed_request');
  });

  it('uses only list_public_sighting_feed and validates its response', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [safeRow], error: null });

    await expect(listPublicSightings({ limit: 10 }, { rpc })).resolves.toEqual({
      items: [safeRow],
      nextCursor: safeRow.cursor,
    });
    expect(rpc).toHaveBeenCalledWith('list_public_sighting_feed', { p_cursor: null, p_limit: 10 });
  });
});
