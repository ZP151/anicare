import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {processAccountErasure} from './erasure';
const request='00000000-0000-4000-8000-000000006001';const actor='00000000-0000-4000-8000-000000006002';const subject='00000000-0000-4000-8000-000000006003';const claim='00000000-0000-4000-8000-000000006004';
const rpc=vi.fn();const getUserById=vi.fn();const deleteUser=vi.fn();const cleanup=vi.fn();
beforeEach(()=>{vi.clearAllMocks();getUserById.mockResolvedValue({data:{user:{id:subject}},error:null});deleteUser.mockResolvedValue({error:null});cleanup.mockResolvedValue(undefined);rpc.mockImplementation(async(name:string)=>({data:name==='claim_account_erasure'?[{requestId:request,subjectId:subject,claimId:claim,status:'processing'}]:[{requestId:request,status:'cleanup_pending'}],error:null}));});
it('claims the server-owned subject, actually deletes Auth, invokes cleanup and returns pending until DB converges',async()=>{
 await expect(processAccountErasure({rpc,auth:{admin:{getUserById,deleteUser}}},request,actor,cleanup)).resolves.toBe('cleanup_pending');
 expect(rpc).toHaveBeenCalledWith('claim_account_erasure',{p_request_id:request,p_admin_actor_id:actor});expect(deleteUser).toHaveBeenCalledWith(subject,false);expect(cleanup).toHaveBeenCalledOnce();expect(rpc).toHaveBeenCalledWith('finish_account_erasure',{p_request_id:request,p_claim_id:claim});
});
it('does not delete on an arbitrary lookup error and releases the request for retry',async()=>{
 getUserById.mockResolvedValue({data:{user:null},error:{status:503}});rpc.mockImplementation(async(name:string)=>name==='claim_account_erasure'?{data:[{requestId:request,subjectId:subject,claimId:claim,status:'processing'}],error:null}:name==='finish_account_erasure'?{data:null,error:{message:'auth_exists'}}:{data:[{requestId:request,status:'retryable'}],error:null});
 await expect(processAccountErasure({rpc,auth:{admin:{getUserById,deleteUser}}},request,actor,cleanup)).resolves.toBe('retryable');expect(deleteUser).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledWith('fail_account_erasure',{p_request_id:request,p_claim_id:claim});
});
it('retries cleanup after Auth is already absent, without a second delete',async()=>{
 getUserById.mockResolvedValue({data:{user:null},error:{status:404,code:'user_not_found'}});rpc.mockImplementation(async(name:string)=>({data:name==='claim_account_erasure'?[{requestId:request,subjectId:subject,claimId:claim,status:'processing'}]:[{requestId:request,status:'completed'}],error:null}));
 await expect(processAccountErasure({rpc,auth:{admin:{getUserById,deleteUser}}},request,actor,cleanup)).resolves.toBe('completed');expect(deleteUser).not.toHaveBeenCalled();expect(cleanup).toHaveBeenCalledOnce();
});
it('does nothing if another processor owns the lease',async()=>{rpc.mockResolvedValue({data:[],error:null});await expect(processAccountErasure({rpc,auth:{admin:{getUserById,deleteUser}}},request,actor,cleanup)).resolves.toBe('busy');expect(getUserById).not.toHaveBeenCalled();});
