import { getSupabaseClient } from './supabase';
import type { CommunityRpcClient } from './community';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const avatars = new Set(['person','cat','human-01','human-02','human-03','human-04','human-05','human-06','human-07','human-08','human-09','human-10','human-11','human-12','human-13','human-14','human-15']);
export type CommunityActivity = Readonly<{ eventId:string; kind:'comment'|'like'; postId:string; replyId:string|null; actor:Readonly<{name:string;avatarKey:string}>; createdAt:string; readAt:string|null; cursor:string }>;

function valid(value: unknown): value is CommunityActivity {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;const row=value as Record<string,unknown>;
  return Object.keys(row).length===8&&typeof row.eventId==='string'&&UUID.test(row.eventId)&&['comment','like'].includes(row.kind as string)&&typeof row.postId==='string'&&UUID.test(row.postId)&&
    (row.replyId===null||(typeof row.replyId==='string'&&UUID.test(row.replyId)))&&!!row.actor&&typeof row.actor==='object'&&!Array.isArray(row.actor)&&Object.keys(row.actor as object).length===2&&typeof (row.actor as Record<string,unknown>).name==='string'&&typeof (row.actor as Record<string,unknown>).avatarKey==='string'&&avatars.has((row.actor as Record<string,string>).avatarKey)&&typeof row.createdAt==='string'&&!Number.isNaN(Date.parse(row.createdAt))&&(row.readAt===null||(typeof row.readAt==='string'&&!Number.isNaN(Date.parse(row.readAt))))&&typeof row.cursor==='string'&&UUID.test(row.cursor);
}
function validReadReceipt(value: unknown): value is Readonly<{eventId:string;readAt:string}> {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;const row=value as Record<string,unknown>;
  return Object.keys(row).length===2&&typeof row.eventId==='string'&&UUID.test(row.eventId)&&typeof row.readAt==='string'&&!Number.isNaN(Date.parse(row.readAt));
}

export async function listMyCommunityActivity(cursor:string|null=null, client?:CommunityRpcClient):Promise<Readonly<{items:readonly CommunityActivity[];nextCursor:string|null}>>{
  if(cursor!==null&&!UUID.test(cursor))throw new Error('community_activity_unavailable');const rpc=client??getSupabaseClient() as unknown as CommunityRpcClient|null;if(!rpc)throw new Error('community_activity_unavailable');
  const {data,error}=await rpc.rpc('list_my_community_activity',{p_cursor:cursor,p_limit:20});if(error||!Array.isArray(data)||data.length>20||!data.every(valid))throw new Error('community_activity_unavailable');const items=data as CommunityActivity[];return{items,nextCursor:items.at(-1)?.cursor??null};
}
export async function markCommunityActivityRead(eventIds:readonly string[],client?:CommunityRpcClient):Promise<void>{
  const ids=[...new Set(eventIds)];if(!ids.length||ids.length>20||ids.some(id=>!UUID.test(id)))throw new Error('community_activity_unavailable');const rpc=client??getSupabaseClient() as unknown as CommunityRpcClient|null;if(!rpc)throw new Error('community_activity_unavailable');const {data,error}=await rpc.rpc('mark_community_activity_read',{p_event_ids:ids});if(error||!Array.isArray(data)||data.length!==ids.length||!data.every(validReadReceipt)||data.some(row=>!ids.includes(row.eventId)))throw new Error('community_activity_unavailable');
}
