import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockRpc=jest.fn();const mockPush=jest.fn();let mockListener:()=>void=()=>{};
jest.mock('../api/supabase',()=>({getSupabaseClient:()=>({rpc:mockRpc})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../auth/session-subject',()=>({readSessionSubjectStrict:async()=>null,subscribeSessionSubject:(fn:()=>void)=>{mockListener=fn;return()=>{};}}));
import {CatCommunityContext} from './CatCommunityContext';
const id='00000000-0000-4000-8000-000000000102';
beforeEach(()=>{jest.clearAllMocks();});
it('shows named community activity and navigates with a planning-area ID or cat ID only',async()=>{
 mockRpc.mockResolvedValue({data:[{publicCellId:'896526add03ffff',timeBucket:'today',residenceType:'hdb',residenceName:'Block 123'}],error:null});
 const view=await render(<CatCommunityContext animalId={id} locale="en"/>);
 await fireEvent.press(await view.findByText('Tampines'));expect(mockPush).toHaveBeenCalledWith('/map?communityId=tampines');
 expect(view.getByText('Block 123')).toBeTruthy();await fireEvent.press(view.getByLabelText('Discuss this cat'));expect(mockPush).toHaveBeenCalledWith(`/community?catId=${id}`);
 expect(JSON.stringify(view.toJSON())).not.toContain('896526add03ffff');await view.unmount();
});
it('discards activity completed under a previous session',async()=>{
 let finish:(v:unknown)=>void=()=>{};mockRpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({data:[],error:null});
 const view=await render(<CatCommunityContext animalId={id} locale="en"/>);await waitFor(()=>expect(mockRpc).toHaveBeenCalledTimes(1));
 await act(async()=>mockListener());await act(async()=>finish({data:[{publicCellId:'896526add03ffff',timeBucket:'today',residenceType:null,residenceName:null}],error:null}));
 expect(view.queryByText('Tampines')).toBeNull();await view.unmount();
});
