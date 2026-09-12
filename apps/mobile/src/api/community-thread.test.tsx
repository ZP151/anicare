import {act,fireEvent,render,waitFor,within} from '@testing-library/react-native';
import {DeviceEventEmitter,StyleSheet} from 'react-native';
jest.mock('expo-crypto',()=>({randomUUID:()=> '00000000-0000-4000-8000-000000000099'}));
const mockGet=jest.fn(),mockList=jest.fn(),mockReply=jest.fn();
let mockFocus:()=>void;
const mockAuthor=jest.fn(),mockReactions=jest.fn(),mockLike=jest.fn(),mockPush=jest.fn();
jest.mock('./community-reactions',()=>({getCommunityReactions:(...args:unknown[])=>mockReactions(...args),setCommunityLike:(...args:unknown[])=>mockLike(...args)}));
jest.mock('./cats',()=>({getPublicCatSummary:async()=>({primaryAlias:'Mochi'})}));
jest.mock('./direct-messages',()=>({getCommunityAuthor:(...args:unknown[])=>mockAuthor(...args)}));
let mockThread='00000000-0000-4000-8000-000000000001';
jest.mock('./community',()=>({getCommunityPost:(...a:unknown[])=>mockGet(...a),listCommunityReplies:(...a:unknown[])=>mockList(...a),createCommunityReply:(...a:unknown[])=>mockReply(...a)}));
jest.mock('../auth/use-account-session',()=>({useAccountSession:()=>({owner:'owner-a',failed:false,reload:jest.fn(),pin:()=>async()=>true})}));
jest.mock('../community/CommunityContentActions',()=>({CommunityContentActions:()=>null}));
jest.mock('../i18n/LocaleContext',()=>({useLocale:()=>({locale:'zh-CN'})}));
jest.mock('expo-router',()=>({useFocusEffect:(fn:()=>void)=>{mockFocus=fn;},useRouter:()=>({push:mockPush,canGoBack:()=>false,replace:jest.fn()}),useLocalSearchParams:()=>({id:mockThread})}));
const mockExtras=jest.fn();
jest.mock('./community-extras',()=>({getCommunityPostExtras:(...args:unknown[])=>mockExtras(...args),communityMediaUrl:(postId:string,mediaId:string)=>`https://media.test/${postId}/${mediaId}`}));
import CommunityDetailScreen from '../../app/community/[id]';
beforeEach(()=>{jest.clearAllMocks();mockThread='00000000-0000-4000-8000-000000000001';mockGet.mockImplementation(async(id:string)=>({postId:id,body:'Neighbour question',createdAt:'2026-09-09T00:00:00Z',author:{name:'Neighbour',avatarKey:'cat'},canDelete:false,replyCount:0,communitySlug:'clementi',catId:'00000000-0000-4000-8000-000000000050'}));mockList.mockResolvedValue({items:[],nextCursor:null});mockExtras.mockResolvedValue(new Map());mockReactions.mockResolvedValue(new Map([[mockThread,{postId:mockThread,liked:false,likeCount:3}]]));mockLike.mockResolvedValue({postId:mockThread,liked:true,likeCount:4});});
it('keeps the editable reply and send action outside the long post scroll, inside keyboard avoidance',async()=>{
 const view=await render(<CommunityDetailScreen/>);
 const input=await view.findByLabelText('写回复');
 expect(within(view.getByTestId('screen-scroll')).queryByLabelText('写回复')).toBeNull();
 expect((view.toJSON() as any).props.testID).toBe('screen-keyboard-layout');
 await fireEvent(view.getByTestId('screen-keyboard-layout'),'layout',{persist:()=>{},nativeEvent:{layout:{x:0,y:0,width:390,height:800}}});
 await act(async()=>{DeviceEventEmitter.emit('keyboardWillShow',{duration:250,easing:'keyboard',endCoordinates:{screenY:500,height:300,width:390,screenX:0}});});
 expect(StyleSheet.flatten(view.getByTestId('screen-keyboard-layout').props.style).paddingBottom).toBe(300);
 await fireEvent.changeText(input,'Visible above the keyboard');
 expect(view.getByLabelText('写回复').props.value).toBe('Visible above the keyboard');
 expect(view.getByLabelText('发送回复')).toBeTruthy();
 await act(async()=>{DeviceEventEmitter.emit('keyboardWillHide',{duration:250,easing:'keyboard',endCoordinates:{screenY:800,height:0,width:390,screenX:0}});});
 await view.unmount();
});
it('shows every approved detail image above the existing replies',async()=>{
 const first='00000000-0000-4000-8000-000000000011',second='00000000-0000-4000-8000-000000000012';
 mockExtras.mockResolvedValue(new Map([[mockThread,{postId:mockThread,title:'Two bowls',media:[{mediaId:first,width:400,height:300},{mediaId:second,width:300,height:400}]}]]));
 const view=await render(<CommunityDetailScreen/>);
 await view.findByText('Two bowls');
 expect(view.getByTestId(`community-gallery-${mockThread}`).props.children).toHaveLength(2);
 expect(view.getByText('回复')).toBeTruthy();
 await view.unmount();
});
it('shows the message action only for an available author or existing conversation',async()=>{
 mockAuthor.mockResolvedValue({canMessage:false,conversationId:null});
 const view=await render(<CommunityDetailScreen/>);await view.findByText('Neighbour question');expect(view.queryByLabelText('发送私信')).toBeNull();
 await view.unmount();mockAuthor.mockResolvedValue({canMessage:true,conversationId:null});
 const available=await render(<CommunityDetailScreen/>);await available.findByLabelText('发送私信');await available.unmount();
});
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

