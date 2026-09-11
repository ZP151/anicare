import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import {openEncryptedDatabaseWithDependencies,createRetryableSingleFlight,loadOrCreateDatabaseKey} from './draft-database-initialization';
export type PendingDirectMessage=Readonly<{owner:string;conversationId:string;body:string;requestId:string}>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validScope=(scope:string)=>uuid.test(scope)||/^(community_post|community_reply):[0-9a-f-]{36}$/i.test(scope)&&uuid.test(scope.split(':')[1]);
function validate(item:PendingDirectMessage){
 if(!uuid.test(item.owner)||!uuid.test(item.requestId)||!validScope(item.conversationId)||!item.body.trim()||item.body.length>2000)throw new Error('invalid_pending_direct_message');
 return item;
}
const key='animalhelper.direct-message-outbox.v1';
const db=createRetryableSingleFlight(()=>openEncryptedDatabaseWithDependencies<SQLite.SQLiteDatabase>({
 isNative:true,
 loadKey:()=>loadOrCreateDatabaseKey({isAvailable:()=>SecureStore.isAvailableAsync(),load:()=>SecureStore.getItemAsync(key),store:value=>SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),randomBytes:Crypto.getRandomBytes}),
 openDatabase:()=>SQLite.openDatabaseAsync('animalhelper-direct-message-outbox.db'),
 applyKey:(database,value)=>database.execAsync(`PRAGMA key = "x'${value}'";`),
 initialize:async database=>{
  const cipher=await database.getFirstAsync<{cipher_version?:string}>('PRAGMA cipher_version;');
  if(!cipher?.cipher_version?.trim())throw new Error('secure_offline_storage_unavailable');
  await database.execAsync('CREATE TABLE IF NOT EXISTS pending_direct_messages(owner TEXT NOT NULL, conversation_id TEXT NOT NULL, body TEXT NOT NULL, request_id TEXT NOT NULL, PRIMARY KEY(owner, request_id));');
 },
 closeDatabase:database=>database.closeAsync(),
}));
const columns='owner,conversation_id as conversationId,body,request_id as requestId';
export async function savePendingDirectMessage(input:PendingDirectMessage){
 const item=validate({...input}),database=await db();
 // An acknowledged request must never be retried with different text.
 const existing=await database.getFirstAsync<PendingDirectMessage>(`SELECT ${columns} FROM pending_direct_messages WHERE owner=? AND request_id=?`,item.owner,item.requestId);
 if(!existing)await database.runAsync('INSERT OR IGNORE INTO pending_direct_messages(owner,conversation_id,body,request_id) VALUES(?,?,?,?)',item.owner,item.conversationId,item.body,item.requestId);
 const saved=existing??await database.getFirstAsync<PendingDirectMessage>(`SELECT ${columns} FROM pending_direct_messages WHERE owner=? AND request_id=?`,item.owner,item.requestId);
 if(!saved||saved.body!==item.body||saved.conversationId!==item.conversationId)throw new Error('direct_message_pending_conflict');
}
export async function listPendingDirectMessages(owner:string){
 if(!uuid.test(owner))throw new Error('invalid_pending_direct_message');
 const rows=await(await db()).getAllAsync<PendingDirectMessage>(`SELECT ${columns} FROM pending_direct_messages WHERE owner=? ORDER BY rowid`,owner);
 return rows.map(row=>{if(row.owner!==owner)throw new Error('invalid_pending_direct_message');return validate(row);});
}
export async function removePendingDirectMessage(owner:string,requestId:string){
 if(!uuid.test(owner)||!uuid.test(requestId))throw new Error('invalid_pending_direct_message');
 await(await db()).runAsync('DELETE FROM pending_direct_messages WHERE owner=? AND request_id=?',owner,requestId);
}
