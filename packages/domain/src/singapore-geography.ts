import { cellToLatLng } from 'h3-js';
import { isSingaporePublicCell } from './location-policy.js';
import { singaporeGeographyData } from './singapore-geography-data.js';

export type SingaporeRegion = 'central'|'east'|'north'|'north_east'|'west';
export type SingaporeCommunity = Readonly<{
  id:string; name:string; code:string; region:SingaporeRegion;
  /** Planning-area camera centre [longitude, latitude], not a cat location. */
  center:readonly number[];
  polygons:readonly (readonly (readonly (readonly number[])[])[])[];
}>;
export const singaporeCommunities: readonly SingaporeCommunity[] = singaporeGeographyData as SingaporeCommunity[];

function inRing(point:readonly number[], ring:readonly (readonly number[])[]):boolean {
  const [x,y]=point as [number,number];
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i]! as [number,number];
    const [xj,yj]=ring[j]! as [number,number];
    if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
export function pointInPolygon(point:readonly number[], polygon:readonly (readonly (readonly number[])[])[]):boolean {
  return !!polygon[0] && inRing(point,polygon[0]) && !polygon.slice(1).some(hole=>inRing(point,hole));
}
/** Public cells are already delayed/coarsened by the feed. Never return their centre to the UI. */
export function communityForPublicCell(cell:string):SingaporeCommunity|null {
  if(!isSingaporePublicCell(cell)) return null;
  const [latitude,longitude]=cellToLatLng(cell);
  return singaporeCommunities.find(area=>area.polygons.some(polygon=>pointInPolygon([longitude,latitude],polygon))) ?? null;
}
