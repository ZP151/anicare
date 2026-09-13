import {act,fireEvent,render} from '@testing-library/react-native';
const mockList=jest.fn(),mockPush=jest.fn();let mockFocus:()=>void;
jest.mock('../api/story-cat-link',()=>({listMyStoryLinkRepairs:(...a:unknown[])=>mockList(...a)}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush}),useFocusEffect:(fn:()=>void)=>{mockFocus=fn;require('react').useEffect(fn,[fn]);}}));
import {StoryLinkRepairs} from './StoryLinkRepairs';
const item={postId:'00000000-0000-4000-8000-000000004621',title:'My garden story',createdAt:'2026-09-13T00:00:00Z'};
const pin=()=>async()=>true;
it('offers a private repair entry and removes it after a focus refresh resolves',async()=>{
 mockList.mockResolvedValueOnce({items:[item],nextCursor:null}).mockResolvedValue({items:[],nextCursor:null});
 const v=await render(<StoryLinkRepairs owner="owner" locale="en" pin={pin}/>);await fireEvent.press(await v.findByText(item.title));expect(mockPush).toHaveBeenCalledWith(`/community/${item.postId}?editCat=1`);
 await act(async()=>mockFocus());expect(v.queryByText(item.title)).toBeNull();await v.unmount();
});
