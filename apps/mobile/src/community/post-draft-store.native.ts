import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import {installEncryptedTransactions} from '../offline/encrypted-transactions';
import {createRetryableSingleFlight,loadOrCreateDatabaseKey,openEncryptedDatabaseWithDependencies} from '../offline/draft-database-initialization';
import {createSocialDraftStore,initializeSocialDatabase} from './post-draft-storage';

const keyName='whisker-social-drafts-v1-key';
const database=createRetryableSingleFlight(()=>openEncryptedDatabaseWithDependencies<SQLite.SQLiteDatabase>({
 isNative:true,
 loadKey:()=>loadOrCreateDatabaseKey({
  isAvailable:()=>SecureStore.isAvailableAsync(),
  load:()=>SecureStore.getItemAsync(keyName),
  store:key=>SecureStore.setItemAsync(keyName,key,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY}),
  randomBytes:Crypto.getRandomBytes,
 }),
 openDatabase:()=>SQLite.openDatabaseAsync('whisker-social-drafts-v1.db'),
 applyKey:async(db,key)=>{
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  installEncryptedTransactions(db,key,()=>SQLite.openDatabaseAsync('whisker-social-drafts-v1.db',{useNewConnection:true}));
 },
 initialize:initializeSocialDatabase,
 closeDatabase:db=>db.closeAsync(),
}));
export const socialDraftStore=createSocialDraftStore(database,async bytes=>{
 const hash=await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(bytes));
 return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
});
