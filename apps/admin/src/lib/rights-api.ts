import 'server-only';
import type {NarrowRpcClient} from './moderation-api';
export const RIGHTS_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type AdminRightsItem=Readonly<{requestId:string;kind:string;detail:string|null;animalId:string|null;status:string;receivedAt:string;cursor:string}>;
export async function listRightsQueue(client:NarrowRpcClient,cursor:string|null=null):Promise<AdminRightsItem[]>{
 if(cursor!==null&&!RIGHTS_UUID.test(cursor))throw new Error('invalid_rights_cursor');
 const {data,error}=await client.rpc('admin_list_user_rights_requests',{p_cursor:cursor,p_limit:20});
 if(error||!Array.isArray(data)||data.length>20)throw new Error('rights_unavailable');
 return data.map(row=>{
  if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!==['requestId','kind','detail','animalId','status','receivedAt','cursor'].sort().join(',')||typeof row.requestId!=='string'||!RIGHTS_UUID.test(row.requestId)||typeof row.cursor!=='string'||!RIGHTS_UUID.test(row.cursor)||!['identity_correction','duplicate_cat','appeal','access','correction','withdrawal','account_erasure'].includes(row.kind)||typeof row.status!=='string'||!['received','reviewing','needs_new_proposal','closed','processing','retryable','cleanup_pending','completed'].includes(row.status)||typeof row.receivedAt!=='string'||!Number.isFinite(Date.parse(row.receivedAt))||row.detail!==null&&(typeof row.detail!=='string'||row.detail.length>1000)||row.animalId!==null&&(typeof row.animalId!=='string'||!RIGHTS_UUID.test(row.animalId)))throw new Error('invalid_rights_queue');
  return row as AdminRightsItem;
 });
}
