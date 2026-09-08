import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
const mockAnimal='00000000-0000-4000-8000-000000007001';
const mockOwner='00000000-0000-4000-8000-000000007002';
let mockSubject:string|null=mockOwner;
const mockListeners=new Set<()=>void>();
const mockRpc=jest.fn(); const mockPush=jest.fn();
let mockSequence=0;
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useFocusEffect:(callback:()=>void)=>{require('react').useEffect(callback,[callback]);}}));
jest.mock('expo-crypto',()=>({randomUUID:()=>`00000000-0000-4000-8000-${String(7100+ ++mockSequence).padStart(12,'0')}`}));
jest.mock('../api/supabase',()=>({getSupabaseClient:()=>({rpc:mockRpc})}));
jest.mock('../auth/session-subject',()=>({readSessionSubjectStrict:async()=>mockSubject,subscribeSessionSubject:(fn:()=>void)=>{mockListeners.add(fn);return()=>mockListeners.delete(fn);}}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en',t:(key:string)=>key})}));
import { FollowControl } from './FollowControl';
import Following from '../../app/(tabs)/following';
import { DiscoveryList } from './DiscoveryList';
const cat={animalId:mockAnimal,primaryAlias:'Return cat',verification:'reported',timeBucket:null,cursor:mockAnimal};
beforeEach(()=>{mockSubject=mockOwner;mockRpc.mockReset();mockPush.mockReset();mockSequence=0;mockListeners.clear();});
it('follows through the actual RPC, retries the same request, reopens from Following and unfollows',async()=>{
 let following=false;let writes=0;
 mockRpc.mockImplementation(async(name:string)=>{
  if(name==='get_my_follow_state')return {data:[{animalId:mockAnimal,following}],error:null};
  if(name==='follow_animal'){following=true;if(++writes===1)throw new Error('lost');return {data:[{animalId:mockAnimal,following:true,followedAt:new Date().toISOString()}],error:null};}
  if(name==='unfollow_animal'){following=false;return {data:[{animalId:mockAnimal,following:false,followedAt:null}],error:null};}
  if(name==='list_my_followed_cats')return {data:following?[cat]:[],error:null};
  return {data:true,error:null};
 });
 const control=await render(<FollowControl animalId={mockAnimal}/>);
 await fireEvent.press(await control.findByRole('button',{name:'Follow cat'}));
 await fireEvent.press(await control.findByRole('button',{name:'Retry follow change'}));
 await control.findByRole('button',{name:'Unfollow cat'});
 const calls=mockRpc.mock.calls.filter(c=>c[0]==='follow_animal');expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);
 await control.unmount();
 const list=await render(<Following/>);await fireEvent.press(await list.findByRole('button',{name:'View Return cat'}));expect(mockPush).toHaveBeenCalledWith(`/cat/${mockAnimal}`);
 await list.unmount();const reopened=await render(<FollowControl animalId={mockAnimal}/>);
 await fireEvent.press(await reopened.findByRole('button',{name:'Unfollow cat'}));await reopened.findByRole('button',{name:'Follow cat'});await reopened.unmount();
 const empty=await render(<Following/>);await empty.findByText('No followed cats are currently available.');
});
it('rejects a stale follow response and clears private list on account change',async()=>{
 let finish!:(x:unknown)=>void;
 mockRpc.mockImplementation(async(name:string)=>name==='list_my_followed_cats'?new Promise(r=>{finish=r;}):{data:true,error:null});
 const view=await render(<Following/>);await waitFor(()=>expect(mockRpc).toHaveBeenCalledWith('list_my_followed_cats',expect.anything()));
 await act(async()=>{mockSubject=null;mockListeners.forEach(f=>f());finish({data:[cat],error:null});});
 await view.findByText('Sign in to follow cats.');expect(view.queryByText('Return cat')).toBeNull();
});
it('uses server filters, pages and de-duplicates discovery; refresh resets cursor',async()=>{
 mockRpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>({data:name==='list_public_cat_discovery'?(args.p_cursor?[cat,{...cat,animalId:'00000000-0000-4000-8000-000000007009',primaryAlias:'Older cat',cursor:'00000000-0000-4000-8000-000000007009'}]:Array.from({length:20},(_,i)=>({...cat,animalId:`00000000-0000-4000-8000-${String(7200+i).padStart(12,'0')}`,primaryAlias:`Cat ${i}`,cursor:`00000000-0000-4000-8000-${String(7200+i).padStart(12,'0')}`}))):true,error:null}));
 const view=await render(<DiscoveryList/>);await fireEvent.press(await view.findByRole('button',{name:'Load more cats'}));await view.findByText('Older cat');
 await fireEvent.press(view.getByRole('button',{name:'Filter cats'}));
 await fireEvent.press(view.getByRole('button',{name:'MacRitchie Nature Trail vicinity'}));await waitFor(()=>expect(mockRpc).toHaveBeenCalledWith('list_public_cat_discovery',expect.objectContaining({p_public_cell_id:'89652636d87ffff',p_cursor:null})));
 await fireEvent.press(view.getByRole('button',{name:'Confirmed'}));await waitFor(()=>expect(mockRpc).toHaveBeenCalledWith('list_public_cat_discovery',expect.objectContaining({p_verifications:['community_confirmed','partner_confirmed'],p_cursor:null})));
 expect(view.queryByText('Older cat')).toBeNull();
});
