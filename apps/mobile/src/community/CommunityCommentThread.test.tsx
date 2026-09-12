import {act,fireEvent,render,waitFor} from '@testing-library/react-native';

const mockList=jest.fn(),mockCreate=jest.fn(),mockPush=jest.fn(),mockHeader=jest.fn();
let mockChild:string|undefined;
jest.mock('../api/community-thread-context',()=>({getCommunityThreadContext:(...args:unknown[])=>mockHeader(...args)}));
let mockParentId='00000000-0000-4000-8000-000000000010';
let mockAccountFailed=false;
let mockOwner:string|undefined='owner-a';
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000000099'}));
jest.mock('../api/community-comment-replies',()=>({listCommunityCommentReplies:(...args:unknown[])=>mockList(...args),createCommunityCommentReply:(...args:unknown[])=>mockCreate(...args)}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockAccountFailed?undefined:mockOwner,failed:mockAccountFailed,reload:jest.fn(),pin:()=>async()=>true})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,canGoBack:()=>false,back:jest.fn(),replace:jest.fn()}),useLocalSearchParams:()=>({id:mockParentId,childId:mockChild})}));
jest.mock('./CommunityContentActions',()=>({CommunityContentActions:()=>null}));
import {CommunityCommentThread} from './CommunityCommentThread';

const reply=(id:string,body:string)=>({replyId:id,body,createdAt:'2026-09-11T00:00:00Z',author:{name:'Neighbour',avatarKey:'person'},canDelete:false,cursor:id});
beforeEach(()=>{jest.clearAllMocks();mockParentId='00000000-0000-4000-8000-000000000010';mockAccountFailed=false;mockOwner='owner-a';mockChild=undefined;mockHeader.mockResolvedValue({post:{postId:'00000000-0000-4000-8000-000000000001',body:'An afternoon at West Coast',author:{name:'Mei',avatarKey:'person'},createdAt:'2026-09-13T01:00:00Z'},parent:reply(mockParentId,'Original parent'),target:null,targetUnavailable:false});mockList.mockResolvedValue({items:[reply(mockParentId,'Parent comment')],nextCursor:null});mockCreate.mockResolvedValue('00000000-0000-4000-8000-000000000012');});

it('loads one-level child replies and preserves a failed draft for idempotent retry',async()=>{
 const child=reply('00000000-0000-4000-8000-000000000011','Child reply');mockList.mockResolvedValueOnce({items:[child],nextCursor:null}).mockResolvedValueOnce({items:[child],nextCursor:null});mockCreate.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(child.replyId);
 const view=await render(<CommunityCommentThread/>);await view.findByText('Child reply');
 await fireEvent.changeText(view.getByLabelText('Write a reply'),'I agree.');await fireEvent.press(view.getByLabelText('Send reply'));await view.findByText('Reply not completed. Your text is kept; please retry.');
 await fireEvent.press(view.getByLabelText('Send reply'));await waitFor(()=>expect(mockCreate).toHaveBeenCalledTimes(2));
 expect(mockCreate.mock.calls[0][3]).toBe(mockCreate.mock.calls[1][3]);expect(mockCreate.mock.calls[0][3]).toEqual(expect.any(String));await view.unmount();
});

it('offers an account retry instead of leaving an unavailable account on a spinner',async()=>{
 mockAccountFailed=true;const view=await render(<CommunityCommentThread/>);
 expect(view.getByText('Retry account connection')).toBeTruthy();expect(mockList).not.toHaveBeenCalled();await view.unmount();
});

