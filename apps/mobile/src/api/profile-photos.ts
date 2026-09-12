import {getSupabaseClient} from './supabase';
import type {CommunityRpcClient} from './community';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PROFILE_PHOTO_PAGE_SIZE=24;
export type PhotoCursor=Readonly<{createdAt:string;postId:string;position:number}>;
export type ProfilePhoto=Readonly<{postId:string;mediaId:string;position:number;width:number;height:number;cursor:PhotoCursor}>;
export type ProfilePhotoPage=Readonly<{items:readonly ProfilePhoto[];nextCursor:PhotoCursor|null}>;
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function uuid(value:unknown):value is string{return typeof value==='string'&&UUID.test(value);}
function position(value:unknown):value is number{return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=5;}
function cursor(value:unknown):value is PhotoCursor{
 return record(value)&&Object.keys(value).length===3&&uuid(value.postId)&&position(value.position)&&typeof value.createdAt==='string'&&value.createdAt.length<=40&&!Number.isNaN(Date.parse(value.createdAt));
}
export function parseProfilePhotos(value:unknown):ProfilePhotoPage{
 if(!Array.isArray(value)||value.length>PROFILE_PHOTO_PAGE_SIZE)throw new Error('invalid_profile_photos');
 const seen=new Set<string>();
 const items=value.map(row=>{
  if(!record(row)||Object.keys(row).length!==6||!uuid(row.postId)||!uuid(row.mediaId)||!position(row.position)||!cursor(row.cursor)||row.cursor.postId!==row.postId||row.cursor.position!==row.position||![row.width,row.height].every(n=>typeof n==='number'&&Number.isInteger(n)&&n>0&&n<=2048)||seen.has(row.mediaId))throw new Error('invalid_profile_photos');
  seen.add(row.mediaId);return row as ProfilePhoto;
 });
 return {items,nextCursor:items.length===PROFILE_PHOTO_PAGE_SIZE?items.at(-1)!.cursor:null};
}
export async function listMyProfilePhotos(after:PhotoCursor|null=null,client?:CommunityRpcClient):Promise<ProfilePhotoPage>{
 if(after!==null&&!cursor(after))throw new Error('invalid_profile_photos');
 const rpc=client??getSupabaseClient() as unknown as CommunityRpcClient|null;
 if(!rpc)throw new Error('profile_photos_unavailable');
 const {data,error}=await rpc.rpc('list_my_community_photos',{p_cursor:after,p_limit:PROFILE_PHOTO_PAGE_SIZE});
 if(error)throw new Error('profile_photos_unavailable');
 return parseProfilePhotos(data);
}
