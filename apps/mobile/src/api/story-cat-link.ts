import { getSupabaseClient } from './supabase';
import type { CommunityRpcClient } from './community';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slug=(v:unknown)=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
export type StoryCatLink=Readonly<{postId:string;catId:string|null;communitySlug:string|null;revision:number}>;
export type StoryCatLinkRequest=StoryCatLink&Readonly<{requestId:string}>;
export function parseStoryCatLink(value:unknown):StoryCatLink {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_story_link');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).length!==4||!uuid(v.postId)||(v.catId!==null&&!uuid(v.catId))||(v.communitySlug!==null&&!slug(v.communitySlug))||typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<0)throw new Error('invalid_story_link');
 return v as StoryCatLink;
}
function clientOrThrow(client?:CommunityRpcClient){const rpc=client??getSupabaseClient() as unknown as CommunityRpcClient|null;if(!rpc)throw new Error('story_link_unavailable');return rpc;}
function response(data:unknown,postId:string){const value=parseStoryCatLink(data);if(value.postId.toLowerCase()!==postId.toLowerCase())throw new Error('invalid_story_link');return value;}
export async function getMyStoryCatLink(postId:string,client?:CommunityRpcClient):Promise<StoryCatLink>{
 if(!uuid(postId))throw new Error('invalid_story_link');
 const {data,error}=await clientOrThrow(client).rpc('get_my_story_cat_link',{p_post_id:postId});
 if(error)throw new Error(typeof error==='object'&&'code' in error&&error.code==='P0001'&&'message' in error&&error.message==='story_link_unavailable'?'story_link_unavailable':'story_link_read_failed');
 return response(data,postId);
}
const definitive=new Set(['story_link_conflict','story_link_unavailable','cat_unavailable','neighbourhood_required','idempotency_conflict','invalid_story_link_request']);
export async function changeMyStoryCatLink(request:StoryCatLinkRequest,client?:CommunityRpcClient):Promise<StoryCatLink>{
 const {requestId,...link}=request;parseStoryCatLink(link);if(!uuid(requestId))throw new Error('invalid_story_link');
 const {data,error}=await clientOrThrow(client).rpc('change_my_story_cat_link',{p_post_id:link.postId,p_cat_id:link.catId,p_community_slug:link.communitySlug,p_expected_revision:link.revision,p_request_id:requestId});
 if(error){const e=error as {code?:unknown;message?:unknown};throw new Error(e.code==='P0001'&&typeof e.message==='string'&&definitive.has(e.message)?e.message:'story_link_write_uncertain');}
 // A malformed response is still an uncertain write: callers must retry the same key.
 return response(data,link.postId);
}

export type StoryLinkRepair=StoryCatLink&Readonly<{title:string;createdAt:string}>;
export async function listMyStoryLinkRepairs(cursor:string|null=null,client?:CommunityRpcClient):Promise<{items:readonly StoryLinkRepair[];nextCursor:string|null}>{
 if(cursor!==null&&!uuid(cursor))throw new Error('invalid_story_link');
 const {data,error}=await clientOrThrow(client).rpc('list_my_story_link_repairs',{p_cursor:cursor,p_limit:20});
 if(error)throw new Error('story_link_read_failed');
 if(!Array.isArray(data)||data.length>20)throw new Error('invalid_story_link');
 const items=data.map(value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_story_link');const {title,createdAt,...link}=value;parseStoryCatLink(link);if(typeof title!=='string'||title.length>120||typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt)))throw new Error('invalid_story_link');return value as StoryLinkRepair;});
 if(new Set(items.map(item=>item.postId)).size!==items.length)throw new Error('invalid_story_link');
 return {items,nextCursor:items.length===20?items.at(-1)!.postId:null};
}
