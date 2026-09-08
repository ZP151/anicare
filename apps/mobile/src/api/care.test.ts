import { buildRecordCareArgs, recordCompletedCare, correctCareEvent, listMyCareEvents } from './care';
const id='00000000-0000-4000-8000-000000000101'; const request='00000000-0000-4000-8000-000000000102';
describe('care API',()=>{
 it('uses the same complete payload and request id for a lost-response retry',async()=>{const rpc=jest.fn(async()=>({data:[{careEventId:id,visibleAt:null,status:'recorded'}],error:null}));const input={animalId:id,activity:'feed' as const,completedAt:'2026-09-07T10:00:00.000Z',publicCell:'89652636d87ffff',requestId:request};await recordCompletedCare(input,{rpc});await recordCompletedCare(input,{rpc});expect(rpc).toHaveBeenNthCalledWith(2,'record_completed_care',buildRecordCareArgs(input));});
 it('rejects a client-selected unsupported area before RPC',()=>expect(()=>buildRecordCareArgs({animalId:id,activity:'feed',completedAt:'2026-09-07T10:00:00.000Z',publicCell:'89652636d8fffff',requestId:request})).toThrow('invalid_care_input'));
});

it('rejects private extras and missing replacement in correction receipts', async () => {
 const input={activity:'water' as const,completedAt:new Date(Date.now()-60000).toISOString(),publicCell:'89652636d87ffff',requestId:request};
 for (const row of [{careEventId:id,status:'corrected'}, {careEventId:id,replacementCareEventId:request,status:'corrected',actorId:id}]) {
  await expect(correctCareEvent(id,input,{rpc:async()=>({data:[row],error:null})})).rejects.toThrow('invalid_care_response');
 }
});
it('passes the owner cursor to the real RPC instead of always loading page one', async () => {
 const rpc=jest.fn(async()=>({data:[],error:null}));
 await listMyCareEvents({cursor:{createdAt:'2026-09-08T00:00:00Z',careEventId:id}}, {rpc});
 expect(rpc).toHaveBeenCalledWith('list_my_care_events',expect.objectContaining({p_before_care_event_id:id,p_before_created_at:'2026-09-08T00:00:00Z'}));
});