it('keeps a new submission locked when a prior owner scope completes late',async()=>{
 let finishOld:()=>void=()=>{},finishNew:()=>void=()=>{};
 mockCreate.mockImplementationOnce(()=>new Promise<void>(resolve=>{finishOld=resolve;})).mockImplementationOnce(()=>new Promise<void>(resolve=>{finishNew=resolve;}));
 const view=await render(<CommunityCommentThread/>);await view.findByText('Parent comment');
 await fireEvent.changeText(view.getByLabelText('Write a reply'),'Old draft');await fireEvent.press(view.getByLabelText('Send reply'));
 mockOwner='owner-b';await view.rerender(<CommunityCommentThread/>);mockOwner='owner-a';await view.rerender(<CommunityCommentThread/>);
 await fireEvent.changeText(view.getByLabelText('Write a reply'),'New draft');await fireEvent.press(view.getByLabelText('Send reply'));await waitFor(()=>expect(mockCreate).toHaveBeenCalledTimes(2));
 await act(async()=>finishOld());expect(view.getByLabelText('Write a reply').props.value).toBe('New draft');
 await fireEvent.press(view.getByLabelText('Send reply'));expect(mockCreate).toHaveBeenCalledTimes(2);
 await act(async()=>finishNew());await view.unmount();
});

it('keeps the original story and parent comment visible while replying',async()=>{
 const view=await render(<CommunityCommentThread/>);await view.findByText('Original parent');expect(view.getByText('An afternoon at West Coast')).toBeTruthy();
 await fireEvent.press(view.getByLabelText('View original post'));expect(mockPush).toHaveBeenCalledWith('/community/00000000-0000-4000-8000-000000000001');await view.unmount();
});
it('pins a notification reply even when it is beyond the first page and removes duplicates',async()=>{
 mockChild='00000000-0000-4000-8000-000000000088';const target=reply(mockChild,'A later reply');const header=await mockHeader();mockHeader.mockResolvedValue({...header,target});
 mockList.mockResolvedValueOnce({items:[],nextCursor:mockParentId}).mockResolvedValue({items:[target],nextCursor:null});
 const view=await render(<CommunityCommentThread/>);await view.findByText('A later reply');await fireEvent.press(view.getByLabelText('Load more replies'));await waitFor(()=>expect(mockList).toHaveBeenCalledTimes(2));expect(view.getAllByText('A later reply')).toHaveLength(1);await view.unmount();
});
it('retains a failed pagination page and retries that cursor',async()=>{
 mockList.mockResolvedValueOnce({items:[reply(mockParentId,'Earlier response')],nextCursor:mockParentId}).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({items:[reply('00000000-0000-4000-8000-000000000099','Next page')],nextCursor:null});
 const view=await render(<CommunityCommentThread/>);await view.findByText('Earlier response');await fireEvent.press(view.getByLabelText('Load more replies'));await view.findByText('Replies unavailable. Tap to retry.');expect(view.getByText('Earlier response')).toBeTruthy();
 await fireEvent.press(view.getByText('Replies unavailable. Tap to retry.'));await view.findByText('Next page');expect(mockList).toHaveBeenLastCalledWith(mockParentId,mockParentId);await view.unmount();
});

it('does not let an old failed page break retry in a new discussion',async()=>{
 let rejectOld:(e:unknown)=>void=()=>{};
 mockList.mockResolvedValueOnce({items:[reply(mockParentId,'Old thread')],nextCursor:mockParentId}).mockImplementationOnce(()=>new Promise((_,reject)=>{rejectOld=reject;})).mockRejectedValueOnce(new Error('new initial offline')).mockResolvedValueOnce({items:[reply('00000000-0000-4000-8000-000000000099','Recovered')],nextCursor:null});
 const view=await render(<CommunityCommentThread/>);await view.findByText('Old thread');await fireEvent.press(view.getByLabelText('Load more replies'));
 mockParentId='00000000-0000-4000-8000-000000000020';await view.rerender(<CommunityCommentThread/>);await view.findByText('Replies unavailable. Tap to retry.');
 await act(async()=>rejectOld(new Error('late old page')));await fireEvent.press(view.getByText('Replies unavailable. Tap to retry.'));await view.findByText('Recovered');expect(mockList).toHaveBeenLastCalledWith(mockParentId,null);await view.unmount();
});
