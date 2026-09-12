import {movePhoto,photoDropIndex} from './photo-order';

it.each([
 [0,5,['b','c','d','e','f','a']],
 [5,0,['f','a','b','c','d','e']],
 [2,3,['a','b','d','c','e','f']],
 [2,2,['a','b','c','d','e','f']],
 [-1,3,['a','b','c','d','e','f']],
 [2,6,['a','b','c','d','e','f']],
] as const)('moves index %s to %s without losing another image', (from,to,want)=>{
 const original=['a','b','c','d','e','f'];expect(movePhoto(original,from,to)).toEqual(want);expect(original).toEqual(['a','b','c','d','e','f']);
});
it.each([
 [0,200,144,6,5],[5,-200,-144,6,0],[0,0,144,6,3],[0,250,0,6,2],
 [0,200,144,3,2],[2,1000,1000,6,2],[4,-1000,0,6,4],
] as const)('maps drag %s (%s,%s) with %s images to slot %s',(from,x,y,count,want)=>{
 expect(photoDropIndex(from,x,y,100,144,count)).toBe(want);
});