it('connects the detail to real reactions, cat context and neighbourhood',async()=>{
 const view=await render(<CommunityDetailScreen/>);await view.findByText('Neighbour question');
 expect(await view.findByText('Mochi')).toBeTruthy();expect(view.getByText('金文泰 · Clementi')).toBeTruthy();
 expect(view.getByText('3')).toBeTruthy();await fireEvent.press(view.getByLabelText('点赞'));
 await view.findByLabelText('取消点赞');expect(mockLike).toHaveBeenCalledWith(mockThread,true);expect(view.getByText('4')).toBeTruthy();
 await fireEvent.press(view.getByLabelText('查看猫咪档案'));expect(mockPush).toHaveBeenCalledWith('/cat/00000000-0000-4000-8000-000000000050');await view.unmount();
});
it('opens a compact author summary with a real message action and dismisses it',async()=>{
 mockAuthor.mockResolvedValue({author:{name:'Neighbour',avatarKey:'person'},canMessage:true,conversationId:null});
 const view=await render(<CommunityDetailScreen/>);await view.findByText('Neighbour question');
 await fireEvent.press(view.getByLabelText('查看作者资料'));expect(view.getByLabelText('关闭作者资料')).toBeTruthy();
 await fireEvent.press(view.getByLabelText('关闭作者资料'));expect(view.queryByLabelText('关闭作者资料')).toBeNull();await view.unmount();
});
it('does not invent a zero reaction count on reaction read failure and retries it',async()=>{
 mockReactions.mockRejectedValueOnce(new Error('offline'));
 const view=await render(<CommunityDetailScreen/>);await view.findByText('Neighbour question');
 expect(view.queryByLabelText('点赞')).toBeNull();await fireEvent.press(view.getByLabelText('重试点赞状态'));
 await view.findByLabelText('点赞');await view.unmount();
});

it('binds the author action to the displayed post identity',async()=>{
 mockAuthor.mockResolvedValue({canMessage:true,conversationId:null});
 const shownId='00000000-0000-4000-8000-000000000099';mockGet.mockResolvedValue({postId:shownId,body:'Shown story',createdAt:'2026-09-09T00:00:00Z',author:{name:'Shown author',avatarKey:'cat'},canDelete:false});
 const view=await render(<CommunityDetailScreen/>);await fireEvent.press(await view.findByLabelText('发送私信'));
 expect(mockPush).toHaveBeenCalledWith(`/messages/new?type=community_post&contentId=${shownId}`);await view.unmount();
});

it('refreshes the post after returning from a comment discussion',async()=>{
 const view=await render(<CommunityDetailScreen/>);await view.findByText('Neighbour question');mockGet.mockRejectedValueOnce(new Error('community_post_hidden'));
 await act(async()=>{mockFocus();});await view.findByText('讨论暂不可用，点此重试');expect(view.queryByText('Neighbour question')).toBeNull();await view.unmount();
});
