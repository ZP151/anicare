import { describe, expect, it } from 'vitest';
import { toPublicLocationCell } from './location-policy.js';
import { singaporeCommunities, pointInPolygon } from './singapore-geography.js';
import { singaporeNeighbourhoods, neighbourhoodForPublicCell } from './singapore-neighbourhoods.js';

describe('official neighbourhood hierarchy', () => {
  it('keeps subzones separate from the 55 planning areas and uses stable URA codes', () => {
    expect(singaporeNeighbourhoods).toHaveLength(332);
    expect(new Set(singaporeNeighbourhoods.map(n => n.id)).size).toBe(332);
    expect(singaporeNeighbourhoods.every(n => singaporeCommunities.some(p => p.id === n.parentId))).toBe(true);
    expect(singaporeNeighbourhoods.find(n => n.name === 'West Coast')).toMatchObject({id:'sg-clsz05',parentId:'clementi',region:'west'});
    expect(singaporeNeighbourhoods.filter(n => n.parentId === 'clementi')).toHaveLength(9);
  });
  it('does not confuse West Coast CC with the URA West Coast subzone', () => {
    // PA West Coast CC at Clementi West St 2; its community name is not a polygon lookup.
    const cell = toPublicLocationCell({latitude:1.3035,longitude:103.7644}).cellId;
    expect(neighbourhoodForPublicCell(cell)?.name).toBe('Clementi West');
  });
  it('rejects foreign and malformed cells', () => {
    expect(neighbourhoodForPublicCell('bad')).toBeNull();
    expect(neighbourhoodForPublicCell(toPublicLocationCell({latitude:35,longitude:139}).cellId)).toBeNull();
  });
  it('places every neighbourhood marker inside its own boundary', () => {
    expect(singaporeNeighbourhoods.filter(n => !n.polygons.some(p => pointInPolygon(n.center,p))).map(n => n.name)).toEqual([]);
  });
});
