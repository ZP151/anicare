import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import {openEncryptedDatabaseWithDependencies,createRetryableSingleFlight,loadOrCreateDatabaseKey} from './draft-database-initialization';
const key='animalhelper.direct-message-outbox.v1',name='animalhelper-direct-message-outbox.db';
export type PendingDirectMessage=Readonly<{owner:string;conversationId:string;body:string;requestId:string}>;
let database:Promise<SQLite.SQLiteDatabase>|null=null;
const open=createRetryableSingleFlight(()=>openEncryptedDatabaseWithDependencies({isNative:true,loadKey:()=>loadOrCreateDatabaseKey({isAvailable:()=>SecureStore.isAvailableAsync(),load:()=>SecureStore.getItemAsync(key),store:value=>SecureStore.setItemAsync(key,value),randomBytes:length=>new Uint8Array(Crypto.getRandomBytes(length))}),openDatabase:()=>SQLite.openDatabaseAsync(name),applyKey:(db,value)=>db.execAsync(`PRAGMA key = "x'${value}'";`),initialize:db=>db.execAsync('CREATE TABLE IF NOT EXISTS pending_direct_messages(owner TEXT NOT NULL, conversation_id TEXT NOT NULL, body TEXT NOT NULL, request_id TEXT NOT NULL, PRIMARY KEY(owner, request_id));'),closeDatabase:db=>db.closeAsync()}));
function db(){return database??(database=open());}
export async function savePendingDirectMessage(item:PendingDirectMessage){await (await db()).runAsync('INSERT OR REPLACE INTO pending_direct_messages(owner,conversation_id,body,request_id) VALUES(?,?,?,?)',item.owner,item.conversationId,item.body,item.requestId);}
export async function listPendingDirectMessages(owner:string){return(await (await db()).getAllAsync<PendingDirectMessage>('SELECT owner,conversation_id as conversationId,body,request_id as requestId FROM pending_direct_messages WHERE owner=?',owner));}
export async function removePendingDirectMessage(owner:string,requestId:string){await (await db()).runAsync('DELETE FROM pending_direct_messages WHERE owner=? AND request_id=?',owner,requestId);}
