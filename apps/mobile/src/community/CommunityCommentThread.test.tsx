import {fireEvent,render,waitFor} from '@testing-library/react-native';

const mockList=jest.fn(),mockCreate=jest.fn(),mockPush=jest.fn();
let parentId='00000000-0000-4000-8000-000000000010';
let mockAccountFailed=false;
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000000099'}));
jest.mock('../api/community-comment-replies',()=>({listCommunityCommentReplies:(...args:unknown[])=>mockList(...args),createCommunityCommentReply:(...args:unknown[])=>mockCreate(...args)}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockAccountFailed?undefined:'owner-a',failed:mockAccountFailed,reload:jest.fn(),pin:()=>async()=>true})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,canGoBack:()=>false,back:jest.fn(),replace:jest.fn()}),useLocalSearchParams:()=>({id:parentId})}));
jest.mock('./CommunityContentActions',()=>({CommunityContentActions:()=>null}));
import {CommunityCommentThread} from './CommunityCommentThread';

const reply=(id:string,body:string)=>({replyId:id,body,createdAt:'2026-09-11T00:00:00Z',author:{name:'Neighbour',avatarKey:'person'},canDelete:false,cursor:id});
beforeEach(()=>{jest.clearAllMocks();mockAccountFailed=false;mockList.mockResolvedValue({items:[reply(parentId,'Parent comment')],nextCursor:null});mockCreate.mockResolvedValue('00000000-0000-4000-8000-000000000012');});

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
