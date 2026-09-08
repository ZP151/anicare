import { useCallback, useEffect, useRef, useState } from 'react';
import { readSessionSubjectStrict, subscribeSessionSubject } from './session-subject';
export function useAccountSession() {
 const [owner,setOwner]=useState<string|null|undefined>(undefined);
 const [failed,setFailed]=useState(false); const epoch=useRef(0);
 const reload=useCallback(async()=>{
  const generation=++epoch.current;setOwner(undefined);setFailed(false);
  try{const subject=await readSessionSubjectStrict();if(generation===epoch.current)setOwner(subject);}
  catch{if(generation===epoch.current)setFailed(true);}
 },[]);
 useEffect(()=>{void reload();const unsubscribe=subscribeSessionSubject(()=>{void reload();});return()=>{++epoch.current;unsubscribe();};},[reload]);
 const pin=useCallback(()=>{const generation=epoch.current;const subject=owner;return async()=>generation===epoch.current&&subject!==undefined&&await readSessionSubjectStrict().catch(()=>undefined)===subject&&generation===epoch.current;},[owner]);
 return {owner,failed,reload,pin,epoch};
}
