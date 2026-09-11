import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import Thread from '../../app/messages/[id]';
const id='00000000-0000-4000-8000-000000000001',rid='00000000-0000-4000-8000-000000000002';
let mockOwner:string|null=id,mockEpoch=0;
const mockGet=jest.fn(),mockList=jest.fn(),mockSend=jest.fn(),mockSave=jest.fn(),mockPending=jest.fn(),mockRemove=jest.fn(),mockMark=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({back:jest.fn(),push:jest.fn()}),useLocalSearchParams:()=>({id:'00000000-0000-4000-8000-000000000003'}),useFocusEffect:(fn:()=>()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,pin:()=>{const epoch=mockEpoch;return async()=>epoch===mockEpoch;}})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../components/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('../profile/ProfileAvatar',()=>({ProfileAvatar:()=>null}));
jest.mock('../design/GlassSurface',()=>({GlassSurface:require('react-native').View}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
jest.mock('../api/direct-messages',()=>({getDirectConversation:(...a:unknown[])=>mockGet(...a),listDirectMessages:(...a:unknown[])=>mockList(...a),sendDirectMessage:(...a:unknown[])=>mockSend(...a),markDirectConversationRead:(...a:unknown[])=>mockMark(...a),respondToDirectMessageRequest:jest.fn(),blockDirectConversation:jest.fn()}));
jest.mock('../offline/direct-message-outbox',()=>({savePendingDirectMessage:(...a:unknown[])=>mockSave(...a),listPendingDirectMessages:(...a:unknown[])=>mockPending(...a),removePendingDirectMessage:(...a:unknown[])=>mockRemove(...a)}));
const conversation={conversationId:'00000000-0000-4000-8000-000000000003',status:'accepted',isIncoming:false,otherMember:{name:'Mei',avatarKey:'person'}};
beforeEach(()=>{mockOwner=id;mockEpoch++;jest.clearAllMocks();mockGet.mockResolvedValue(conversation);mockList.mockResolvedValue({items:[],nextCursor:null});mockPending.mockResolvedValue([]);mockSave.mockResolvedValue(undefined);mockRemove.mockResolvedValue(undefined);mockMark.mockResolvedValue(undefined);});
it('restores a failed pending send and retries the original payload and request ID',async()=>{
 const pending={owner:id,conversationId:conversation.conversationId,requestId:rid,body:'Retained message'};mockPending.mockResolvedValue([pending]);mockSend.mockResolvedValue({conversationId:conversation.conversationId,messageId:rid,sentAt:'2026-09-11T01:00:00Z'});
 const view=await render(<Thread/>);await view.findByText('Retained message');
 await fireEvent.press(view.getByLabelText('Retry message'));
 await waitFor(()=>expect(mockSend).toHaveBeenCalledWith(conversation.conversationId,'Retained message',rid));
 expect(mockRemove).toHaveBeenCalledWith(id,rid);await view.unmount();
});
it('prevents a second message while awaiting acceptance',async()=>{
 mockGet.mockResolvedValue({...conversation,status:'pending'});const view=await render(<Thread/>);
 await view.findByText('Waiting for acceptance');expect(view.queryByLabelText('Write a message')).toBeNull();await view.unmount();
});
it('clears only this owner and conversation pending text when access is withdrawn',async()=>{
 mockGet.mockRejectedValue(new Error('direct_conversation_hidden'));
 mockPending.mockResolvedValue([{owner:id,conversationId:conversation.conversationId,requestId:rid,body:'Pending'}, {owner:id,conversationId:id,requestId:id,body:'Other conversation'}]);
 const view=await render(<Thread/>);await waitFor(()=>expect(mockRemove).toHaveBeenCalledWith(id,rid));
 expect(mockRemove).toHaveBeenCalledTimes(1);expect(view.queryByText('Pending')).toBeNull();await view.unmount();
});
it('hides messages and ignores a late load after switching account',async()=>{
 let resolve:(x:unknown)=>void=()=>{};mockList.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const view=await render(<Thread/>);mockOwner=null;mockEpoch++;await view.rerender(<Thread/>);
 await act(async()=>resolve({items:[{messageId:rid,body:'Private old text',sentAt:'2026-09-11T01:00:00Z',isMine:false,requestId:null,cursor:rid}],nextCursor:null}));
 expect(view.queryByText('Private old text')).toBeNull();await view.unmount();
});
