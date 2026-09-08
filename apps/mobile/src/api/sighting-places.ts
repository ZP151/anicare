import type { NarrowRpcClient } from './feed';
export type SightingPlace=Readonly<{residenceType:'hdb'|'condo'|'other';residenceName:string}>;
export async function getSightingPlaces(ids:readonly string[],client:NarrowRpcClient):Promise<Map<string,SightingPlace>> {
 if(ids.length===0) return new Map();
 const {data,error}=await client.rpc('get_public_sighting_places',{p_sighting_ids:ids});
 if(error || !Array.isArray(data) || data.length>50) throw new Error('places_unavailable');
 const output=new Map<string,SightingPlace>();
 for(const row of data) {
   if(!row || Object.keys(row).length!==3 || !ids.includes(row.sightingId) || !['hdb','condo','other'].includes(row.residenceType) || typeof row.residenceName!=='string' || row.residenceName.trim().length<1 || row.residenceName.length>100 || /[\x00-\x1f\x7f]/.test(row.residenceName)) throw new Error('invalid_public_place');
   output.set(row.sightingId,{residenceType:row.residenceType,residenceName:row.residenceName});
 }
 return output;
}
