import { describe, expect, it } from 'vitest';
import { toPublicLocationCell } from './location-policy.js';
import { singaporeCommunities, communityForPublicCell, pointInPolygon } from './singapore-geography.js';

describe('Singapore planning geography', () => {
  it('covers all 55 URA areas in five official regions', () => {
    expect(singaporeCommunities).toHaveLength(55);
    expect(new Set(singaporeCommunities.map(area => area.region))).toEqual(new Set(['central','east','north','north_east','west']));
  });
  it.each([
    [1.436,103.786,'woodlands','north'],
    [1.353,103.945,'tampines','east'],
    [1.405,103.902,'punggol','north_east'],
    [1.340,103.706,'jurong-west','west'],
    [1.332,103.849,'toa-payoh','central'],
  ])('locates %s,%s using polygons', (latitude,longitude,id,region) => {
    expect(communityForPublicCell(toPublicLocationCell({latitude:Number(latitude),longitude:Number(longitude)}).cellId)).toMatchObject({id,region});
  });
  it('does not guess foreign or malformed cells', () => {
    expect(communityForPublicCell('bad')).toBeNull();
    expect(communityForPublicCell(toPublicLocationCell({latitude:35,longitude:139}).cellId)).toBeNull();
  });
  it('respects polygon holes', () => {
    const polygon=[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]];
    expect(pointInPolygon([2,2],polygon)).toBe(true);
    expect(pointInPolygon([5,5],polygon)).toBe(false);
  });
});
