import {act,fireEvent,render} from '@testing-library/react-native';
const mockList=jest.fn(),mockExtras=jest.fn(),mockPush=jest.fn();
jest.mock('../api/community',()=>({listMyCommunityPosts:(...args:any[])=>mockList(...args)}));
jest.mock('../api/community-extras',()=>({getCommunityPostExtras:(...args:any[])=>mockExtras(...args)}));
jest.mock('../community/CommunityPostImage',()=>({CommunityPostImage:({label}:any)=>{const {Text}=require('react-native');return <Text>{label}</Text>;}}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({pin:()=>async()=>true})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn])}));
import {ProfilePosts} from './ProfilePosts';
const post={postId:'p1',body:'My first post',createdAt:'2026-09-12T00:00:00Z'};
beforeEach(()=>{jest.clearAllMocks();mockList.mockResolvedValue({items:[post],nextCursor:null});mockExtras.mockResolvedValue(new Map([['p1',{title:'Afternoon',media:[{mediaId:'m1'},{mediaId:'m2'}]}]]));});
it('opens owner posts and switches to each published photo',async()=>{
 const view=await render(<ProfilePosts pin={()=>async()=>true} owner="owner-a"/>);
 await view.findByText('Afternoon');
 await fireEvent.press(view.getByRole('button',{name:'Afternoon'}));expect(mockPush).toHaveBeenCalledWith('/community/p1');
 await fireEvent.press(view.getByRole('tab',{name:'Photos'}));
 expect(view.getAllByRole('button',{name:/Open photo/})).toHaveLength(2);
 await view.unmount();
});
it('drops previews immediately on account change and ignores a late previous response',async()=>{
 let finish!:(value:any)=>void;mockList.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=await render(<ProfilePosts pin={()=>async()=>true} owner="owner-a"/>);
 await view.rerender(<ProfilePosts pin={()=>async()=>true} owner="owner-b"/>);
 await view.findByText('Afternoon');
 await act(async()=>finish({items:[{...post,postId:'old',body:'Old account photo'}],nextCursor:null}));
 expect(view.queryByText('Old account photo')).toBeNull();await view.unmount();
});
