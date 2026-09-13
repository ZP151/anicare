import { listCatStories, parseCatStories } from './cat-stories';

const catId = '00000000-0000-4000-8000-000000000001';
const postId = '00000000-0000-4000-8000-000000000002';
const story = { postId, catId, communitySlug: 'bishan', body: 'Resting in the shade.', title: null, publishedAt: '2026-09-13T10:00:00Z', author: { name: 'Mei', avatarKey: 'cat' }, replyCount: 2, canEditLink: false, media: [] };
const cursor = { v: 1, catId, createdAt: story.publishedAt, postId };

it('reads a narrow page with a self-contained continuation and no media requirement', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: { items: [story], nextCursor: cursor }, error: null });
  await expect(listCatStories(catId, null, { rpc })).resolves.toEqual({ items: [story], nextCursor: cursor });
  expect(rpc).toHaveBeenCalledWith('list_public_cat_stories', { p_cat_id: catId, p_cursor: null, p_limit: 12 });
});

it.each([
  { ...story, authorId: postId }, { ...story, catId: postId }, { ...story, replyCount: -1 },
  { ...story, media: Array.from({ length: 7 }, () => ({ mediaId: postId, width: 100, height: 100 })) },
  { ...story, media: [{ mediaId: postId, width: 0, height: 100 }] },
  { ...story, author: { ...story.author, avatarPath: 'private.jpg' } },
])('rejects malformed or overexposed stories', value => {
  expect(() => parseCatStories({ items: [value], nextCursor: null }, catId)).toThrow('invalid_cat_stories');
});

it('rejects duplicate IDs and a continuation belonging to another cat', () => {
  expect(() => parseCatStories({ items: [story, story], nextCursor: null }, catId)).toThrow();
  expect(() => parseCatStories({ items: [story], nextCursor: { ...cursor, catId: postId } }, catId)).toThrow();
});

it('separates an empty page from unavailable cats and transport failure', async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: { items: [], nextCursor: null }, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'cat_unavailable' } })
    .mockResolvedValueOnce({ data: null, error: { message: 'network failure' } });
  await expect(listCatStories(catId, null, { rpc })).resolves.toEqual({ items: [], nextCursor: null });
  await expect(listCatStories(catId, null, { rpc })).rejects.toThrow('cat_unavailable');
  await expect(listCatStories(catId, null, { rpc })).rejects.toThrow('cat_stories_unavailable');
});

it('rejects an invalid request before network access', async () => {
  const rpc = jest.fn();
  await expect(listCatStories('not-a-cat', null, { rpc })).rejects.toThrow('invalid_cat_story_request');
  expect(rpc).not.toHaveBeenCalled();
});

it('normalizes uppercase cat IDs before reading canonical server UUIDs', async () => {
 const canonical = 'abcdefab-0000-4000-8000-000000000001';
 const rpc = jest.fn().mockResolvedValue({ data: { items: [{ ...story, catId: canonical }], nextCursor: null }, error: null });
 await expect(listCatStories(canonical.toUpperCase(), null, { rpc })).resolves.toMatchObject({ items: [{ catId: canonical }] });
});
it('preserves a server-rejected cursor as an invalid request', async () => {
 const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'invalid_cat_story_request' } });
 await expect(listCatStories(catId, null, { rpc })).rejects.toThrow('invalid_cat_story_request');
});
it('rejects a malformed requested and returned cat ID in the standalone parser', () => {
 expect(() => parseCatStories({ items: [{ ...story, catId: 'bad' }], nextCursor: null }, 'bad')).toThrow('invalid_cat_stories');
});
