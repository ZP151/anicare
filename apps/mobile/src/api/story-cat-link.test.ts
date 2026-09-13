import {getMyStoryCatLink,changeMyStoryCatLink,parseStoryCatLink,listMyStoryLinkRepairs} from './story-cat-link';
const postId='00000000-0000-4000-8000-000000004601',catId='00000000-0000-4000-8000-000000004611',requestId='00000000-0000-4000-8000-000000004621';
const link={postId,catId:null,communitySlug:'bishan',revision:0};
it('reads only the owner management contract',async()=>{
 const rpc=jest.fn().mockResolvedValue({data:link,error:null});expect(await getMyStoryCatLink(postId,{rpc})).toEqual(link);
 expect(rpc).toHaveBeenCalledWith('get_my_story_cat_link',{p_post_id:postId});
});
it.each([{...link,authorId:postId},{...link,revision:-1},{...link,revision:1.2},{...link,catId:'bad'},{...link,communitySlug:'bad space'}])('rejects malformed or extra management fields',value=>expect(()=>parseStoryCatLink(value)).toThrow('invalid_story_link'));
it('sends the original expected revision and request key unchanged',async()=>{
 const rpc=jest.fn().mockResolvedValue({data:{...link,catId,revision:1},error:null});
 await changeMyStoryCatLink({...link,catId,requestId},{rpc});
 expect(rpc).toHaveBeenCalledWith('change_my_story_cat_link',{p_post_id:postId,p_cat_id:catId,p_community_slug:'bishan',p_expected_revision:0,p_request_id:requestId});
});
it.each(['story_link_conflict','story_link_unavailable','cat_unavailable','neighbourhood_required','idempotency_conflict'])('preserves definitive %s rejection',async message=>{
 await expect(changeMyStoryCatLink({...link,requestId},{rpc:async()=>({data:null,error:{code:'P0001',message}})})).rejects.toThrow(message);
});
it('does not classify an uncertain transport failure as a definitive rejection',async()=>{
 await expect(changeMyStoryCatLink({...link,requestId},{rpc:async()=>({data:null,error:{message:'connection lost'}})})).rejects.toThrow('story_link_write_uncertain');
});
it('rejects a response belonging to another post',async()=>{
 await expect(getMyStoryCatLink(postId,{rpc:async()=>({data:{...link,postId:catId},error:null})})).rejects.toThrow('invalid_story_link');
});
it('reads a bounded private repair list without altering the public feed shape',async()=>{
 const item={...link,title:'Garden story',createdAt:'2026-09-13T00:00:00Z'},rpc=jest.fn().mockResolvedValue({data:[item],error:null});
 expect((await listMyStoryLinkRepairs(null,{rpc})).items).toEqual([item]);
 expect(rpc).toHaveBeenCalledWith('list_my_story_link_repairs',{p_cursor:null,p_limit:20});
 await expect(listMyStoryLinkRepairs(null,{rpc:async()=>({data:[{...item,authorId:postId}],error:null})})).rejects.toThrow('invalid_story_link');
});
