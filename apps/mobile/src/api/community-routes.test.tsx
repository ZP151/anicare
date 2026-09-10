import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000000004'}));
const mockList=jest.fn(),mockMine=jest.fn(),mockCreate=jest.fn(),mockReplace=jest.fn();let mockOwner:string|null='owner-a';let mockEpoch=0;let mockDelayPin=false;const mockPins:Array<()=>void>=[];let mockParams:Record<string,string>={communitySlug:'tampines'};
jest.mock('./community',()=>({listMyCommunityPosts:(...args:unknown[])=>mockMine(...args),listCommunityPosts:(...args:unknown[])=>mockList(...args),createCommunityPost:(...args:unknown[])=>mockCreate(...args),blockCommunityAuthor:jest.fn(),deleteCommunityPost:jest.fn(),reportCommunityContent:jest.fn()}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,failed:false,reload:jest.fn(),pin:()=>{const epoch=mockEpoch;return async()=>{if(mockDelayPin)await new Promise<void>(resolve=>mockPins.push(resolve));return epoch===mockEpoch;};}})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'zh-CN'})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn(),replace:mockReplace,setParams:jest.fn()}),useFocusEffect:jest.fn(),useLocalSearchParams:()=>mockParams}));
jest.mock('./feed',()=>({listPublicSightings:async()=>({items:[],nextCursor:null})}));
jest.mock('./cat-presentation',()=>({getCatPresentations:async()=>new Map()}));
jest.mock('./community-avatar',()=>({getCommunityAvatars:async()=>new Map()}));
jest.mock('./community-reactions',()=>({getCommunityReactions:async()=>new Map()}));
jest.mock('./community-extras',()=>({getCommunityPostExtras:async()=>new Map(),communityMediaUrl:()=>null}));
import CommunityScreen from '../../app/community/index';
import { COMMUNITY_TEST_POSTS } from '../community/test-samples';
const post=(body:string)=>({postId:'00000000-0000-4000-8000-000000000001',body,catId:null,communitySlug:'tampines',createdAt:'2026-09-09T00:00:00Z',author:{name:'Neighbour',avatarKey:'cat'},replyCount:0,canDelete:false,cursor:'00000000-0000-4000-8000-000000000001'});
beforeEach(()=>{jest.clearAllMocks();mockParams={communitySlug:'tampines'};mockOwner='owner-a';mockEpoch++;mockDelayPin=false;mockPins.length=0;mockList.mockResolvedValue({items:[],nextCursor:null});});
it('renders persisted examples with translated text and a separate test badge',async()=>{
 const sample=COMMUNITY_TEST_POSTS[0]!;
 mockList.mockResolvedValue({items:[{...post(sample.body.en),postId:sample.id}],nextCursor:null});
 const view=await render(<CommunityScreen/>);
 expect(await view.findByText(sample.body.zh)).toBeTruthy();
 expect(view.getByText('测试样本 C01')).toBeTruthy();
 expect(view.queryByText(sample.body.en)).toBeNull();await view.unmount();
});
it('uses the owner collection and clears it after sign out',async()=>{
 mockParams={};mockMine.mockResolvedValue({items:[post('My saved post')],nextCursor:null});
 const view=await render(<CommunityScreen mine/>);
 expect(await view.findByText('My saved post')).toBeTruthy();expect(mockList).not.toHaveBeenCalled();
 mockOwner=null;mockEpoch++;await view.rerender(<CommunityScreen mine/>);
 expect(await view.findByText('登录后查看自己的帖子')).toBeTruthy();expect(view.queryByText('My saved post')).toBeNull();
 await view.unmount();
});
it('uses human community context and Chinese controls',async()=>{
 const view=await render(<CommunityScreen/>);expect(await view.findByRole('header',{name:'社区'})).toBeTruthy();expect(view.queryByLabelText('发起讨论')).toBeNull();expect(view.getByLabelText('发布帖子')).toBeTruthy();await view.unmount();
});
it('offers nearby and cat discovery from the Home community feed',async()=>{
 const view=await render(<CommunityScreen home/>);
 await view.findByRole('header',{name:'发现'});
 expect(view.getByLabelText('附近').props.accessibilityState.selected).toBe(true);
 await fireEvent.press(view.getByLabelText('猫咪'));
 expect(view.getByLabelText('猫咪').props.accessibilityState.selected).toBe(true);
 expect(view.getByLabelText('筛选附近')).toBeTruthy();
 await view.unmount();
});
it('does not reveal a stale feed after account switching',async()=>{
 let finish:(v:unknown)=>void=()=>{};mockList.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({items:[post('New account feed')],nextCursor:null});
 const view=await render(<CommunityScreen/>);mockOwner='owner-b';mockEpoch++;await view.rerender(<CommunityScreen/>);
 await view.findByText('New account feed');await act(async()=>finish({items:[post('Old account feed')],nextCursor:null}));
 expect(view.queryByText('Old account feed')).toBeNull();await view.unmount();
});
it('retains an existing post when pull refresh fails',async()=>{
 mockList.mockResolvedValueOnce({items:[post('Existing post')],nextCursor:null}).mockRejectedValueOnce(new Error('offline'));
 const view=await render(<CommunityScreen/>);await view.findByText('Existing post');
 await act(async()=>view.getByTestId('screen-scroll').props.refreshControl.props.onRefresh());
 await waitFor(()=>expect(view.getByText('Existing post')).toBeTruthy());
 expect(view.getByText('讨论暂未载入，点此重试')).toBeTruthy();await view.unmount();
});
it('single-flights two presses even while the session check is pending',async()=>{
 const view=await render(<CommunityScreen compose/>);await waitFor(()=>expect(mockList).toHaveBeenCalled());
 await fireEvent.changeText(view.getByLabelText('发起讨论'),'Clean water bowls today.');
 mockDelayPin=true;mockCreate.mockImplementation(()=>new Promise(()=>{}));
 await fireEvent.press(view.getByLabelText('发布'));await fireEvent.press(view.getByLabelText('发布'));
 mockDelayPin=false;await act(async()=>mockPins.splice(0).forEach(resolve=>resolve()));
 expect(mockCreate).toHaveBeenCalledTimes(1);await view.unmount();
});
it('selects a Chinese neighbourhood and posts to its stable subzone scope',async()=>{
 mockParams={};mockCreate.mockResolvedValue('00000000-0000-4000-8000-000000000003');
 const view=await render(<CommunityScreen compose/>);
 await fireEvent.press(view.getByText('选择社区'));
 await fireEvent.changeText(view.getByLabelText('搜索社区'),'西海岸');
 await fireEvent.press(view.getByLabelText('西海岸 · West Coast'));
 await fireEvent.changeText(view.getByLabelText('发起讨论'),'西海岸的邻居好');
 await fireEvent.press(view.getByLabelText('发布'));
 await waitFor(()=>expect(mockCreate).toHaveBeenCalledWith('西海岸的邻居好',null,'sg-clsz05',undefined,expect.any(String)));
 expect(mockReplace).toHaveBeenCalledWith('/community?communitySlug=sg-clsz05');
 await view.unmount();
});
