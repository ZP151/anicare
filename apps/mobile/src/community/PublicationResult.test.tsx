import { act, fireEvent, render } from '@testing-library/react-native';
const mockGet = jest.fn(), mockPush = jest.fn();
let mockFocus:()=>void;
let mockOwner: string | null | undefined = 'owner';
const mockPin = () => async () => true;
jest.mock('../api/community', () => ({ getCommunityPost: (...a: unknown[]) => mockGet(...a) }));
jest.mock('../auth/use-account-session', () => ({ useAccountSession: () => ({ owner: mockOwner, pin: mockPin }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockPush }), useFocusEffect: (fn: () => void) => {mockFocus=fn;require('react').useEffect(fn,[fn]);} }));
import { PublicationResult } from './PublicationResult';
const post = { postId: '00000000-0000-4000-8000-000000004521', catId: '00000000-0000-4000-8000-000000004511', body: 'A shared story', canDelete: true };
beforeEach(() => { mockGet.mockReset(); mockPush.mockReset(); mockOwner = 'owner'; });
it('uses the current persisted association and offers the cat home', async () => {
 mockGet.mockResolvedValue(post);
 const view = await render(<PublicationResult postId={post.postId} locale="en" />);
 await fireEvent.press(await view.findByRole('button', { name: 'Go to cat home' }));
 expect(mockPush).toHaveBeenCalledWith(`/cat/${post.catId}`);
 expect(mockGet).toHaveBeenCalledTimes(1);
});
it('gives unknown posts an original-post action and a later link action', async () => {
 mockGet.mockResolvedValue({ ...post, catId: null });
 const view = await render(<PublicationResult postId={post.postId} locale="en" />);
 await fireEvent.press(await view.findByRole('button', { name: 'Link a cat later' }));
 expect(mockPush).toHaveBeenCalledWith(`/community/${post.postId}?editCat=1`);
});
it('never shows a stale successful summary for an unavailable post', async () => {
 mockGet.mockRejectedValue(new Error('community_post_hidden'));
 const view = await render(<PublicationResult postId={post.postId} locale="en" />);
 expect(await view.findByText('This post is currently unavailable.')).toBeTruthy();
 expect(view.queryByText('Story published')).toBeNull();
});
it('clears pending results on an account switch', async () => {
 let finish!: (v: unknown) => void;
 mockGet.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 const view = await render(<PublicationResult postId={post.postId} locale="en" />);
 mockOwner = undefined; await view.rerender(<PublicationResult postId={post.postId} locale="en" />);
 await act(async () => finish(post));
 expect(view.queryByText('Story published')).toBeNull();
});

it('clears an A to B to A result race and reads the latest link on refocus',async()=>{
 let late!:(v:unknown)=>void;mockGet.mockResolvedValueOnce(post).mockImplementationOnce(()=>new Promise(resolve=>{late=resolve;})).mockResolvedValueOnce({...post,catId:null});
 const v=await render(<PublicationResult postId={post.postId} locale="en"/>);await v.findByText('Go to cat home');
 mockOwner='other';await v.rerender(<PublicationResult postId={post.postId} locale="en"/>);expect(v.queryByText('Go to cat home')).toBeNull();
 mockOwner='owner';await v.rerender(<PublicationResult postId={post.postId} locale="en"/>);await v.findByText('Link a cat later');await act(async()=>late(post));expect(v.queryByText('Go to cat home')).toBeNull();
 mockGet.mockResolvedValue({...post,catId:'new-cat'});await act(async()=>mockFocus());await fireEvent.press(await v.findByText('Go to cat home'));expect(mockPush).toHaveBeenLastCalledWith('/cat/new-cat');expect(mockGet).toHaveBeenCalledTimes(4);await v.unmount();
});
