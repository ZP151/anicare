import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { performSafety, safetyRequestId, type PendingSafety } from '../api/rights';
import { FOLLOW_UUID } from '../api/follows';
import { useAccountSession } from '../auth/use-account-session';
const queues=new Map<string,Promise<unknown>>();
function serial<T>(owner:string,run:()=>Promise<T>):Promise<T>{const next=(queues.get(owner)??Promise.resolve()).catch(()=>undefined).then(run);queues.set(owner,next);void next.finally(()=>{if(queues.get(owner)===next)queues.delete(owner);}).catch(()=>undefined);return next;}
function key(owner:string){if(!FOLLOW_UUID.test(owner))throw new Error('invalid_owner');return `rights.pending.${owner}`;}
function parse(value:string|null):PendingSafety|null{
 if(!value)return null;
 const pending=JSON.parse(value) as PendingSafety;
 if(!pending||!['report','block','rights','erase'].includes(pending.kind)||!FOLLOW_UUID.test(safetyRequestId(pending)))throw new Error('invalid_pending_request');
 return pending;
}
export function useSafetyRequests(){
 const observed=useRef<{owner:string;raw:string|null}|null>(null);
 const auth=useAccountSession();const [pending,setPending]=useState<PendingSafety|null>(null);const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);const [sent,setSent]=useState(false);const flight=useRef(false);
 useEffect(()=>{setPending(null);setReady(false);setBusy(false);setFailed(false);setSent(false);flight.current=false;if(!auth.owner){setReady(auth.owner!==undefined);return;}
  const owner=auth.owner;const current=auth.pin();let active=true;
  void serial(owner,async()=>await SecureStore.getItemAsync(key(owner))).then(async raw=>{if(active&&await current()){observed.current={owner,raw};setPending(parse(raw));setReady(true);}}).catch(async()=>{if(active&&await current())setFailed(true);});
  return()=>{active=false;};
 },[auth.owner,auth.pin]);
 async function submit(input:PendingSafety){
  const owner=auth.owner;if(!owner||!ready||flight.current)return;const current=auth.pin();const epoch=auth.epoch.current;flight.current=true;setBusy(true);setFailed(false);setSent(false);
  try{
   if(!await current())return;
   await serial(owner,async()=>{const previous=await SecureStore.getItemAsync(key(owner));if(previous&&previous!==JSON.stringify(input))throw new Error('pending_conflict');await SecureStore.setItemAsync(key(owner),JSON.stringify(input));});
   if(!await current())return;observed.current={owner,raw:JSON.stringify(input)};setPending(input);
   if(input.kind==='erase')await SecureStore.setItemAsync('rights.erasure.receipt',JSON.stringify({requestId:input.requestId,status:'unconfirmed'}));
   if(!await current())return;
   await performSafety(input);
   // This receipt has no owner, email, detail or storage identifiers.
   if(input.kind==='erase')await serial('erasure-receipt',async()=>{const raw=await SecureStore.getItemAsync('rights.erasure.receipt');if(raw===JSON.stringify({requestId:input.requestId,status:'unconfirmed'}))await SecureStore.setItemAsync('rights.erasure.receipt',JSON.stringify({requestId:input.requestId,status:'received'}));});
   if(!await current())return;
   await serial(owner,async()=>{const raw=await SecureStore.getItemAsync(key(owner));if(raw===JSON.stringify(input))await SecureStore.deleteItemAsync(key(owner));});
   if(!await current())return;setPending(null);setSent(true);
  }catch{if(await current())setFailed(true);}finally{if(epoch===auth.epoch.current){flight.current=false;setBusy(false);}}
 }
 async function stopRetrying(){
  const owner=auth.owner;if(!owner||flight.current)return;const current=auth.pin();if(!await current())return;
  const expected=observed.current;if(!expected||expected.owner!==owner)return;
  await serial(owner,async()=>{const raw=await SecureStore.getItemAsync(key(owner));if(raw!==expected.raw)throw new Error('pending_conflict');await SecureStore.deleteItemAsync(key(owner));});
  if(!await current())return;setPending(null);setFailed(false);setReady(true);
 }
 return {...auth,pending,ready,busy,failed:failed||auth.failed,sent,submit,stopRetrying};
}
