import {fireEvent,render} from '@testing-library/react-native';
import {MessagesInbox} from './MessagesInbox';
const mockList=jest.fn(),mockPush=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:jest.fn()}),useFocusEffect:(fn:()=>()=>void)=>require('react').useEffect(fn,[fn])}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:'00000000-0000-4000-8000-000000000001',pin:()=>async()=>true})}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'en'})}));
jest.mock('../components/AppIcon',()=>({AppIcon:()=>null}));
jest.mock('../profile/ProfileAvatar',()=>({ProfileAvatar:()=>null}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:require('react-native').View}));
jest.mock('../api/direct-messages',()=>({listDirectConversations:(...args:unknown[])=>mockList(...args)}));
const base={isIncoming:true,otherMember:{name:'Mei',avatarKey:'person'},lastMessagePreview:'Hello',lastMessageAt:'2026-09-11T00:00:00Z',unreadCount:1,createdAt:'2026-09-11T00:00:00Z',cursor:'c'};
beforeEach(()=>jest.clearAllMocks());
it('keeps older requests reachable and opens a request for reading before deciding',async()=>{
 mockList.mockResolvedValueOnce({items:[{...base,conversationId:'accepted',status:'accepted'}],nextCursor:'c'}).mockResolvedValueOnce({items:[{...base,conversationId:'pending',status:'pending'}],nextCursor:null});
 const view=await render(<MessagesInbox requestsOnly/>);
 await view.findByText('Load more');expect(view.queryByText('Hello')).toBeNull();
 await fireEvent.press(view.getByText('Load more'));await view.findByText('Hello');
 await fireEvent.press(view.getByLabelText('Mei, unread'));expect(mockPush).toHaveBeenCalledWith('/messages/pending');await view.unmount();
});
