import {editSocialDraft,freezeSocialDraft,isSocialId,type SocialDraft,type SocialImage} from './post-draft';
import type {SocialDraftStore,SocialImageBytes} from './post-draft-storage';

export interface SocialTransport {
 origin:string;
 now():number;
 newId():string;
 assertOwner(owner:string):Promise<void>;
 edge(body:Record<string,unknown>):Promise<unknown>;
 put(url:string,token:string,bytes:Uint8Array):Promise<{ok:boolean;status:number}>;
 publish(draft:SocialDraft):Promise<string>;
}
export class SocialMediaExpiredError extends Error{constructor(){super('community_media_expired');}}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function upload(value:unknown,jobId:string,variant:string,origin:string):{signedUrl:string;token:string}{
 if(!record(value)||typeof value.signedUrl!=='string'||typeof value.token!=='string'||!value.token)throw new Error('invalid_social_upload');
 const url=new URL(value.signedUrl),expected=new URL(origin);
 if(expected.protocol!=='https:'||url.origin!==expected.origin||url.username||url.password||url.hash||url.pathname!==`/storage/v1/object/upload/sign/community-media/media/${jobId}/${variant}.jpg`||url.search!==`?token=${encodeURIComponent(value.token)}`)throw new Error('invalid_social_upload');
 return {signedUrl:value.signedUrl,token:value.token};
}

/** Persist each reservation before network writes so a lost response can be resumed. */
export async function uploadSocialImage(owner:string,input:SocialImage,bytes:SocialImageBytes,t:SocialTransport,persist:(image:SocialImage)=>Promise<void>):Promise<SocialImage>{
 await t.assertOwner(owner);
 let image=input;
 if(image.upload&&Date.parse(image.upload.expiresAt)<=t.now()){
  const {upload:_old,mediaId:_media,...rest}=image;image={...rest,requestId:t.newId()};await persist(image);
 }
 if(image.mediaId)return image;
 const finalize=async(jobId:string)=>{
  await t.assertOwner(owner);const result=await t.edge({action:'finalize',jobId});await t.assertOwner(owner);
  return record(result)&&result.mediaId===jobId?jobId:null;
 };
 if(image.upload){
  let completed:string|null=null;
  try{completed=await finalize(image.upload.jobId);}catch{await t.assertOwner(owner);}
  if(completed){image={...image,mediaId:completed};await persist(image);return image;}
 }
 await t.assertOwner(owner);
 const reservation=await t.edge({action:'reserve',requestId:image.requestId,thumb:image.thumb,display:image.display});
 await t.assertOwner(owner);
 if(!record(reservation)||!isSocialId(reservation.jobId)||typeof reservation.reservationExpiresAt!=='string'||!Number.isFinite(Date.parse(reservation.reservationExpiresAt))||Date.parse(reservation.reservationExpiresAt)<=t.now()||Date.parse(reservation.reservationExpiresAt)>t.now()+15*60_000||!record(reservation.uploads)||(image.upload&&image.upload.jobId!==reservation.jobId))throw new Error('invalid_social_upload');
 const thumb=upload(reservation.uploads.thumb,reservation.jobId,'thumb',t.origin),display=upload(reservation.uploads.display,reservation.jobId,'display',t.origin);
 image={...image,upload:{jobId:reservation.jobId,expiresAt:reservation.reservationExpiresAt}};
 await persist(image);await t.assertOwner(owner);
 for(const [destination,data] of [[thumb,bytes.thumb],[display,bytes.display]] as const){
  const response=await t.put(destination.signedUrl,destination.token,data);await t.assertOwner(owner);
  // An earlier attempt may already have written this immutable object; finalize verifies its exact hash.
  if(!response.ok&&response.status!==409&&response.status!==400)throw new Error('social_upload_failed');
 }
 const mediaId=await finalize(reservation.jobId);if(!mediaId)throw new Error('social_upload_failed');
 image={...image,mediaId};await persist(image);return image;
}

type PublisherStore=Pick<SocialDraftStore,'read'|'save'|'readImage'|'remove'|'reopenExpired'>;
const running=new Set<string>();
export async function publishSocialDraft(owner:string,id:string,store:PublisherStore,t:SocialTransport):Promise<string>{
 const key=`${owner}/${id}`;if(running.has(key))throw new Error('social_publication_pending');running.add(key);
 try{
  await t.assertOwner(owner);let draft=await store.read(owner,id);if(!draft)throw new Error('social_draft_unavailable');
  if(!draft.body.trim()||(!draft.catId&&!draft.communitySlug))throw new Error('invalid_social_post');
  if(draft.phase==='editing'){
   for(let index=0;index<draft.images.length;index++){
    await t.assertOwner(owner);const image=draft.images[index]!;const bytes=await store.readImage(owner,id,image.id);
    await uploadSocialImage(owner,image,bytes,t,async next=>{
     await t.assertOwner(owner);const images=[...draft!.images];images[index]=next;
     draft=await store.save(owner,editSocialDraft(draft!,{images},new Date(t.now()).toISOString()));
    });
   }
   await t.assertOwner(owner);draft=await store.save(owner,freezeSocialDraft(draft,new Date(t.now()).toISOString()));
  }
  await t.assertOwner(owner);let postId:string;
  try{postId=await t.publish(draft);}
  catch(error){
   if(error instanceof SocialMediaExpiredError){await t.assertOwner(owner);await store.reopenExpired(owner,id,draft.requestId,t.newId);}
   throw error;
  }
  await t.assertOwner(owner);
  if(!isSocialId(postId))throw new Error('social_publication_failed');
  await store.remove(owner,id);return postId;
 }finally{running.delete(key);}
}
