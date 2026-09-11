import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import NewMessage from '../../app/messages/new';
const id='00000000-0000-4000-8000-000000000001';let mockOwner=id,mockEpoch=0;
const mockCreate=jest.fn(),mockGet=jest.fn(),mockReplace=jest.fn(),mockSave=jest.fn(),mockPending=jest.fn(),mockRemove=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({type:'community_post',contentId:'00000000-0000-4000-8000-000000000002'}),useRouter:()=>({replace:mockReplace,back:jest.fn(),push:jest.fn()}),useFocusEffect:(fn:()=>()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:mockOwner,pin:()=>{const value=mockEpoch;return async()=>value===mockEpoch;}})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../components/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('../profile/ProfileAvatar',()=>({ProfileAvatar:()=>null}));
jest.mock('../api/community-avatar',()=>({getCommunityAvatars:async()=>new Map()}));
jest.mock('../api/direct-messages',()=>({getCommunityAuthor:(...a:unknown[])=>mockGet(...a),createDirectMessageRequest:(...a:unknown[])=>mockCreate(...a)}));
jest.mock('../offline/direct-message-outbox',()=>({savePendingDirectMessage:(...a:unknown[])=>mockSave(...a),listPendingDirectMessages:(...a:unknown[])=>mockPending(...a),removePendingDirectMessage:(...a:unknown[])=>mockRemove(...a)}));
beforeEach(()=>{mockEpoch++;mockOwner=id;jest.clearAllMocks();mockPending.mockResolvedValue([]);mockSave.mockResolvedValue(undefined);mockRemove.mockResolvedValue(undefined);mockGet.mockResolvedValue({author:{name:'Mei',avatarKey:'person'},canMessage:true,conversationId:null});});
it('reopens an existing conversation directly from an author',async()=>{mockGet.mockResolvedValue({author:{name:'Mei',avatarKey:'person'},canMessage:false,conversationId:id});const view=await render(<NewMessage/>);await waitFor(()=>expect(mockReplace).toHaveBeenCalledWith(`/messages/${id}`));expect(mockCreate).not.toHaveBeenCalled();await view.unmount();});
it('retains a durable first request identity after a failed acknowledgement',async()=>{
 mockCreate.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({conversationId:id});
 const view=await render(<NewMessage/>);await view.findByText('Mei');await fireEvent.changeText(view.getByLabelText('Message'),'Hello Mei');await fireEvent.press(view.getByText('Send request'));
 await view.findByText('Request not sent. Your text is saved; retry below.');await fireEvent.press(view.getByText('Retry request'));
 await waitFor(()=>expect(mockCreate).toHaveBeenCalledTimes(2));expect(mockCreate.mock.calls[1]).toEqual(mockCreate.mock.calls[0]);expect(mockSave).toHaveBeenCalled();await view.unmount();
});
it('recovers a first request with a lost acknowledgement when reopening its author',async()=>{
 const pending={owner:id,conversationId:'community_post:00000000-0000-4000-8000-000000000002',body:'Hello again',requestId:'00000000-0000-4000-8000-000000000003'};
 mockPending.mockResolvedValue([pending]);mockGet.mockResolvedValue({author:{name:'Mei',avatarKey:'person'},canMessage:false,conversationId:id});mockCreate.mockResolvedValue({conversationId:id});
 const view=await render(<NewMessage/>);await waitFor(()=>expect(mockCreate).toHaveBeenCalledWith('community_post','00000000-0000-4000-8000-000000000002',pending.body,pending.requestId));
 expect(mockRemove).toHaveBeenCalledWith(id,pending.requestId);await view.unmount();
});
