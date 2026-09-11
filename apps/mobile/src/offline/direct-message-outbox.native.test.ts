const mockRows = new Map<string, any>();
let mockCipher = '4.6';
const mockClose = jest.fn();
const mockDb = {
  execAsync: jest.fn(async () => {}), closeAsync: mockClose,
  getFirstAsync: jest.fn(async (sql: string, ...args: string[]) => sql.includes('cipher_version') ? {cipher_version: mockCipher} : mockRows.get(`${args[0]}:${args[1]}`) ?? null),
  getAllAsync: jest.fn(async (_sql: string, owner: string) => [...mockRows.values()].filter(row => row.owner === owner)),
  runAsync: jest.fn(async (sql: string, ...args: string[]) => {
    if (sql.startsWith('INSERT')) mockRows.set(`${args[0]}:${args[3]}`, {owner:args[0], conversationId:args[1], body:args[2], requestId:args[3]});
    if (sql.startsWith('DELETE')) mockRows.delete(`${args[0]}:${args[1]}`);
  }),
};
jest.mock('expo-sqlite', () => ({openDatabaseAsync: jest.fn(async () => mockDb)}));
jest.mock('expo-secure-store', () => ({WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device',isAvailableAsync:async()=>true,getItemAsync:async()=>'a'.repeat(64),setItemAsync:jest.fn()}));
jest.mock('expo-crypto', () => ({getRandomBytes:()=>new Uint8Array(32)}));
const owner='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
const item={owner,conversationId:'00000000-0000-4000-8000-000000000003',requestId:'00000000-0000-4000-8000-000000000004',body:'Hello'};
beforeEach(()=>{jest.resetModules();mockRows.clear();mockCipher='4.6';mockClose.mockClear();});
it('refuses an unencrypted SQLite build and retries after initialization recovers',async()=>{
 const store=require('./direct-message-outbox.native') as typeof import('./direct-message-outbox.native');mockCipher='';
 await expect(store.savePendingDirectMessage(item)).rejects.toThrow('secure_offline_storage_unavailable');
 expect(mockClose).toHaveBeenCalledTimes(1);mockCipher='4.6';
 await expect(store.savePendingDirectMessage(item)).resolves.toBeUndefined();
});
it('keeps pending payload immutable across retry and isolates owners after reopen',async()=>{
 const store=require('./direct-message-outbox.native') as typeof import('./direct-message-outbox.native');await store.savePendingDirectMessage(item);
 await store.savePendingDirectMessage(item);
 await expect(store.savePendingDirectMessage({...item,body:'Changed'})).rejects.toThrow('direct_message_pending_conflict');
 jest.resetModules();const reopened=require('./direct-message-outbox.native') as typeof import('./direct-message-outbox.native');
 expect(await reopened.listPendingDirectMessages(owner)).toEqual([item]);
 expect(await reopened.listPendingDirectMessages(other)).toEqual([]);
 await reopened.removePendingDirectMessage(other,item.requestId);expect(await reopened.listPendingDirectMessages(owner)).toHaveLength(1);
});
