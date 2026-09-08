import 'server-only';
import type { NarrowRpcClient } from './moderation-api';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface ErasureService extends NarrowRpcClient {
 auth:{admin:{getUserById(id:string):Promise<{data:{user:{id:string}|null};error:unknown}>;deleteUser(id:string,softDelete:boolean):Promise<{error:unknown}>}};
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export async function processAccountErasure(service:ErasureService,requestId:string,actorId:string,cleanup:()=>Promise<void>):Promise<string>{
 if(!uuid.test(requestId)||!uuid.test(actorId))throw new Error('invalid_erasure');
 const claimed=await service.rpc('claim_account_erasure',{p_request_id:requestId,p_admin_actor_id:actorId});
 if(claimed.error||!Array.isArray(claimed.data))throw new Error('erasure_unavailable');
 if(claimed.data.length===0)return 'busy';
 const claim=claimed.data[0];
 if(claimed.data.length!==1||!record(claim)||Object.keys(claim).length!==4||claim.requestId!==requestId||typeof claim.claimId!=='string'||!uuid.test(claim.claimId)||claim.status!=='processing'||claim.subjectId!==null&&(typeof claim.subjectId!=='string'||!uuid.test(claim.subjectId)))throw new Error('invalid_erasure_claim');
 const args={p_request_id:requestId,p_claim_id:claim.claimId};
 try {
  if(typeof claim.subjectId==='string'){
   const lookup=await service.auth.admin.getUserById(claim.subjectId);
   if(lookup.error && !(record(lookup.error)&&lookup.error.status===404&&lookup.error.code==='user_not_found'))throw new Error('erasure_lookup_failed');
   if(lookup.data.user){
    if(lookup.data.user.id!==claim.subjectId)throw new Error('erasure_lookup_mismatch');
    const deleted=await service.auth.admin.deleteUser(claim.subjectId,false);if(deleted.error)throw new Error('erasure_delete_unconfirmed');
   }
  }
  await cleanup();
 }catch{ /* Reconcile server facts after timeout before deciding whether retry is needed. */ }
 const completed=await service.rpc('finish_account_erasure',args);
 if(!completed.error&&Array.isArray(completed.data)&&completed.data.length===1&&record(completed.data[0])&&Object.keys(completed.data[0]).length===2&&completed.data[0].requestId===requestId&&['completed','cleanup_pending','retryable'].includes(completed.data[0].status as string))return completed.data[0].status as string;
 const failed=await service.rpc('fail_account_erasure',args);
 if(failed.error||!Array.isArray(failed.data)||failed.data.length!==1||!record(failed.data[0])||Object.keys(failed.data[0]).length!==2||failed.data[0].requestId!==requestId||failed.data[0].status!=='retryable')throw new Error('erasure_response_unconfirmed');
 return 'retryable';
}
