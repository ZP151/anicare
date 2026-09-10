import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
const mockList=jest.fn(),mockPush=jest.fn();let mockScale=1;let mockOwner:null|undefined=null;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions',()=>({__esModule:true,default:()=>({width:390,height:844,fontScale:mockScale,scale:3})}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,pin:()=>async()=>true})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../api/community',()=>({listCommunityPosts:(...args:unknown[])=>mockList(...args)}));
jest.mock('../api/community-extras',()=>({getCommunityPostExtras:async()=>new Map()}));
jest.mock('../api/community-reactions',()=>({getCommunityReactions:async()=>new Map()}));
jest.mock('../api/community-avatar',()=>({getCommunityAvatars:async()=>new Map()}));
jest.mock('../api/cat-presentation',()=>({getCatPresentations:async()=>new Map()}));
jest.mock('../api/feed',()=>({listPublicSightings:async()=>({items:[]})}));
import {SocialHome} from './SocialHome';
const post={postId:'00000000-0000-4000-8000-000000004255',body:'A cat in the garden',catId:null,communitySlug:'sg-clsz05',createdAt:'2026-09-11T00:00:00.000Z',author:{name:'Neighbour',avatarKey:'person'},replyCount:0,canDelete:false,cursor:'00000000-0000-4000-8000-000000004255'};
beforeEach(()=>{jest.clearAllMocks();mockScale=1;mockOwner=null;mockList.mockResolvedValue({items:[post],nextCursor:null});});
it('loads the public feed when the initial session check resolves to guest',async()=>{
 mockOwner=undefined;const view=await render(<SocialHome/>);expect(mockList).not.toHaveBeenCalled();mockOwner=null;await view.rerender(<SocialHome/>);await view.findByText(post.body);await view.unmount();
});
it('uses the selected neighbourhood for Nearby and does not label the island feed as nearby',async()=>{
 const view=await render(<SocialHome/>);await view.findByText(post.body);
 expect(mockList).toHaveBeenCalledWith(expect.objectContaining({communitySlug:null}));
 await fireEvent.press(view.getByText('Nearby'));await fireEvent.changeText(view.getByLabelText('Search neighbourhood'),'West Coast');
 await fireEvent.press(view.getByLabelText('West Coast'));
 await waitFor(()=>expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({communitySlug:'sg-clsz05'})));await view.unmount();
});
it('switches large text to one column and opens the selected post',async()=>{
 mockScale=1.5;const view=await render(<SocialHome/>);await view.findByText(post.body);
 const card=view.getByLabelText(`Open post: ${post.body}`);expect(card.parent?.props.style.width).toBe(366);await fireEvent.press(card);expect(mockPush).toHaveBeenCalledWith(`/community/${post.postId}`);await view.unmount();
});
it('retains loaded cards after a failed pull refresh',async()=>{
 const view=await render(<SocialHome/>);await view.findByText(post.body);mockList.mockRejectedValueOnce(new Error('offline'));
 await act(async()=>view.getByTestId('social-home-grid').props.refreshControl.props.onRefresh());
 await view.findByText('Could not refresh. Tap to retry');expect(view.getByText(post.body)).toBeTruthy();await view.unmount();
});
