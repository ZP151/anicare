import { createDirectMessageRequest, listDirectMessages, parseDirectConversations, respondToDirectMessageRequest, sendDirectMessage } from './direct-messages';

const id = (tail: string) => `00000000-0000-4000-8000-0000000000${tail}`;
const conversation = { conversationId:id('01'), status:'pending', isIncoming:true, otherMember:{name:'Neighbour',avatarKey:'person'}, lastMessagePreview:'Hello', lastMessageAt:'2026-09-11T00:00:00.000Z', unreadCount:1, createdAt:'2026-09-11T00:00:00.000Z', cursor:id('01') };

it('accepts only the documented conversation projection', () => {
  expect(parseDirectConversations([conversation]).items).toEqual([conversation]);
  expect(() => parseDirectConversations([{...conversation, privateUserId:id('99')}])).toThrow('direct_messages_unavailable');
});

it('uses the same request id after a failed send can be retried', async () => {
  const rpc = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:[{conversationId:id('01'),messageId:id('02'),sentAt:'2026-09-11T00:01:00.000Z'}],error:null});
  await expect(sendDirectMessage(id('01'),'Hi',id('03'),{rpc})).rejects.toThrow('direct_message_write_failed');
  await expect(sendDirectMessage(id('01'),'Hi',id('03'),{rpc})).resolves.toMatchObject({messageId:id('02')});
  expect(rpc.mock.calls.map(call=>call[1])).toEqual([{p_conversation_id:id('01'),p_body:'Hi',p_request_id:id('03')},{p_conversation_id:id('01'),p_body:'Hi',p_request_id:id('03')}]);
});

it('keeps request mutations strict', async () => {
  const rpc = jest.fn().mockResolvedValue({data:[{conversationId:id('01'),status:'accepted',updatedAt:'2026-09-11T00:01:00.000Z'}],error:null});
  await expect(respondToDirectMessageRequest(id('01'),true,id('03'),{rpc})).resolves.toMatchObject({status:'accepted'});
  await expect(createDirectMessageRequest('community_post',id('02'),'Hello',id('03'),{rpc})).rejects.toThrow('direct_message_write_failed');
});

it('uses ascending messages and the oldest cursor only for a full page', async () => {
  const message={messageId:id('02'),body:'Hello',sentAt:'2026-09-11T00:00:00.000Z',isMine:false,requestId:null,cursor:id('02')};
  const rpc=jest.fn().mockResolvedValue({data:Array.from({length:50},(_,i)=>({...message,messageId:id(String(i+10).padStart(2,'0')),cursor:id(String(i+10).padStart(2,'0')),sentAt:`2026-09-11T00:${String(i).padStart(2,'0')}:00.000Z`})),error:null});
  const page=await listDirectMessages(id('01'),id('04'),{rpc});expect(page.nextCursor).toBe(id('10'));
  expect(rpc).toHaveBeenCalledWith('list_direct_messages',{p_conversation_id:id('01'),p_cursor:id('04'),p_limit:50});
});
