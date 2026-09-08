import { buildCommunityFeedArgs, parseCommunityFeed } from './community';

const row = {
  postId: '00000000-0000-4000-8000-000000000001', body: 'Please keep bowls clean.',
  catId: null, communitySlug: 'bishan', createdAt: '2026-09-09T10:00:00Z',
  author: { name: 'Neighbour', avatarKey: 'cat' }, replyCount: 0, canDelete: false,
  cursor: '00000000-0000-4000-8000-000000000001',
};

describe('community feed contract', () => {
  it('accepts the narrow anonymous feed projection and exposes its cursor', () => {
    expect(parseCommunityFeed([row])).toEqual({ items: [row], nextCursor: row.cursor });
  });

  it('keeps the requested community scope and bounds pagination', () => {
    expect(buildCommunityFeedArgs({ communitySlug: 'bishan', limit: 99 })).toEqual({
      p_cursor: null, p_limit: 50, p_community_slug: 'bishan', p_cat_id: null,
    });
  });

  it('rejects raw author identifiers and malformed slugs', () => {
    expect(() => parseCommunityFeed([{ ...row, authorId: '00000000-0000-4000-8000-000000000002' }])).toThrow('invalid_community_feed');
    expect(() => buildCommunityFeedArgs({ communitySlug: 'Bishan!' })).toThrow('invalid_community_feed_request');
  });
});
