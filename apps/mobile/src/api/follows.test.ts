import { changeFollow, listFollowedCats, listDiscoveredCats } from './follows';
import {REPORT_AREAS} from '../maps/report-areas';
const animal='00000000-0000-4000-8000-000000007001';const request='00000000-0000-4000-8000-000000007002';
it('allows discovery in every area offered by the Singapore picker',async()=>{
 const rpc=jest.fn().mockResolvedValue({data:[],error:null});
 for(const [publicCellId] of REPORT_AREAS)await listDiscoveredCats({publicCellId},{rpc});
 expect(rpc).toHaveBeenCalledTimes(REPORT_AREAS.length);
});
it('rejects extra private fields, malformed rows and mismatched command outcomes',async()=>{
 const rpc=jest.fn().mockResolvedValue({data:[{animalId:animal,following:true,followedAt:null,actorId:request}],error:null});
 await expect(changeFollow(animal,true,request,{rpc})).rejects.toThrow();
 rpc.mockResolvedValue({data:[{animalId:animal,primaryAlias:'Cat',verification:'reported',timeBucket:null,cursor:animal,actorId:request}],error:null});
 await expect(listFollowedCats({}, {rpc})).rejects.toThrow();
});
it('validates cursor and sends only supported filters with bounded limit',async()=>{
 const rpc=jest.fn().mockResolvedValue({data:[],error:null});
 await expect(listDiscoveredCats({cursor:'bad'}, {rpc})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
 await listDiscoveredCats({publicCellId:'89652636d87ffff',confirmed:true}, {rpc});
 expect(rpc).toHaveBeenCalledWith('list_public_cat_discovery',{p_public_cell_id:'89652636d87ffff',p_verifications:['community_confirmed','partner_confirmed'],p_cursor:null,p_limit:20});
});
