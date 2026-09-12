import {act,fireEvent,render,waitFor} from '@testing-library/react-native';

const mockList=jest.fn(),mockMark=jest.fn(),mockPush=jest.fn(),mockPin=jest.fn(),mockContext=jest.fn();
let mockOwner:string|null|undefined='owner-a';
jest.mock('../api/community-activity',()=>({listMyCommunityActivity:(...args:unknown[])=>mockList(...args),markCommunityActivityRead:(...args:unknown[])=>mockMark(...args)}));
jest.mock('../api/community-comment-replies',()=>({getCommunityCommentContext:(...args:unknown[])=>mockContext(...args)}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,failed:false,reload:jest.fn(),pin:mockPin})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
import {ActivityInbox} from './ActivityInbox';

const base='00000000-0000-4000-8000-00000000000';
const activity=(suffix:string,kind:'comment'|'like'='comment')=>({eventId:`${base}${suffix}`,kind,postId:`${base}9`,replyId:null,actor:{name:kind==='like'?'Liker':'Commenter',avatarKey:'person'},createdAt:'2026-09-11T00:00:00Z',readAt:null,cursor:`${base}${suffix}`});
beforeEach(()=>{jest.clearAllMocks();mockOwner='owner-a';mockPin.mockImplementation(()=>{const owner=mockOwner;return async()=>mockOwner===owner;});mockList.mockResolvedValue({items:[],nextCursor:null});mockMark.mockResolvedValue(undefined);mockContext.mockResolvedValue({replyId:activity('8').replyId,postId:activity('8').postId,parentReplyId:null});});

it('retains activity when pull refresh fails',async()=>{
 mockList.mockResolvedValueOnce({items:[activity('1')],nextCursor:'cursor-1'}).mockRejectedValueOnce(new Error('offline'));
 const view=await render(<ActivityInbox/>);await view.findByText('Commenter commented on your post');
 await act(async()=>view.getByTestId('screen-scroll').props.refreshControl.props.onRefresh());
 expect(view.getByText('Commenter commented on your post')).toBeTruthy();
 expect(view.getByText('Activity unavailable. Pull to retry.')).toBeTruthy();await view.unmount();
});

it('abandons a pending owner result and starts the new owner load',async()=>{
 let finishOld:(page:unknown)=>void=()=>{};mockList.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;})).mockResolvedValueOnce({items:[activity('2')],nextCursor:null});
 const view=await render(<ActivityInbox/>);await waitFor(()=>expect(mockList).toHaveBeenCalledTimes(1));
 mockOwner='owner-b';await view.rerender(<ActivityInbox/>);await view.findByText('Commenter commented on your post');
 await act(async()=>finishOld({items:[{...activity('3'),actor:{name:'Old owner',avatarKey:'person'}}],nextCursor:null}));
 expect(view.queryByText('Old owner commented on your post')).toBeNull();await view.unmount();
});

it('does not fake a read receipt when marking an opened event fails',async()=>{
 mockMark.mockRejectedValueOnce(new Error('offline'));mockList.mockResolvedValue({items:[activity('4')],nextCursor:null});
 const view=await render(<ActivityInbox/>);const row=await view.findByRole('button',{name:'Commenter commented on your post, unread'});
 await fireEvent.press(row);await waitFor(()=>expect(mockMark).toHaveBeenCalledWith([activity('4').eventId]));
 expect(view.getByRole('button',{name:'Commenter commented on your post, unread'})).toBeTruthy();
 expect(mockPush).toHaveBeenCalledWith(`/community/${activity('4').postId}`);await view.unmount();
});

it('opens a child-comment notification in its parent thread after resolving visible context',async()=>{
 const childId='00000000-0000-4000-8000-000000000008',parentId='00000000-0000-4000-8000-000000000009';
 const event={...activity('8'),replyId:childId};mockContext.mockResolvedValueOnce({replyId:childId,postId:event.postId,parentReplyId:parentId});mockList.mockResolvedValue({items:[event],nextCursor:null});
 const view=await render(<ActivityInbox/>);await fireEvent.press(await view.findByRole('button',{name:'Commenter replied to you, unread'}));
 await waitFor(()=>expect(mockContext).toHaveBeenCalledWith(childId));
 expect(mockPush).toHaveBeenCalledWith(`/community/comments/${parentId}?childId=${childId}`);await view.unmount();
});

it('keeps an unavailable child notification on the post instead of navigating to stale content',async()=>{
 const childId='00000000-0000-4000-8000-000000000008',event={...activity('8'),replyId:childId};mockContext.mockRejectedValueOnce(new Error('hidden'));mockList.mockResolvedValue({items:[event],nextCursor:null});
 const view=await render(<ActivityInbox/>);await fireEvent.press(await view.findByRole('button',{name:'Commenter replied to you, unread'}));
 await waitFor(()=>expect(mockContext).toHaveBeenCalledWith(childId));
 expect(mockPush).not.toHaveBeenCalled();await view.unmount();
});

it('filters loaded activity and appends the next page',async()=>{
 const comment=activity('5'),like=activity('6','like');mockList.mockResolvedValueOnce({items:[comment],nextCursor:comment.cursor}).mockResolvedValueOnce({items:[like],nextCursor:null});
 const view=await render(<ActivityInbox/>);await view.findByText('Commenter commented on your post');
 await fireEvent.press(view.getByRole('button',{name:'Likes'}));
 expect(view.queryByText('Commenter commented on your post')).toBeNull();
 await fireEvent.press(view.getByRole('button',{name:'Load more'}));await view.findByText('Liker liked your post');
 expect(mockList).toHaveBeenLastCalledWith(comment.cursor);await view.unmount();
});

it('invalidates a pending request on unmount',async()=>{
 let finish:(page:unknown)=>void=()=>{};mockList.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=await render(<ActivityInbox/>);await waitFor(()=>expect(mockList).toHaveBeenCalledTimes(1));await view.unmount();
 await act(async()=>finish({items:[activity('7')],nextCursor:null}));
 expect(mockPush).not.toHaveBeenCalled();
});

it('offers a sign-in path instead of showing activity for a signed-out account',async()=>{
 mockOwner=null;
 const view=await render(<ActivityInbox/>);
 expect(view.getByText('Sign in to see community activity.')).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Sign in'}));
 expect(mockPush).toHaveBeenCalledWith('/profile');
 expect(mockList).not.toHaveBeenCalled();await view.unmount();
});

it('opens a top-level comment directly instead of losing it below the post',async()=>{
 const replyId='00000000-0000-4000-8000-000000000008',event={...activity('8'),replyId};mockContext.mockResolvedValue({replyId,postId:event.postId,parentReplyId:null});mockList.mockResolvedValue({items:[event],nextCursor:null});
 const view=await render(<ActivityInbox/>);await fireEvent.press(await view.findByRole('button',{name:'Commenter replied to you, unread'}));
 await waitFor(()=>expect(mockPush).toHaveBeenCalledWith(`/community/comments/${replyId}`));await view.unmount();
});
