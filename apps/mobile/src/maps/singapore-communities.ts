import { singaporeCommunities, singaporeNeighbourhoods, neighbourhoodForPublicCell, communityForPublicCell, type SingaporeCommunity, type SingaporeRegion } from '@animalhelper/domain';
import type { PublicSighting } from '../api/feed';
import type { SightingPlace } from '../api/sighting-places';
import type { Locale } from '../i18n/catalog';
import { toPublicMapPresentation, type PublicMapPresentation } from './public-map-policy';
export type BrowseCommunity=SingaporeCommunity & Readonly<{parentId?:string}>;
export const SG_COMMUNITIES:readonly BrowseCommunity[]=[...singaporeCommunities,...singaporeNeighbourhoods];
const CHINESE_NAMES:Readonly<Record<string,string>>={clementi:'金文泰','sg-clsz01':'杜德','sg-clsz02':'日落道','sg-clsz03':'花柏','sg-clsz04':'金文泰北','sg-clsz05':'西海岸','sg-clsz06':'金文泰中心','sg-clsz07':'金文泰林','sg-clsz08':'金文泰西','sg-clsz09':'班丹'};
export function communityLabel(area:BrowseCommunity,locale:Locale):string {
 const zh=CHINESE_NAMES[area.id]; return locale==='zh-CN'&&zh?`${zh} · ${area.name}`:area.name;
}
export function communityMatches(area:BrowseCommunity,query:string):boolean {
 const parent=SG_COMMUNITIES.find(p=>p.id===area.parentId);
 const alias=area.id==='sg-clsz08'?'West Coast CC 西海岸民众俱乐部':'';
 return `${area.name} ${CHINESE_NAMES[area.id]??''} ${parent?.name??''} ${parent?CHINESE_NAMES[parent.id]??'':''} ${alias}`.toLowerCase().includes(query.trim().toLowerCase());
}
export function browseSingaporeCommunities(query:string,parentId:string|null=null):readonly BrowseCommunity[] {
 return SG_COMMUNITIES.filter(area=>query.trim()?communityMatches(area,query):parentId?area.parentId===parentId:!area.parentId);
}
export const SG_REGIONS:readonly {id:SingaporeRegion;en:string;zh:string}[]=[{id:'central',en:'Central',zh:'中部'},{id:'east',en:'East',zh:'东部'},{id:'north',en:'North',zh:'北部'},{id:'north_east',en:'North-East',zh:'东北部'},{id:'west',en:'West',zh:'西部'}];
export type SingaporeArea=BrowseCommunity & Readonly<{cats:readonly (PublicMapPresentation & Partial<SightingPlace>)[]}>;
export function buildSingaporeAreas(sightings:readonly PublicSighting[],places:ReadonlyMap<string,SightingPlace>,locale:Locale):readonly SingaporeArea[] {
 const grouped=new Map<string,Map<string,PublicMapPresentation & Partial<SightingPlace>>>();
 // Feed order is newest visible first. Deduplicate within each community, retaining latest context.
 for(const row of sightings) {
   const community=communityForPublicCell(row.publicCellId);
   if(!community) continue;
   const neighbourhood=neighbourhoodForPublicCell(row.publicCellId);
   for(const scope of neighbourhood?[community,neighbourhood]:[community]) {
     const cats=grouped.get(scope.id)??new Map();
     if(!cats.has(row.animalId)) cats.set(row.animalId,{...toPublicMapPresentation(row,locale),...places.get(row.sightingId)});
     grouped.set(scope.id,cats);
   }
 }
 return SG_COMMUNITIES.map(area=>({...area,cats:[...(grouped.get(area.id)?.values()??[])]})).sort((a,b)=>b.cats.length-a.cats.length || a.name.localeCompare(b.name));
}
export function filterSingaporeAreas(areas:readonly SingaporeArea[],region:SingaporeRegion|'all',query:string):readonly SingaporeArea[] {
 const text=query.trim().toLocaleLowerCase();
 return areas.filter(area=>(region==='all'||area.region===region) && (!text ? !area.parentId : communityMatches(area,text) || area.cats.some(cat=>`${cat.alias} ${cat.residenceName??''}`.toLocaleLowerCase().includes(text))));
}
