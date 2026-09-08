import { getSupabaseClient } from './supabase';
import {REPORT_AREAS} from '../maps/report-areas';
import type { NarrowRpcClient } from './feed';
import type { PublicCatSummary } from './cats';
export const FOLLOW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type CatListItem = PublicCatSummary & Readonly<{cursor:string}>;
export type CatPage = Readonly<{items:readonly CatListItem[];nextCursor:string|null}>;
function exact(value:unknown,keys:string[]): value is Record<string,unknown> {
 return !!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k));
}
async function call(name:string,args:Record<string,unknown>,client?:NarrowRpcClient) {
 const rpc=client??getSupabaseClient() as unknown as NarrowRpcClient|null;
 if(!rpc)throw new Error('following_unavailable');
 try {const {data,error}=await rpc.rpc(name,args);if(error)throw error;return data;}catch{throw new Error('following_unavailable');}
}
export async function getFollowState(animalId:string,client?:NarrowRpcClient):Promise<boolean|null>{
 if(!FOLLOW_UUID.test(animalId))throw new Error('invalid_follow');
 const rows=await call('get_my_follow_state',{p_animal_id:animalId},client);
 if(Array.isArray(rows)&&rows.length===0)return null;
 if(!Array.isArray(rows)||rows.length!==1||!exact(rows[0],['animalId','following'])||rows[0].animalId!==animalId||typeof rows[0].following!=='boolean')throw new Error('invalid_follow');
 return rows[0].following;
}
export async function changeFollow(animalId:string,following:boolean,requestId:string,client?:NarrowRpcClient):Promise<void>{
 if(!FOLLOW_UUID.test(animalId)||!FOLLOW_UUID.test(requestId)||typeof following!=='boolean')throw new Error('invalid_follow');
 const rows=await call(following?'follow_animal':'unfollow_animal',{p_animal_id:animalId,p_request_id:requestId},client);
 if(!Array.isArray(rows)||rows.length!==1||!exact(rows[0],['animalId','following','followedAt'])||rows[0].animalId!==animalId||rows[0].following!==following || (following ? typeof rows[0].followedAt!=='string'||!Number.isFinite(Date.parse(rows[0].followedAt)) : rows[0].followedAt!==null))throw new Error('invalid_follow');
}
type PageInput=Readonly<{cursor?:string|null;limit?:number}>;
async function list(name:string,input:PageInput,filters:Record<string,unknown>,client?:NarrowRpcClient):Promise<CatPage>{
 const limit=input.limit??20;const cursor=input.cursor??null;
 if(cursor!==null&&!FOLLOW_UUID.test(cursor)||!Number.isInteger(limit)||limit<1||limit>50)throw new Error('invalid_cat_list');
 const rows=await call(name,{...filters,p_cursor:cursor,p_limit:limit},client);
 if(!Array.isArray(rows)||rows.length>limit)throw new Error('invalid_cat_list');
 const items=rows.map(row=>{
  if(!exact(row,['animalId','primaryAlias','verification','timeBucket','cursor'])||typeof row.animalId!=='string'||!FOLLOW_UUID.test(row.animalId)||typeof row.cursor!=='string'||!FOLLOW_UUID.test(row.cursor)||typeof row.primaryAlias!=='string'||!row.primaryAlias.trim()||row.primaryAlias.length>80||!['reported','community_confirmed','partner_confirmed','disputed','superseded'].includes(row.verification as string)||![null,'today','this_week','earlier'].includes(row.timeBucket as string|null))throw new Error('invalid_cat_list');
  return row as CatListItem;
 });
 return {items,nextCursor:items.length===limit?items.at(-1)!.cursor:null};
}
export function listFollowedCats(input:PageInput={},client?:NarrowRpcClient){return list('list_my_followed_cats',input,{},client);}
export function listDiscoveredCats(input:PageInput&Readonly<{publicCellId?:string|null;confirmed?:boolean}>={},client?:NarrowRpcClient){
 if(input.publicCellId!=null&&!REPORT_AREAS.some(([cell])=>cell===input.publicCellId))return Promise.reject(new Error('invalid_discovery_filter'));
 return list('list_public_cat_discovery',input,{p_public_cell_id:input.publicCellId??null,p_verifications:input.confirmed?['community_confirmed','partner_confirmed']:null},client);
}
