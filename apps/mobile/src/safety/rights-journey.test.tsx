import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockAnimal='00000000-0000-4000-8000-000000008801';const mockSighting='00000000-0000-4000-8000-000000008802';
let mockSubject:string|null='00000000-0000-4000-8000-000000008803';const mockListeners=new Set<()=>void>();
const mockRpc=jest.fn();const mockStorage=new Map<string,string>();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({id:mockAnimal}),useRouter:()=>({push:jest.fn()})}));
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000008809'}));
jest.mock('expo-secure-store',()=>({getItemAsync:async(k:string)=>mockStorage.get(k)??null,setItemAsync:async(k:string,v:string)=>{mockStorage.set(k,v);},deleteItemAsync:async(k:string)=>{mockStorage.delete(k);}}));
jest.mock('../api/supabase',()=>({getSupabaseClient:()=>({rpc:mockRpc})}));
jest.mock('../auth/session-subject',()=>({readSessionSubjectStrict:async()=>mockSubject,subscribeSessionSubject:(f:()=>void)=>{mockListeners.add(f);return()=>mockListeners.delete(f);}}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
import Safety from '../../app/safety/[id]';
import Privacy from '../../app/privacy';
beforeEach(()=>{mockRpc.mockReset();mockStorage.clear();mockListeners.clear();mockSubject='00000000-0000-4000-8000-000000008803';});
function base(name:string){if(name==='is_adult_contributor')return {data:true,error:null};if(name==='list_public_cat_safety_activity')return {data:[{sightingId:mockSighting,timeBucket:'earlier',cursor:mockSighting}],error:null};return {data:[],error:null};}
it('reports a real public sighting, persists response-loss retry and shows only received outcome',async()=>{
 let calls=0;mockRpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{if(name==='create_moderation_report'){if(++calls===1)throw new Error('lost');return {data:args.p_request_id,error:null};}return base(name);});
 const view=await render(<Safety/>);await fireEvent.press(await view.findByRole('button',{name:'Select activity 1'}));await fireEvent.press(view.getByRole('button',{name:'Report selected activity'}));await view.findByText('Could not confirm the response. Retry uses the same request.');await view.unmount();
 const reopened=await render(<Safety/>);await fireEvent.press(await reopened.findByRole('button',{name:'Retry pending request'}));await reopened.findByText('Request received. You can check its status in Privacy and requests.');
 const requests=mockRpc.mock.calls.filter(c=>c[0]==='create_moderation_report');expect(requests).toHaveLength(2);expect(requests[0]).toEqual(requests[1]);expect(requests[0][1].p_content_id).toBe(mockSighting);
});
it('blocks through sighting ID without sending an author UUID and refreshes activity',async()=>{
 let blocked=false;mockRpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{if(name==='block_sighting_author'){blocked=true;return {data:[{requestId:args.p_request_id,blocked:true}],error:null};}return blocked?{data:[],error:null}:base(name);});
 const view=await render(<Safety/>);await fireEvent.press(await view.findByRole('button',{name:'Select activity 1'}));await fireEvent.press(view.getByRole('button',{name:'Block this contributor'}));await view.findByText('Request received. You can check its status in Privacy and requests.');
 expect(mockRpc).toHaveBeenCalledWith('block_sighting_author',{p_sighting_id:mockSighting,p_request_id:'00000000-0000-4000-8000-000000008809'});expect(view.queryByRole('button',{name:'Select activity 1'})).toBeNull();
});
it('requests actual erasure, saves a minimal receipt and never claims cleanup complete',async()=>{
 mockRpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==='request_account_erasure'?{data:[{requestId:args.p_request_id,status:'received',receivedAt:new Date().toISOString()}],error:null}:base(name));
 const view=await render(<Privacy/>);await fireEvent.press(await view.findByRole('button',{name:'Request account deletion'}));await fireEvent.press(view.getByRole('button',{name:'Confirm deletion request'}));await view.findByText('Request received. You can check its status in Privacy and requests.');
 const receipt=mockStorage.get('rights.erasure.receipt');expect(receipt).toContain('00000000-0000-4000-8000-000000008809');expect(receipt).not.toContain(mockSubject);expect(JSON.stringify(view.toJSON())).not.toContain('All data deleted');
});
it('does not restore an old private request after sign-out',async()=>{
 let finish!:(x:unknown)=>void;mockRpc.mockImplementation(async(name:string)=>name==='list_my_rights_requests'?new Promise(r=>{finish=r;}):base(name));
 const view=await render(<Privacy/>);await waitFor(()=>expect(mockRpc).toHaveBeenCalledWith('list_my_rights_requests',expect.anything()));
 await act(async()=>{mockSubject=null;mockListeners.forEach(f=>f());finish({data:[{requestId:'00000000-0000-4000-8000-000000008809',kind:'access',status:'received',receivedAt:new Date().toISOString(),cursor:mockSighting}],error:null});});
 await view.findByText('Sign in to view and submit requests.');expect(view.queryByText('Request: access')).toBeNull();
});
it('stopping an old retry does not delete a newer request saved by another screen',async()=>{
 mockRpc.mockImplementation(async(name:string)=>{if(name==='create_moderation_report')throw new Error('lost');return base(name);});
 const view=await render(<Safety/>);await fireEvent.press(await view.findByRole('button',{name:'Select activity 1'}));await fireEvent.press(view.getByRole('button',{name:'Report selected activity'}));await view.findByText('Could not confirm the response. Retry uses the same request.');
 const key=`rights.pending.${mockSubject}`;
 const newer=JSON.stringify({kind:'erase',requestId:'00000000-0000-4000-8000-000000008899'});
 mockStorage.set(key,newer);
 await fireEvent.press(view.getByRole('button',{name:'Stop retrying on this device'}));
 await waitFor(()=>expect(mockStorage.get(key)).toBe(newer));
});
