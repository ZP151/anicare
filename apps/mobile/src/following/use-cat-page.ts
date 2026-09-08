import { useCallback, useRef, useState } from 'react';
import type { CatPage } from '../api/follows';
const empty:CatPage={items:[],nextCursor:null};
export function useCatPage(fetchPage:(cursor:string|null)=>Promise<CatPage>,pin:()=>()=>Promise<boolean>){
 const [page,setPage]=useState<CatPage>(empty);const [loading,setLoading]=useState(false);const [failed,setFailed]=useState(false);const epoch=useRef(0);
 const clear=useCallback(()=>{++epoch.current;setPage(empty);setLoading(false);setFailed(false);},[]);
 const load=useCallback(async(cursor:string|null=null)=>{
  const token=++epoch.current;const current=pin();setLoading(true);setFailed(false);if(!cursor)setPage(empty);
  try{if(!await current())return;const next=await fetchPage(cursor);if(token!==epoch.current||!await current())return;
   setPage(previous=>({items:cursor?[...new Map([...previous.items,...next.items].map(cat=>[cat.animalId,cat])).values()]:next.items,nextCursor:next.nextCursor===cursor?null:next.nextCursor}));
  }catch{if(token===epoch.current&&await current())setFailed(true);}finally{if(token===epoch.current)setLoading(false);}
 },[fetchPage,pin]);
 return {page,loading,failed,load,clear};
}
