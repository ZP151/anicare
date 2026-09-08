import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000000099'}));
const mockGet=jest.fn(),mockList=jest.fn(),mockReply=jest.fn();
let mockThread='00000000-0000-4000-8000-000000000001';
jest.mock('./community',()=>({getCommunityPost:(...a:unknown[])=>mockGet(...a),listCommunityReplies:(...a:unknown[])=>mockList(...a),createCommunityReply:(...a:unknown[])=>mockReply(...a)}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:'owner-a',failed:false,reload:jest.fn(),pin:()=>async()=>true})}));
jest.mock('../community/CommunityContentActions',()=>({CommunityContentActions:()=>null}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'zh-CN'})}));
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()}),useLocalSearchParams:()=>({id:mockThread})}));
import CommunityDetailScreen from '../../app/community/[id]';
beforeEach(()=>{jest.clearAllMocks();mockThread='00000000-0000-4000-8000-000000000001';mockGet.mockImplementation(async(id:string)=>({postId:id,body:'Neighbour question',createdAt:'2026-09-09T00:00:00Z',author:{name:'Neighbour',avatarKey:'cat'},canDelete:false}));mockList.mockResolvedValue({items:[],nextCursor:null});});
it('keeps a failed reply and reuses its request id on retry',async()=>{
 mockReply.mockRejectedValueOnce(new Error('lost response')).mockResolvedValue('reply-id');
 const view=await render(<CommunityDetailScreen/>);const input=await view.findByLabelText('写回复');
 await fireEvent.changeText(input,'I can clean the bowls.');await fireEvent.press(view.getByLabelText('发送回复'));
 await view.findByText('回复未完成，内容已保留。请重试。');expect(view.getByLabelText('写回复').props.value).toBe('I can clean the bowls.');
 await fireEvent.press(view.getByLabelText('发送回复'));await view.findByText('回复已发布');
 expect(mockReply).toHaveBeenCalledTimes(2);expect(mockReply.mock.calls[0][3]).toBe(mockReply.mock.calls[1][3]);expect(mockReply.mock.calls[0][3]).toEqual(expect.any(String));await view.unmount();
});
it('does not clear a new thread draft when the previous thread reply finishes',async()=>{
 let finish:()=>void=()=>{};mockReply.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const view=await render(<CommunityDetailScreen/>);await fireEvent.changeText(await view.findByLabelText('写回复'),'Old thread reply');await fireEvent.press(view.getByLabelText('发送回复'));await waitFor(()=>expect(mockReply).toHaveBeenCalledTimes(1));
 mockThread='00000000-0000-4000-8000-000000000002';await view.rerender(<CommunityDetailScreen/>);await fireEvent.changeText(await view.findByLabelText('写回复'),'New thread draft');await act(async()=>finish());
 expect(view.getByLabelText('写回复').props.value).toBe('New thread draft');expect(view.queryByText('回复已发布')).toBeNull();await view.unmount();
});
