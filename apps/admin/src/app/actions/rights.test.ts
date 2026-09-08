import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const io=vi.hoisted(()=>({rpc:vi.fn(),serviceRpc:vi.fn(),getUser:vi.fn(),getUserById:vi.fn(),deleteUser:vi.fn(),serviceFactory:vi.fn(),fetch:vi.fn()}));
vi.mock('../../lib/supabase/server',()=>({createWritableAdminServerClient:async()=>({rpc:io.rpc,auth:{getUser:io.getUser}}),createAdminServiceClient:()=>io.serviceFactory()}));
vi.mock('../../lib/supabase/config',()=>({getAdminServiceSupabaseConfig:()=>({url:'https://local.invalid',serviceRoleKey:'test-server-only'})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw new Error(`redirect:${path}`);}}));
import {processErasureAction,updateRightsAction} from './rights';
const request='00000000-0000-4000-8000-000000006001';const actor='00000000-0000-4000-8000-000000006002';const subject='00000000-0000-4000-8000-000000006003';const claim='00000000-0000-4000-8000-000000006004';
function form(values:Record<string,string>){const data=new FormData();Object.entries(values).forEach(([key,value])=>data.set(key,value));return data;}
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',io.fetch);io.fetch.mockResolvedValue({ok:true});io.getUser.mockResolvedValue({data:{user:{id:actor}},error:null});io.rpc.mockResolvedValue({data:true,error:null});io.serviceFactory.mockReturnValue({rpc:io.serviceRpc,auth:{admin:{getUserById:io.getUserById,deleteUser:io.deleteUser}}});io.getUserById.mockResolvedValue({data:{user:{id:subject}},error:null});io.deleteUser.mockResolvedValue({error:null});io.serviceRpc.mockImplementation(async(name:string)=>({data:name==='claim_account_erasure'?[{requestId:request,subjectId:subject,claimId:claim,status:'processing'}]:[{requestId:request,status:'cleanup_pending'}],error:null}));});
it('rechecks platform-admin session before creating a service client or deleting Auth',async()=>{
 io.rpc.mockResolvedValue({data:false,error:null});await expect(processErasureAction(form({requestId:request}))).rejects.toThrow('redirect:/rights?error=request_failed');expect(io.serviceFactory).not.toHaveBeenCalled();expect(io.deleteUser).not.toHaveBeenCalled();
});
it('runs the actual action-to-service deletion and existing cleanup handlers',async()=>{
 await expect(processErasureAction(form({requestId:request}))).rejects.toThrow('redirect:/rights');expect(io.deleteUser).toHaveBeenCalledWith(subject,false);expect(io.fetch).toHaveBeenCalledTimes(2);expect(io.fetch).toHaveBeenCalledWith('https://local.invalid/functions/v1/cleanup-legacy-media',expect.objectContaining({method:'POST',cache:'no-store'}));
});
it('passes a stable action request to human intake handling without changing identities',async()=>{
 io.rpc.mockImplementation(async(name:string)=>({data:name==='admin_has_active_platform_admin'?true:[{requestId:request,status:'reviewing'}],error:null}));const data=form({requestId:request,actionRequestId:claim,status:'reviewing'});await expect(updateRightsAction(data)).rejects.toThrow('redirect:/rights');await expect(updateRightsAction(data)).rejects.toThrow('redirect:/rights');const updates=io.rpc.mock.calls.filter(([name])=>name==='admin_update_user_rights_request');expect(updates).toHaveLength(2);expect(updates[0]).toEqual(updates[1]);expect(io.serviceFactory).not.toHaveBeenCalled();
});
