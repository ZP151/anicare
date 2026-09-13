import { act, fireEvent, render } from '@testing-library/react-native';
const mockList = jest.fn(), mockAvatars = jest.fn(), mockPush = jest.fn();
let mockOwner: string | null | undefined = null;
const mockPin = () => async () => true;
jest.mock('../api/cat-stories', () => ({ listCatStories: (...args: unknown[]) => mockList(...args) }));
jest.mock('../api/community-avatar', () => ({ getCommunityAvatars: (...args: unknown[]) => mockAvatars(...args) }));
jest.mock('../auth/use-account-session', () => ({ useAccountSession: () => ({ owner: mockOwner, pin: mockPin }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('../community/CommunityAuthorAvatar', () => ({ CommunityAuthorAvatar: () => null }));
jest.mock('../community/CommunityPostImage', () => ({ CommunityPostImage: () => null }));
import { CatStoryList } from './CatStoryList';
const catId = '00000000-0000-4000-8000-000000004511';
const first = { postId: '00000000-0000-4000-8000-000000004521', catId, body: 'An afternoon in the shade', title: null, author: { name: 'Mei', avatarKey: 'cat' }, publishedAt: '2026-09-13T10:00:00Z', replyCount: 0, canEditLink: false, communitySlug: null, media: [] };
beforeEach(() => { mockOwner = null; mockList.mockReset(); mockAvatars.mockReset().mockResolvedValue(new Map()); mockPush.mockReset(); });
it('shows an empty invitation after loading, without inventing a photo or activity', async () => {
 mockList.mockResolvedValue({ items: [], nextCursor: null });
 const view = await render(<CatStoryList catId={catId} locale="en" />);
 expect(await view.findByText('Be the first to share a story.')).toBeTruthy();
});
it('separates errors from empty content and retries', async () => {
 mockList.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ items: [first], nextCursor: null });
 const view = await render(<CatStoryList catId={catId} locale="en" />);
 await view.findByText('Stories could not be loaded.');
 expect(view.queryByText('Be the first to share a story.')).toBeNull();
 await fireEvent.press(view.getByRole('button', { name: 'Retry stories' }));
 expect(await view.findByText(first.body)).toBeTruthy();
});
it('has separate author and original-post actions and batches avatars', async () => {
 mockList.mockResolvedValue({ items: [first], nextCursor: null });
 const view = await render(<CatStoryList catId={catId} locale="en" />);
 await view.findByText(first.body);
 expect(mockAvatars).toHaveBeenCalledWith('community_post', [first.postId]);
 await fireEvent.press(view.getByRole('button', { name: 'View author Mei' }));
 expect(view.getByRole('button', { name: 'Close author profile' })).toBeTruthy();
 await fireEvent.press(view.getByRole('button', { name: 'Close author profile' }));
 await fireEvent.press(view.getByRole('button', { name: `Open post: ${first.body}` }));
 expect(mockPush).toHaveBeenCalledWith(`/community/${first.postId}`);
});
it('deduplicates overlapping pages', async () => {
 const next = { v: 1, catId, postId: first.postId, createdAt: first.publishedAt };
 mockList.mockResolvedValueOnce({ items: [first], nextCursor: next }).mockResolvedValueOnce({ items: [first, { ...first, postId: '00000000-0000-4000-8000-000000004522', body: 'Second author story' }], nextCursor: null });
 const view = await render(<CatStoryList catId={catId} locale="en" />);
 await fireEvent.press(await view.findByRole('button', { name: 'More stories' }));
 await view.findByText('Second author story');
 expect(view.getAllByText(first.body)).toHaveLength(1);
});
it('discards a late response from a previous cat', async () => {
 let finish!: (value: unknown) => void;
 mockList.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ items: [], nextCursor: null });
 const view = await render(<CatStoryList catId={catId} locale="en" />);
 await view.rerender(<CatStoryList catId="00000000-0000-4000-8000-000000004512" locale="en" />);
 await act(async () => finish({ items: [first], nextCursor: null }));
 expect(view.queryByText(first.body)).toBeNull();
});
it('clears old content immediately while an account is changing', async () => {
 mockList.mockResolvedValue({ items: [first], nextCursor: null });
 const view = await render(<CatStoryList catId={catId} locale="en" />);
 await view.findByText(first.body);
 mockOwner = undefined;
 await view.rerender(<CatStoryList catId={catId} locale="en" />);
 expect(view.queryByText(first.body)).toBeNull();
});
