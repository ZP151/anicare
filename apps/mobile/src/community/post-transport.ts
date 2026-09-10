import {randomUUID} from 'expo-crypto';
import {getSupabaseClient} from '../api/supabase';
import {SocialMediaExpiredError,type SocialTransport} from './post-publisher';

export function createSocialTransport(ownerId:string,isCurrent:()=>boolean):SocialTransport {
 const client=getSupabaseClient();
 async function session(){
  if(!client||!isCurrent())throw new Error('stale_account');
  const {data,error}=await client.auth.getSession();
  if(error||!data.session||data.session.user.id!==ownerId||!isCurrent())throw new Error('stale_account');
  return data.session;
 }
 return {
  origin:process.env.EXPO_PUBLIC_SUPABASE_URL??'',now:Date.now,newId:randomUUID,
  assertOwner:async owner=>{if(owner!==ownerId)throw new Error('stale_account');await session();},
  edge:async body=>{
   const auth=await session();const {data,error}=await client!.functions.invoke('community-media',{body,headers:{Authorization:`Bearer ${auth.access_token}`}});
   if(error)throw new Error('social_upload_failed');return data;
  },
  put:(url,token,bytes)=>fetch(url,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'image/jpeg','x-upsert':'false'},body:new Uint8Array(bytes),redirect:'error'}),
  publish:async draft=>{
   await session();const {data,error}=await client!.rpc('create_community_post_with_media',{p_body:draft.body,p_title:draft.title,p_cat_id:draft.catId,p_community_slug:draft.communitySlug,p_media_ids:draft.images.map(image=>image.mediaId),p_request_id:draft.requestId});
   if(error?.code==='P0001'&&error.message==='community_media_expired')throw new SocialMediaExpiredError();
   if(error||typeof data!=='string')throw new Error('social_publication_failed');return data;
  },
 };
}
