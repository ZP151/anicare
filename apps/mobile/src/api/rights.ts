import type { NarrowRpcClient } from './feed';
import { getSupabaseClient } from './supabase';
import { FOLLOW_UUID as UUID } from './follows';
import { reportContent, type ModerationReportRequest } from './safety';
export const RIGHTS_KINDS=['identity_correction','duplicate_cat','appeal','access','correction','withdrawal'] as const;
export type RightsKind=typeof RIGHTS_KINDS[number];
export type PendingSafety = Readonly<
 {kind:'report';request:ModerationReportRequest} |
 {kind:'block';requestId:string;sightingId:string} |
 {kind:'rights';requestId:string;rightsKind:RightsKind;animalId:string|null;detail:string} |
 {kind:'erase';requestId:string}>;
export type RightsItem=Readonly<{requestId:string;kind:RightsKind|'account_erasure';status:string;receivedAt:string;cursor:string}>;
export type SafetyActivity=Readonly<{sightingId:string;timeBucket:'today'|'this_week'|'earlier';cursor:string}>;
export type ModerationStatus=Readonly<{requestId:string;status:string;cursor:string}>;
export type RightsPage<T>=Readonly<{items:readonly T[];nextCursor:string|null}>;
export function safetyRequestId(pending:PendingSafety){return pending.kind==='report'?pending.request.requestId:pending.requestId;}
function exact(row:unknown,keys:string[]):row is Record<string,unknown>{return !!row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===keys.length&&keys.every(k=>Object.hasOwn(row,k));}
function uuid(value:unknown):value is string{return typeof value==='string'&&UUID.test(value);}
const statuses=['received','reviewing','needs_new_proposal','closed','processing','retryable','cleanup_pending','completed'];
async function rpc(name:string,args:Record<string,unknown>,client?:NarrowRpcClient){
 const resolved=client??getSupabaseClient() as unknown as NarrowRpcClient|null;if(!resolved)throw new Error('rights_unavailable');
 try{
  const auth=getSupabaseClient()?.auth;
  const token=auth ? (await auth.getSession()).data.session?.access_token : undefined;
  const {data,error}=await resolved.rpc(name,args);
  if(error){
   if(token&&typeof error==='object'&&error!==null&&'code' in error&&error.code==='42501'&&'message' in error&&error.message==='authentication_required'){
    // A late rejection from a deleted account must not sign out a new session.
    const current=await auth!.getSession();
    if(!current.error&&current.data.session?.access_token===token)await auth!.signOut({scope:'local'}).catch(()=>undefined);
   }
   throw error;
  }
  return data;
 }catch{throw new Error('rights_unavailable');}
}
export async function performSafety(pending:PendingSafety,client?:NarrowRpcClient):Promise<void>{
 const id=safetyRequestId(pending);if(!uuid(id))throw new Error('invalid_rights_request');
 if(pending.kind==='report'){await reportContent(pending.request,client);return;}
 let rows:unknown;
 if(pending.kind==='block'){
  if(!uuid(pending.sightingId))throw new Error('invalid_rights_request');
  rows=await rpc('block_sighting_author',{p_sighting_id:pending.sightingId,p_request_id:id},client);
  if(!Array.isArray(rows)||rows.length!==1||!exact(rows[0],['requestId','blocked'])||rows[0].requestId!==id||rows[0].blocked!==true)throw new Error('invalid_rights_outcome');return;
 }
 if(pending.kind==='rights'){
  if(!RIGHTS_KINDS.includes(pending.rightsKind)||pending.animalId!==null&&!uuid(pending.animalId)||typeof pending.detail!=='string'||!pending.detail.trim()||pending.detail.length>1000)throw new Error('invalid_rights_request');
  rows=await rpc('request_user_rights',{p_kind:pending.rightsKind,p_animal_id:pending.animalId,p_detail:pending.detail,p_request_id:id},client);
 }else if(pending.kind==='erase'){rows=await rpc('request_account_erasure',{p_request_id:id},client);}else throw new Error('invalid_rights_request');
 if(!Array.isArray(rows)||rows.length!==1||!exact(rows[0],['requestId','status','receivedAt'])||rows[0].requestId!==id||!statuses.includes(rows[0].status as string)||typeof rows[0].receivedAt!=='string'||!Number.isFinite(Date.parse(rows[0].receivedAt)))throw new Error('invalid_rights_outcome');
}
async function page<T>(name:string,fields:string[],parse:(row:Record<string,unknown>)=>boolean,cursor:string|null,args:Record<string,unknown>,client?:NarrowRpcClient):Promise<RightsPage<T>>{
 if(cursor!==null&&!uuid(cursor))throw new Error('invalid_rights_cursor');
 const rows=await rpc(name,{...args,p_cursor:cursor,p_limit:20},client);
 if(!Array.isArray(rows)||rows.length>20||rows.some(row=>!exact(row,fields)||!uuid(row.cursor)||!parse(row)))throw new Error('invalid_rights_page');
 return {items:rows as T[],nextCursor:rows.length===20?(rows[19] as {cursor:string}).cursor:null};
}
export function listSafetyActivity(animalId:string,cursor:string|null=null,client?:NarrowRpcClient){
 if(!uuid(animalId))return Promise.reject(new Error('invalid_animal'));
 return page<SafetyActivity>('list_public_cat_safety_activity',['sightingId','timeBucket','cursor'],r=>uuid(r.sightingId)&&['today','this_week','earlier'].includes(r.timeBucket as string),cursor,{p_animal_id:animalId},client);
}
export function listMyRights(cursor:string|null=null,client?:NarrowRpcClient){return page<RightsItem>('list_my_rights_requests',['requestId','kind','status','receivedAt','cursor'],r=>uuid(r.requestId)&&[...RIGHTS_KINDS,'account_erasure'].includes(r.kind as RightsKind)&&statuses.includes(r.status as string)&&typeof r.receivedAt==='string'&&Number.isFinite(Date.parse(r.receivedAt)),cursor,{},client);}
export function listMyModeration(cursor:string|null=null,client?:NarrowRpcClient){return page<ModerationStatus>('list_my_moderation_status',['requestId','status','cursor'],r=>uuid(r.requestId)&&['open','auto_hidden','under_review','resolved','appealed','closed'].includes(r.status as string),cursor,{},client);}

export async function canReportContent(client?:NarrowRpcClient):Promise<boolean>{const value=await rpc('is_adult_contributor',{},client);if(typeof value!=='boolean')throw new Error('rights_unavailable');return value;}
