import { useCallback, useEffect, useRef, useState } from 'react';
import { readSessionSubjectStrict, subscribeSessionSubject } from './session-subject';
export function useAccountSession() {
 const [owner,setOwner]=useState<string|null|undefined>(undefined);
 const [failed,setFailed]=useState(false); const epoch=useRef(0);
 const resolvedSubject=useRef<string|null|undefined>(undefined);
 const reload=useCallback(async()=>{
  const generation=++epoch.current;resolvedSubject.current=undefined;setOwner(undefined);setFailed(false);
  try{const subject=await readSessionSubjectStrict();if(generation===epoch.current){resolvedSubject.current=subject;setOwner(subject);}}
  catch{if(generation===epoch.current)setFailed(true);}
 },[]);
 useEffect(()=>{void reload();const unsubscribe=subscribeSessionSubject(subject=>{
  // INITIAL_SESSION may arrive after getSession already resolved. Same-account
  // notifications must not invalidate an in-flight feed without a new owner.
  if(resolvedSubject.current!==undefined&&resolvedSubject.current===subject)return;
  void reload();
 });return()=>{++epoch.current;unsubscribe();};},[reload]);
 const pin=useCallback(()=>{const generation=epoch.current;const subject=owner;return async()=>generation===epoch.current&&subject!==undefined&&await readSessionSubjectStrict().catch(()=>undefined)===subject&&generation===epoch.current;},[owner]);
 return {owner,failed,reload,pin,epoch};
}
