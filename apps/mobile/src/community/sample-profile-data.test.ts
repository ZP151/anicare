import {loadSampleProfilePosts} from './sample-profile-data';
import {SAMPLE_PEOPLE,samplePersonForName,personText} from './sample-people';
import {COMMUNITY_TEST_POSTS} from './test-samples';
jest.mock('../api/community',()=>({getCommunityPost:jest.fn()}));

it('has one stable profile for every post and reply persona, with independent languages',()=>{
 expect(SAMPLE_PEOPLE).toHaveLength(19);
 expect(new Set(SAMPLE_PEOPLE.map(person=>person.id)).size).toBe(19);
 for(const post of COMMUNITY_TEST_POSTS)for(const author of [post.profile,post.replyProfile]){
  const person=samplePersonForName(author.name);expect(person).not.toBeNull();
  expect(personText(person!.bio,'en')).not.toMatch(/[\u4e00-\u9fff]/);
  expect(personText(person!.bio,'zh-CN')).toMatch(/[\u4e00-\u9fff]/);
 }
 expect(samplePersonForName('Actual resident')).toBeNull();
});
it('reads only matching public posts, skips hidden content and orders by published time',async()=>{
 const ids=COMMUNITY_TEST_POSTS.filter(post=>post.profile.name==='Demo Mei').map(post=>post.id);
 const read=jest.fn(async(id:string)=>{if(id===ids[0])throw new Error('community_post_hidden');return {postId:id,createdAt:`2026-09-${id===ids[1]?'11':'12'}T00:00:00Z`} as any;});
 const posts=await loadSampleProfilePosts('mei',read);
 expect(read.mock.calls.map(call=>call[0])).toEqual(ids);
 expect(posts).toHaveLength(ids.length-1);expect(posts.some(post=>post.postId===ids[0])).toBe(false);
 expect(posts.at(-1)?.postId).toBe(ids[1]);
});
it('does not turn a network failure into a successful local feed or resolve unknown users',async()=>{
 const read=jest.fn().mockRejectedValue(new Error('community_unavailable'));
 await expect(loadSampleProfilePosts('mei',read)).rejects.toThrow('community_unavailable');
 read.mockClear();expect(await loadSampleProfilePosts('unknown',read)).toEqual([]);expect(read).not.toHaveBeenCalled();
});
