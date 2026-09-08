import { cellToLatLng } from 'h3-js';
import { communityForPublicCell, pointInPolygon, singaporeCommunities, type SingaporeCommunity } from './singapore-geography.js';
import { singaporeNeighbourhoodData } from './singapore-neighbourhood-data.js';

export type SingaporeNeighbourhood = SingaporeCommunity & Readonly<{parentId:string}>;
/** MP2019 subzones and MP2025 parents retain separate source versions. */
export const singaporeNeighbourhoods: readonly SingaporeNeighbourhood[] = singaporeNeighbourhoodData.flatMap(area => {
  const parent = singaporeCommunities.find(p => p.id === area.parentId);
  return parent ? [{...area,region:parent.region}] : [];
});

/** Approximate neighbourhood of an already delayed public cell, never a live location. */
export function neighbourhoodForPublicCell(cell:string):SingaporeNeighbourhood|null {
  const parent = communityForPublicCell(cell);
  if (!parent) return null;
  const [latitude,longitude] = cellToLatLng(cell);
  // Fail closed to the planning area where versions disagree; no nearest-neighbour guess.
  return singaporeNeighbourhoods.find(n => n.parentId === parent.id && n.polygons.some(p => pointInPolygon([longitude,latitude],p))) ?? null;
}
