import { listMyCommunityPosts } from './community';

it('requests an owner-scoped cursor without passing an account identifier', async () => {
  const rpc = jest.fn().mockResolvedValue({data: [], error: null});
  await expect(listMyCommunityPosts(null, {rpc})).resolves.toEqual({items: [], nextCursor: null});
  expect(rpc).toHaveBeenCalledWith('list_my_community_posts', {p_cursor: null, p_limit: 20});
  await expect(listMyCommunityPosts('invalid', {rpc})).rejects.toThrow();
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('does not turn authentication or backend failures into an empty successful collection', async () => {
  await expect(listMyCommunityPosts(null, {rpc:async()=>({data:null,error:{code:'42501'}})})).rejects.toThrow('community_unavailable');
});
