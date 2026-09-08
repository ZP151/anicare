import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockList=jest.fn(),mockCreate=jest.fn();let mockOwner:string|null='owner-a';let mockEpoch=0;let mockDelayPin=false;const mockPins:Array<()=>void>=[];
jest.mock('./community',()=>({listCommunityPosts:(...args:unknown[])=>mockList(...args),createCommunityPost:(...args:unknown[])=>mockCreate(...args),blockCommunityAuthor:jest.fn(),deleteCommunityPost:jest.fn(),reportCommunityContent:jest.fn()}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,failed:false,reload:jest.fn(),pin:()=>{const epoch=mockEpoch;return async()=>{if(mockDelayPin)await new Promise<void>(resolve=>mockPins.push(resolve));return epoch===mockEpoch;};}})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'zh-CN'})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()}),useLocalSearchParams:()=>({communitySlug:'tampines'})}));
import CommunityScreen from '../../app/community/index';
const post=(body:string)=>({postId:'00000000-0000-4000-8000-000000000001',body,catId:null,communitySlug:'tampines',createdAt:'2026-09-09T00:00:00Z',author:{name:'Neighbour',avatarKey:'cat'},replyCount:0,canDelete:false,cursor:'00000000-0000-4000-8000-000000000001'});
beforeEach(()=>{jest.clearAllMocks();mockOwner='owner-a';mockEpoch++;mockDelayPin=false;mockPins.length=0;mockList.mockResolvedValue({items:[],nextCursor:null});});
it('uses human community context and Chinese controls',async()=>{
 const view=await render(<CommunityScreen/>);expect(await view.findByText('邻里讨论')).toBeTruthy();expect(view.getByLabelText('发起讨论')).toBeTruthy();expect(view.getByText(/Tampines/)).toBeTruthy();await view.unmount();
});
it('does not reveal a stale feed after account switching',async()=>{
 let finish:(v:unknown)=>void=()=>{};mockList.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({items:[post('New account feed')],nextCursor:null});
 const view=await render(<CommunityScreen/>);mockOwner='owner-b';mockEpoch++;await view.rerender(<CommunityScreen/>);
 await view.findByText('New account feed');await act(async()=>finish({items:[post('Old account feed')],nextCursor:null}));
 expect(view.queryByText('Old account feed')).toBeNull();await view.unmount();
});
it('single-flights two presses even while the session check is pending',async()=>{
 const view=await render(<CommunityScreen/>);await waitFor(()=>expect(mockList).toHaveBeenCalled());
 await fireEvent.changeText(view.getByLabelText('发起讨论'),'Clean water bowls today.');
 mockDelayPin=true;mockCreate.mockImplementation(()=>new Promise(()=>{}));
 await fireEvent.press(view.getByLabelText('发布'));await fireEvent.press(view.getByLabelText('发布'));
 mockDelayPin=false;await act(async()=>mockPins.splice(0).forEach(resolve=>resolve()));
 expect(mockCreate).toHaveBeenCalledTimes(1);await view.unmount();
});
