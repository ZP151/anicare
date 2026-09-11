import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockList=jest.fn(),mockPush=jest.fn(),mockLocation=jest.fn(),mockExtras=jest.fn();let mockScale=1;let mockOwner:null|undefined=null;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions',()=>({__esModule:true,default:()=>({width:390,height:844,fontScale:mockScale,scale:3})}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,pin:()=>async()=>true})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../api/community',()=>({listCommunityPosts:(...args:unknown[])=>mockList(...args)}));
jest.mock('../api/community-extras',()=>({getCommunityPostExtras:(...args:unknown[])=>mockExtras(...args)}));
jest.mock('../api/community-reactions',()=>({getCommunityReactions:async()=>new Map()}));
jest.mock('../api/community-avatar',()=>({getCommunityAvatars:async()=>new Map()}));
jest.mock('../api/cat-presentation',()=>({getCatPresentations:async()=>new Map()}));
jest.mock('../api/feed',()=>({listPublicSightings:async()=>({items:[]})}));
jest.mock('../maps/device-location',()=>({requestDeviceLocation:(...args:unknown[])=>mockLocation(...args)}));
import {SocialHome} from './SocialHome';
import {SG_COMMUNITIES} from '../maps/singapore-communities';
const post={postId:'00000000-0000-4000-8000-000000004255',body:'A cat in the garden',catId:null,communitySlug:'sg-clsz05',createdAt:'2026-09-11T00:00:00.000Z',author:{name:'Neighbour',avatarKey:'person'},replyCount:0,canDelete:false,cursor:'00000000-0000-4000-8000-000000004255'};
beforeEach(()=>{jest.clearAllMocks();mockScale=1;mockOwner=null;mockExtras.mockResolvedValue(new Map());mockList.mockResolvedValue({items:[post],nextCursor:null});mockLocation.mockResolvedValue({kind:'granted',latitude:1.3021,longitude:103.7651});});
it('loads the public feed when the initial session check resolves to guest',async()=>{
 mockOwner=undefined;const view=await render(<SocialHome/>);expect(mockList).not.toHaveBeenCalled();mockOwner=null;await view.rerender(<SocialHome/>);await view.findByText(post.body);await view.unmount();
});
it('uses the selected neighbourhood for Nearby and does not label the island feed as nearby',async()=>{
 const view=await render(<SocialHome/>);await view.findByText(post.body);
 expect(mockList).toHaveBeenCalledWith(expect.objectContaining({communitySlug:null}));
 await fireEvent.press(view.getByText('Nearby'));await waitFor(()=>expect(mockLocation).toHaveBeenCalledTimes(1));
 await fireEvent.press(view.getByLabelText('Choose neighbourhood'));await fireEvent.changeText(view.getByLabelText('Search neighbourhood'),'West Coast');
 await fireEvent.press(view.getByLabelText('West Coast'));
 await waitFor(()=>expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({communitySlug:'sg-clsz05'})));await view.unmount();
});
it('keeps the two-page control synchronized when Nearby is selected and swiped back to Explore',async()=>{
 const view=await render(<SocialHome/>);await view.findByText(post.body);
 await fireEvent.press(view.getByText('Nearby'));await waitFor(()=>expect(mockLocation).toHaveBeenCalledTimes(1));
 await fireEvent(view.getByTestId('social-home-pager'),'momentumScrollEnd',{nativeEvent:{contentOffset:{x:0}}});
 await waitFor(()=>expect(view.getByRole('tab',{name:'Explore'}).props.accessibilityState.selected).toBe(true));
 expect(view.queryByText('Cats')).toBeNull();await view.unmount();
});
it('shows a manual neighbourhood choice only after a location failure',async()=>{
 mockLocation.mockRejectedValueOnce(new Error('timeout'));
 const view=await render(<SocialHome/>);await view.findByText(post.body);await fireEvent.press(view.getByText('Nearby'));
 await view.findByText('Choose a neighbourhood to see nearby posts');
 expect(view.queryByLabelText('Search neighbourhood')).toBeNull();await view.unmount();
});
it('does not let an earlier location result overwrite a manually chosen neighbourhood',async()=>{
 let resolveLocation:(value:unknown)=>void=()=>{};mockLocation.mockImplementationOnce(()=>new Promise(resolve=>{resolveLocation=resolve;}));
 const view=await render(<SocialHome/>);await view.findByText(post.body);await fireEvent.press(view.getByText('Nearby'));
 await fireEvent.press(view.getByLabelText('Choose neighbourhood'));await fireEvent.changeText(view.getByLabelText('Search neighbourhood'),'West Coast');await fireEvent.press(view.getByLabelText('West Coast'));
 const tampines=SG_COMMUNITIES.find(area=>area.id==='tampines')!;await act(async()=>resolveLocation({kind:'granted',latitude:tampines.center[1],longitude:tampines.center[0]}));
 expect(view.getByText(/West Coast/)).toBeTruthy();await view.unmount();
});
it('loads Nearby after a real delayed permission and location response',async()=>{
 let resolveLocation:(value:unknown)=>void=()=>{};
 mockLocation.mockImplementationOnce(()=>new Promise(resolve=>{resolveLocation=resolve;}));
 const view=await render(<SocialHome/>);await view.findByText(post.body);
 await fireEvent.press(view.getByText('Nearby'));
 await view.findByText('Finding your neighbourhood…');
 const west=SG_COMMUNITIES.find(area=>area.id==='sg-clsz05')!;
 await act(async()=>resolveLocation({kind:'granted',latitude:west.center[1],longitude:west.center[0]}));
 await waitFor(()=>expect(mockList).toHaveBeenCalledWith(expect.objectContaining({communitySlug:'sg-clsz05'})));
 expect(view.queryByText('Finding your neighbourhood…')).toBeNull();
 await view.unmount();
});
it('switches large text to one column and opens the selected post',async()=>{
 mockScale=1.5;const view=await render(<SocialHome/>);await view.findByText(post.body);
 const card=view.getByLabelText(`Open post: ${post.body}`);expect(card.parent?.props.style.width).toBe(366);await fireEvent.press(card);expect(mockPush).toHaveBeenCalledWith(`/community/${post.postId}`);await view.unmount();
});
it('keeps each page and its media metadata when swiping back without refetching',async()=>{
 const nearbyPost={...post,postId:'00000000-0000-4000-8000-000000004256',body:'Nearby garden'};
 mockList.mockImplementation(({communitySlug}:{communitySlug:string|null})=>Promise.resolve({items:[communitySlug?nearbyPost:post],nextCursor:null}));
 mockExtras.mockImplementation(async(ids:string[])=>new Map(ids.map(id=>[id,{postId:id,title:id===post.postId?'Explore cover':'Nearby cover',media:[]}])));
 const view=await render(<SocialHome/>);await view.findByText('Explore cover');
 await fireEvent.press(view.getByText('Nearby'));await view.findByText('Nearby cover');
 await fireEvent(view.getByTestId('social-home-pager'),'momentumScrollEnd',{nativeEvent:{contentOffset:{x:0}}});
 expect(view.getByText('Explore cover')).toBeTruthy();
 expect(view.getByTestId('social-home-grid-explore').props.data[0].postId).toBe(post.postId);
 expect(mockList).toHaveBeenCalledTimes(2);
 await view.unmount();
});
it('retains loaded cards after a failed pull refresh',async()=>{
 const view=await render(<SocialHome/>);await view.findByText(post.body);mockList.mockRejectedValueOnce(new Error('offline'));
 await act(async()=>view.getByTestId('social-home-grid-explore').props.refreshControl.props.onRefresh());
 await view.findByText('Could not refresh. Tap to retry');expect(view.getByText(post.body)).toBeTruthy();await view.unmount();
});
