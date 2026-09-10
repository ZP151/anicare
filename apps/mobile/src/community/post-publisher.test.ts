import {createSocialDraft,editSocialDraft,type SocialDraft,type SocialImage} from './post-draft';
import {publishSocialDraft,uploadSocialImage,type SocialTransport} from './post-publisher';
const owner='00000000-0000-4000-8000-000000004101',id='00000000-0000-4000-8000-000000004102',requestId='00000000-0000-4000-8000-000000004103',jobId='00000000-0000-4000-8000-000000004104';
const now='2026-09-11T00:00:00.000Z',expiresAt='2026-09-11T00:15:00.000Z',origin='https://project.supabase.co';
const variant={width:100,height:100,sha256:'a'.repeat(64),byteLength:3};
const image={id,requestId,thumb:variant,display:variant};
const bytes={imageId:id,thumb:new Uint8Array([1,2,3]),display:new Uint8Array([1,2,3])};
const uploads=Object.fromEntries(['thumb','display'].map(k=>[k,{signedUrl:`${origin}/storage/v1/object/upload/sign/community-media/media/${jobId}/${k}.jpg?token=test`,token:'test'}]));
function transport():SocialTransport {return {origin,now:()=>Date.parse(now),newId:()=>jobId,assertOwner:jest.fn(async()=>{}),edge:jest.fn(async body=>body.action==='reserve'?{jobId,reservationExpiresAt:expiresAt,uploads}:{mediaId:jobId}),put:jest.fn(async()=>({ok:true,status:200})),publish:jest.fn(async()=>jobId)};}
it('persists reservation before uploading and uses only the exact project upload destinations',async()=>{
 const t=transport(),save=jest.fn(async(_image:SocialImage)=>{});
 const result=await uploadSocialImage(owner,image,bytes,t,save);
 expect(result.mediaId).toBe(jobId);
 expect(save.mock.calls[0]?.[0]).toMatchObject({upload:{jobId,expiresAt}});
 expect(save.mock.invocationCallOrder[0]).toBeLessThan((t.put as jest.Mock).mock.invocationCallOrder[0]!);
 const bad=transport();bad.edge=jest.fn(async()=>({jobId,reservationExpiresAt:expiresAt,uploads:{...uploads,thumb:{signedUrl:'https://outside.invalid/photo',token:'test'}}}));
 await expect(uploadSocialImage(owner,image,bytes,bad,save)).rejects.toThrow('invalid_social_upload');expect(bad.put).not.toHaveBeenCalled();
});
it('recovers a lost finalize response from the persisted job without reuploading',async()=>{
 const t=transport();const result=await uploadSocialImage(owner,{...image,upload:{jobId,expiresAt}},bytes,t,async()=>{});
 expect(result.mediaId).toBe(jobId);expect(t.put).not.toHaveBeenCalled();expect(t.edge).toHaveBeenCalledWith({action:'finalize',jobId});
});
it('stops after an account change without sending image bytes or publishing',async()=>{
 const t=transport();(t.assertOwner as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValue(new Error('stale_account'));
 await expect(uploadSocialImage(owner,image,bytes,t,async()=>{})).rejects.toThrow('stale_account');expect(t.put).not.toHaveBeenCalled();
});
it('retains the exact frozen publication on uncertain failure and replays its request id',async()=>{
 let current:SocialDraft=editSocialDraft(createSocialDraft(owner,id,requestId,now),{body:'A quiet afternoon',communitySlug:'sg-clsz05'},now);
 const t=transport();(t.publish as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(jobId);
 const store={read:async()=>current,save:async(_owner:string,draft:SocialDraft)=>{current={...draft,revision:draft.revision+1};return current;},readImage:async()=>bytes,remove:jest.fn(async()=>{}),reopenExpired:jest.fn(async()=>current)};
 await expect(publishSocialDraft(owner,id,store,t)).rejects.toThrow('offline');expect(current.phase).toBe('publishing');expect(store.remove).not.toHaveBeenCalled();
 await expect(publishSocialDraft(owner,id,store,t)).resolves.toBe(jobId);
 expect((t.publish as jest.Mock).mock.calls[0]?.[0]).toEqual((t.publish as jest.Mock).mock.calls[1]?.[0]);expect(store.remove).toHaveBeenCalledWith(owner,id);
});
