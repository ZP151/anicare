const mockStorage=new Map<string,string>();
jest.mock('expo-secure-store',()=>({getItemAsync:async(key:string)=>mockStorage.get(key)??null,setItemAsync:async(key:string,value:string)=>{mockStorage.set(key,value);},deleteItemAsync:async(key:string)=>{mockStorage.delete(key);}}));
import {savePendingCare,loadPendingCare,clearPendingCare,type PendingCare} from './care-pending';
const owner='00000000-0000-4000-8000-000000008001';
const first:PendingCare={kind:'withdraw',targetId:owner,requestId:'00000000-0000-4000-8000-000000008002'};
beforeEach(()=>mockStorage.clear());
it('serializes two routes so a different pending operation cannot overwrite the first',async()=>{
 const second:PendingCare={...first,requestId:'00000000-0000-4000-8000-000000008003'};
 const outcomes=await Promise.allSettled([savePendingCare(owner,first),savePendingCare(owner,second)]);
 expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 expect(await loadPendingCare(owner)).toEqual(first);
 await clearPendingCare(owner,second);expect(await loadPendingCare(owner)).toEqual(first);
});
it('isolates accounts and removes only the acknowledged operation',async()=>{
 await savePendingCare(owner,first);expect(await loadPendingCare(first.requestId)).toBeNull();
 await clearPendingCare(owner,first);expect(await loadPendingCare(owner)).toBeNull();
});
