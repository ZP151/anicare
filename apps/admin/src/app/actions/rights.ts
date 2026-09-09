import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {getAdminSession} from '../../lib/admin-session';
import {createAdminServiceClient,createWritableAdminServerClient} from '../../lib/supabase/server';
import {getAdminServiceSupabaseConfig} from '../../lib/supabase/config';
import {processAccountErasure} from '../../lib/erasure';
import {RIGHTS_UUID} from '../../lib/rights-api';
export async function updateRightsAction(form:FormData):Promise<void>{
 'use server';
 const request=form.get('requestId');const action=form.get('actionRequestId');const status=form.get('status');
 if(Array.from(form.keys()).sort().join(',')!=='actionRequestId,requestId,status'||typeof request!=='string'||!RIGHTS_UUID.test(request)||typeof action!=='string'||!RIGHTS_UUID.test(action)||typeof status!=='string'||!['reviewing','needs_new_proposal','closed'].includes(status))redirect('/rights?error=request_failed');
 const session=await getAdminSession(async()=>await createWritableAdminServerClient() as never);
 if(session.state==='unauthenticated')redirect('/login');if(session.state!=='authorised')redirect('/rights?error=request_failed');
 try{
  const {data,error}=await (session.client as unknown as import('../../lib/moderation-api').NarrowRpcClient).rpc('admin_update_user_rights_request',{p_request_id:request,p_status:status,p_action_request_id:action});
  if(error||!Array.isArray(data)||data.length!==1||data[0]?.requestId!==request||data[0]?.status!==status)throw new Error('unconfirmed');
 }catch{redirect(`/rights?error=request_failed&requestId=${request}&actionRequestId=${action}`);}
 revalidatePath('/rights');redirect('/rights');
}
export async function processErasureAction(form:FormData):Promise<void>{
 'use server';
 const request=form.get('requestId');
 if(Array.from(form.keys()).join(',')!=='requestId'||typeof request!=='string'||!RIGHTS_UUID.test(request))redirect('/rights?error=request_failed');
 const session=await getAdminSession(async()=>await createWritableAdminServerClient() as never);
 if(session.state==='unauthenticated')redirect('/login');if(session.state!=='authorised')redirect('/rights?error=request_failed');
 const service=createAdminServiceClient();const config=getAdminServiceSupabaseConfig();if(!service||!config)redirect('/rights?error=service_unavailable');
 try{
  await processAccountErasure(service as never,request,session.userId,async()=>{
   for(const name of ['cleanup-media-staging','cleanup-legacy-media','cleanup-profile-avatars']){
    const response=await fetch(`${config.url}/functions/v1/${name}`,{method:'POST',headers:{Authorization:`Bearer ${config.serviceRoleKey}`,apikey:config.serviceRoleKey},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('cleanup_unavailable');
   }
  });
 }catch{redirect('/rights?error=request_failed');}
 revalidatePath('/rights');redirect('/rights');
}
