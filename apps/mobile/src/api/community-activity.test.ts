import { listMyCommunityActivity, markCommunityActivityRead } from './community-activity';

const eventId = '00000000-0000-4000-8000-000000000001';
const postId = '00000000-0000-4000-8000-000000000002';
const replyId = '00000000-0000-4000-8000-000000000003';
const event = { eventId, kind: 'comment', postId, replyId, actor: { name: 'Neighbour', avatarKey: 'person' }, createdAt: '2026-09-11T00:00:00Z', readAt: null, cursor: eventId };

it('reads only the approved activity fields and marks returned event ids read', async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: [event], error: null }).mockResolvedValueOnce({ data: null, error: null });
  await expect(listMyCommunityActivity(null, { rpc })).resolves.toEqual({ items: [event], nextCursor: eventId });
  await expect(markCommunityActivityRead([eventId], { rpc })).resolves.toBeUndefined();
  expect(rpc).toHaveBeenNthCalledWith(1, 'list_my_community_activity', { p_cursor: null, p_limit: 20 });
  expect(rpc).toHaveBeenNthCalledWith(2, 'mark_community_activity_read', { p_event_ids: [eventId] });
});

it('rejects private or malformed activity payloads', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ ...event, privateMediaId: 'nope' }], error: null });
  await expect(listMyCommunityActivity(null, { rpc })).rejects.toThrow('community_activity_unavailable');
});
