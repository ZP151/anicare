import { singaporeCommunities, communityForPublicCell, type SingaporeCommunity, type SingaporeRegion } from '@animalhelper/domain';
import type { PublicSighting } from '../api/feed';
import type { SightingPlace } from '../api/sighting-places';
import type { Locale } from '../i18n/catalog';
import { toPublicMapPresentation, type PublicMapPresentation } from './public-map-policy';
export const SG_COMMUNITIES=singaporeCommunities;
export const SG_REGIONS:readonly {id:SingaporeRegion;en:string;zh:string}[]=[{id:'central',en:'Central',zh:'中部'},{id:'east',en:'East',zh:'东部'},{id:'north',en:'North',zh:'北部'},{id:'north_east',en:'North-East',zh:'东北部'},{id:'west',en:'West',zh:'西部'}];
export type SingaporeArea=SingaporeCommunity & Readonly<{cats:readonly (PublicMapPresentation & Partial<SightingPlace>)[]}>;
export function buildSingaporeAreas(sightings:readonly PublicSighting[],places:ReadonlyMap<string,SightingPlace>,locale:Locale):readonly SingaporeArea[] {
 const grouped=new Map<string,Map<string,PublicMapPresentation & Partial<SightingPlace>>>();
 // Feed order is newest visible first. Deduplicate within each community, retaining latest context.
 for(const row of sightings) {
   const community=communityForPublicCell(row.publicCellId);
   if(!community) continue;
   const cats=grouped.get(community.id)??new Map();
   if(!cats.has(row.animalId)) cats.set(row.animalId,{...toPublicMapPresentation(row,locale),...places.get(row.sightingId)});
   grouped.set(community.id,cats);
 }
 return SG_COMMUNITIES.map(area=>({...area,cats:[...(grouped.get(area.id)?.values()??[])]})).sort((a,b)=>b.cats.length-a.cats.length || a.name.localeCompare(b.name));
}
export function filterSingaporeAreas(areas:readonly SingaporeArea[],region:SingaporeRegion|'all',query:string):readonly SingaporeArea[] {
 const text=query.trim().toLocaleLowerCase();
 return areas.filter(area=>(region==='all'||area.region===region) && (!text || area.name.toLocaleLowerCase().includes(text) || area.cats.some(cat=>`${cat.alias} ${cat.residenceName??''}`.toLocaleLowerCase().includes(text))));
}
