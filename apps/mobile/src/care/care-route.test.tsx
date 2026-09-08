import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockAnimal='00000000-0000-4000-8000-000000008001';
const mockOwner='00000000-0000-4000-8000-000000008002';
const mockEvent='00000000-0000-4000-8000-000000008003';
let mockSubject:string|null=mockOwner;
let mockListener:(subject:string|null)=>void=()=>{};
const mockRpc=jest.fn(); const mockPush=jest.fn(); const mockStorage=new Map<string,string>();
let mockParams={id:mockAnimal};
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useRouter:()=>({push:mockPush})}));
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000008009'}));
jest.mock('expo-secure-store',()=>({getItemAsync:async(key:string)=>mockStorage.get(key)??null,setItemAsync:async(key:string,value:string)=>{mockStorage.set(key,value);},deleteItemAsync:async(key:string)=>{mockStorage.delete(key);}}));
jest.mock('../api/supabase',()=>({getSupabaseClient:()=>({rpc:mockRpc})}));
jest.mock('../auth/session-subject',()=>({readSessionSubjectStrict:async()=>mockSubject,subscribeSessionSubject:(fn:typeof mockListener)=>{mockListener=fn;return()=>{};}}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../components/ScreenScaffold',()=>{const React=require('react');const {Text,View}=require('react-native');return {ScreenScaffold:({title,children}:{title:string;children:React.ReactNode})=>React.createElement(View,null,React.createElement(Text,null,title),children)};});
jest.mock('../offline/draft-store',()=>({saveOfflineDraft:jest.fn()}));
import CatRoute from '../../app/cat/[id]';
import CareRoute from '../../app/care/[id]';
import MyCareRoute from '../../app/care/my-care';
const own={careEventId:mockEvent,animalId:mockAnimal,activity:'feed',completedAt:'2026-09-08T00:00:00Z',publicCellId:'89652636d87ffff',createdAt:'2026-09-08T00:01:00Z',status:'recorded',replacementCareEventId:null};
beforeEach(()=>{mockSubject=mockOwner;mockParams={id:mockAnimal};mockRpc.mockReset();mockPush.mockReset();mockStorage.clear();});
function base(name:string){
 if(name==='is_adult_contributor')return {data:true,error:null};
 if(name==='get_public_cat_summary')return {data:[{animalId:mockAnimal,primaryAlias:'Care cat',verification:'reported',timeBucket:null}],error:null};
 if(name==='list_public_care_history')return {data:[],error:null};
 return {data:[],error:null};
}
it('records via the actual care route and resumes a lost response after reopening with the same request',async()=>{
 let writes=0;mockRpc.mockImplementation(async(name:string)=>{if(name==='record_completed_care'){if(++writes===1)throw new Error('lost');return {data:[{careEventId:mockEvent,status:'recorded',visibleAt:null}],error:null};}return base(name);});
 const cat=await render(<CatRoute/>);
 await fireEvent.press(await cat.findByRole('button',{name:'Record completed care for Care cat'}));
 expect(mockPush).toHaveBeenCalledWith({pathname:'/care/[id]',params:{id:mockAnimal}});
 await cat.unmount();
 const view=await render(<CareRoute/>);
 await fireEvent.press(await view.findByText('Feed'));await fireEvent.press(view.getByText('MacRitchie'));
 await fireEvent.press(view.getByRole('button',{name:'Record completed care'}));
 await view.findByText(/could not confirm/i);await view.unmount();
 const second=await render(<CareRoute/>);await fireEvent.press(await second.findByRole('button',{name:'Retry pending care'}));
 await second.findByText('Completed care recorded.');
 const calls=mockRpc.mock.calls.filter(call=>call[0]==='record_completed_care');expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
});
it('loads a second public page using its cursor',async()=>{
 mockRpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==='list_public_care_history'?{data:args.p_cursor?[]:Array.from({length:20},(_,i)=>({careEventId:`00000000-0000-4000-8000-${String(8100+i).padStart(12,'0')}`,cursor:`00000000-0000-4000-8000-${String(8100+i).padStart(12,'0')}`,activity:'feed',publicCellId:'89652636d87ffff',completedWindow:'earlier',provenance:'reported'})),error:null}:base(name));
 const view=await render(<CareRoute/>);await fireEvent.press(await view.findByRole('button',{name:'Load more care'}));
 await waitFor(()=>expect(mockRpc).toHaveBeenCalledWith('list_public_care_history',expect.objectContaining({p_cursor:'00000000-0000-4000-8000-000000008119'})));
});
it('withdrawal response loss retains a retry action and the same request',async()=>{
 let writes=0;let removed=false;
 mockRpc.mockImplementation(async(name:string)=>{if(name==='list_my_care_events')return {data:[{...own,status:removed?'withdrawn':'recorded'}],error:null};if(name==='withdraw_care_event'){if(++writes===1)throw new Error('lost');removed=true;return {data:[{careEventId:mockEvent,status:'withdrawn'}],error:null};}return base(name);});
 const view=await render(<MyCareRoute/>);await fireEvent.press(await view.findByRole('button',{name:'Withdraw'}));
 await fireEvent.press(await view.findByRole('button',{name:'Retry pending care'}));await view.findByText('Withdrawn');
 const calls=mockRpc.mock.calls.filter(call=>call[0]==='withdraw_care_event');expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);
});
it('clears owner records immediately and rejects an old list response after account switch',async()=>{
 let resolve!:(value:unknown)=>void;mockRpc.mockImplementation(async(name:string)=>name==='list_my_care_events'?new Promise(r=>{resolve=r;}):base(name));
 const view=await render(<MyCareRoute/>);await waitFor(()=>expect(mockRpc).toHaveBeenCalledWith('list_my_care_events',expect.anything()));
 await act(async()=>{mockSubject=null;mockListener(null);resolve({data:[own],error:null});});
 expect(await view.findByText('Sign in to view your care records.')).toBeTruthy();expect(view.queryByRole('button',{name:'Withdraw'})).toBeNull();
});

it('corrects an actual owner record and reloads the appended outcome',async()=>{
 let corrected=false;mockRpc.mockImplementation(async(name:string)=>{
  if(name==='list_my_care_events')return {data:[{...own,completedAt:new Date(Date.now()-3600000).toISOString(),status:corrected?'corrected':'recorded',replacementCareEventId:corrected?'00000000-0000-4000-8000-000000008004':null}],error:null};
  if(name==='correct_care_event'){corrected=true;return {data:[{careEventId:mockEvent,replacementCareEventId:'00000000-0000-4000-8000-000000008004',status:'corrected'}],error:null};}
  return base(name);
 });
 const view=await render(<MyCareRoute/>);await fireEvent.press(await view.findByRole('button',{name:'Correct'}));
 await fireEvent.press(view.getByRole('button',{name:'Water'}));await fireEvent.press(view.getByRole('button',{name:'Save correction'}));
 await view.findByText('Corrected');
 expect(mockRpc).toHaveBeenCalledWith('correct_care_event',expect.objectContaining({p_care_event_id:mockEvent,p_activity:'water'}));
});
it('does not send a mutation when a stale UI owner has switched before the tap',async()=>{
 mockRpc.mockImplementation(async(name:string)=>base(name));
 const view=await render(<CareRoute/>);await fireEvent.press(await view.findByText('Feed'));await fireEvent.press(view.getByText('MacRitchie'));
 mockSubject='00000000-0000-4000-8000-000000008005';
 await fireEvent.press(view.getByRole('button',{name:'Record completed care'}));
 expect(mockRpc.mock.calls.some(call=>call[0]==='record_completed_care')).toBe(false);
});
