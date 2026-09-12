import {act,fireEvent,render} from '@testing-library/react-native';
const mockList=jest.fn(),mockExtras=jest.fn(),mockPush=jest.fn(),mockPhotos=jest.fn();
jest.mock('../api/profile-photos',()=>({listMyProfilePhotos:(...args:any[])=>mockPhotos(...args)}));
jest.mock('../api/community',()=>({listMyCommunityPosts:(...args:any[])=>mockList(...args)}));
jest.mock('../api/community-extras',()=>({getCommunityPostExtras:(...args:any[])=>mockExtras(...args)}));
jest.mock('../community/CommunityPostImage',()=>({CommunityPostImage:({label}:any)=>{const {Text}=require('react-native');return <Text>{label}</Text>;}}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({pin:()=>async()=>true})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn])}));
import {ProfilePosts} from './ProfilePosts';
const post={postId:'p1',body:'My first post',createdAt:'2026-09-12T00:00:00Z'};
beforeEach(()=>{jest.clearAllMocks();mockPhotos.mockResolvedValue({items:[{postId:'p1',mediaId:'m1',position:0},{postId:'p1',mediaId:'m2',position:1}],nextCursor:null});mockList.mockResolvedValue({items:[post],nextCursor:null});mockExtras.mockResolvedValue(new Map([['p1',{title:'Afternoon',media:[{mediaId:'m1'},{mediaId:'m2'}]}]]));});
it('opens owner posts and switches to each published photo',async()=>{
 const view=await render(<ProfilePosts pin={()=>async()=>true} owner="owner-a"/>);
 await view.findByText('Afternoon');
 await fireEvent.press(view.getByRole('button',{name:'Afternoon'}));expect(mockPush).toHaveBeenCalledWith('/community/p1');
 await fireEvent.press(view.getByRole('tab',{name:'Photos'}));
 expect(await view.findAllByRole('button',{name:/Open photo/})).toHaveLength(2);
 await view.unmount();
});
it('loads the independent album beyond text posts and opens the selected attachment in its post',async()=>{
 mockExtras.mockResolvedValue(new Map());mockList.mockResolvedValue({items:[post],nextCursor:'text-cursor'});
 mockPhotos.mockResolvedValue({items:[{postId:'old-photo-post',mediaId:'photo-six',position:5}],nextCursor:null});
 const view=await render(<ProfilePosts pin={()=>async()=>true} owner="a"/>);
 await view.findAllByText('My first post');await fireEvent.press(view.getByRole('tab',{name:'Photos'}));
 await fireEvent.press(await view.findByRole('button',{name:'Open photo 6'}));
 expect(mockPush).toHaveBeenCalledWith('/community/old-photo-post?mediaId=photo-six');
 expect(view.queryByText('No photos in these posts yet')).toBeNull();await view.unmount();
});
it('retains a loaded album after pagination fails and retries the same photo cursor',async()=>{
 const next={createdAt:'2026-09-13',postId:'p1',position:0};
 mockPhotos.mockResolvedValueOnce({items:[{postId:'p1',mediaId:'m1',position:0}],nextCursor:next}).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({items:[{postId:'p1',mediaId:'m1',position:0},{postId:'p1',mediaId:'m2',position:1}],nextCursor:null});
 const view=await render(<ProfilePosts pin={()=>async()=>true} owner="a"/>);
 await view.findByText('Afternoon');await fireEvent.press(view.getByRole('tab',{name:'Photos'}));await view.findByRole('button',{name:'Open photo 1'});
 await fireEvent.press(view.getByText('Load more'));await view.findByText('Could not load. Tap to retry');
 expect(view.getByRole('button',{name:'Open photo 1'})).toBeTruthy();await fireEvent.press(view.getByText('Could not load. Tap to retry'));
 await view.findByRole('button',{name:'Open photo 2'});expect(view.getAllByRole('button',{name:/Open photo/})).toHaveLength(2);expect(mockPhotos.mock.calls.at(-1)).toEqual([next]);await view.unmount();
});
it('refresh replaces deleted photos and ignores a late previous-account album',async()=>{
 const pin=()=>async()=>true;const view=await render(<ProfilePosts pin={pin} owner="a" refreshToken={0}/>);
 await view.findByText('Afternoon');await fireEvent.press(view.getByRole('tab',{name:'Photos'}));await view.findByRole('button',{name:'Open photo 2'});
 mockPhotos.mockResolvedValueOnce({items:[],nextCursor:null});await view.rerender(<ProfilePosts pin={pin} owner="a" refreshToken={1}/>);await view.findByText('Your published photos will appear here');
 let finish!:(page:any)=>void;mockPhotos.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));await view.rerender(<ProfilePosts pin={pin} owner="a" refreshToken={2}/>);
 await view.rerender(<ProfilePosts pin={pin} owner="b" refreshToken={2}/>);await view.findByText('Afternoon');
 await act(async()=>finish({items:[{postId:'old',mediaId:'old',position:5}],nextCursor:null}));expect(view.queryByRole('button',{name:'Open photo 6'})).toBeNull();await view.unmount();
});
it('drops previews immediately on account change and ignores a late previous response',async()=>{
 let finish!:(value:any)=>void;mockList.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=await render(<ProfilePosts pin={()=>async()=>true} owner="owner-a"/>);
 await view.rerender(<ProfilePosts pin={()=>async()=>true} owner="owner-b"/>);
 await view.findByText('Afternoon');
 await act(async()=>finish({items:[{...post,postId:'old',body:'Old account photo'}],nextCursor:null}));
 expect(view.queryByText('Old account photo')).toBeNull();await view.unmount();
});
