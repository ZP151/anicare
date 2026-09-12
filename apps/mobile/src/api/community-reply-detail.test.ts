import { getCommunityReply } from './community-reply-detail';
const id='00000000-0000-4000-8000-000000000001';
const row={replyId:id,body:'Near the garden',createdAt:'2026-09-13T01:00:00Z',author:{name:'Mei',avatarKey:'person'},canDelete:false,cursor:id};
const client=(data:unknown)=>({rpc:jest.fn().mockResolvedValue({data,error:null})});
it('reads a visible reply by exact ID without scanning pages',async()=>{const rpc=client([row]);expect(await getCommunityReply(id,rpc)).toEqual(row);expect(rpc.rpc).toHaveBeenCalledWith('get_public_community_reply',{p_reply_id:id});});
it('distinguishes hidden content from transient reads',async()=>{await expect(getCommunityReply(id,client([]))).rejects.toThrow('community_reply_hidden');await expect(getCommunityReply(id,{rpc:jest.fn().mockResolvedValue({data:null,error:{}})})).rejects.toThrow('community_reply_unavailable');});
it.each([{...row,ownerId:id},{...row,replyId:'00000000-0000-4000-8000-000000000002'},{...row,cursor:'bad'},{...row,body:''},{...row,author:{name:'',avatarKey:'person'}},{...row,author:{name:'Mei',avatarKey:'invalid'}},{...row,author:{...row.author,email:'private'}},{...row,canDelete:'true'}])('rejects invalid reply projection %j',async value=>{await expect(getCommunityReply(id,client([value]))).rejects.toThrow('community_reply_unavailable');});
it('rejects malformed IDs before invoking the server',async()=>{const rpc=client([row]);await expect(getCommunityReply('bad',rpc)).rejects.toThrow();expect(rpc.rpc).not.toHaveBeenCalled();});
