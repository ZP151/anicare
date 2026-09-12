import {act,fireEvent,render} from '@testing-library/react-native';
const mockLoad=jest.fn(),mockExtras=jest.fn(),mockPush=jest.fn();
let mockId='mei';
const mockPin=()=>async()=>true;
jest.mock('./sample-profile-data',()=>({loadSampleProfilePosts:(...args:any[])=>mockLoad(...args)}));
jest.mock('../api/community-extras',()=>({getCommunityPostExtras:(...args:any[])=>mockExtras(...args)}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:null,pin:mockPin})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:jest.fn(),canGoBack:()=>true}),useLocalSearchParams:()=>({id:mockId}),useFocusEffect:(fn:any)=>require('react').useEffect(fn,[fn])}));
jest.mock('../components/BackButton',()=>({BackButton:()=>null}));
jest.mock('./CommunityAuthorAvatar',()=>({CommunityAuthorAvatar:()=>null}));
jest.mock('./CommunityPostImage',()=>({CommunityPostImage:()=>null}));
import {SampleProfile} from './SampleProfile';
const post={postId:'public-post',body:'An evening walk',createdAt:'2026-09-12T00:00:00Z'};
beforeEach(()=>{jest.clearAllMocks();mockId='mei';mockLoad.mockResolvedValue([post]);mockExtras.mockResolvedValue(new Map([[post.postId,{media:[{mediaId:'m1'},{mediaId:'m2'}]}]]));});
it('shows a labelled persona, actual returned posts and multiple photos with a working post entry',async()=>{
 const view=await render(<SampleProfile/>);await view.findByText('An evening walk');
 expect(view.getByText('Fictional test user')).toBeTruthy();expect(view.getByText(/2 photos/)).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'An evening walk'}));expect(mockPush).toHaveBeenCalledWith('/community/public-post');await view.unmount();
});
it('allows retry after a read failure instead of injecting catalogue posts',async()=>{
 mockLoad.mockRejectedValueOnce(new Error('offline'));
 const view=await render(<SampleProfile/>);await view.findByText('Could not load. Tap to retry');
 expect(view.queryByText('An evening walk')).toBeNull();await fireEvent.press(view.getByRole('button',{name:'Could not load. Tap to retry'}));
 await view.findByText('An evening walk');await view.unmount();
});
it('shows retry when gallery metadata fails instead of presenting an image post as text-only',async()=>{
 mockExtras.mockResolvedValueOnce(new Map());const view=await render(<SampleProfile/>);
 await view.findByText('Could not load. Tap to retry');expect(view.queryByText('An evening walk')).toBeNull();
 await fireEvent.press(view.getByRole('button',{name:'Could not load. Tap to retry'}));await view.findByText(/2 photos/);await view.unmount();
});
it('drops all cards if a post becomes hidden between its detail and gallery reads',async()=>{
 mockLoad.mockResolvedValue([post,{...post,postId:'newly-hidden',body:'Hidden between reads'}]);
 const view=await render(<SampleProfile/>);await view.findByText('Could not load. Tap to retry');
 expect(view.queryByText('An evening walk')).toBeNull();expect(view.queryByText('Hidden between reads')).toBeNull();await view.unmount();
});
it('drops a late response when the profile route changes',async()=>{
 let finish!:(value:any)=>void;mockLoad.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=await render(<SampleProfile/>);mockId='kai';await view.rerender(<SampleProfile/>);await view.findByText('An evening walk');
 await act(async()=>finish([{...post,body:'Old persona content'}]));expect(view.queryByText('Old persona content')).toBeNull();await view.unmount();
});
