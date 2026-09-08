import assert from 'node:assert/strict';
import test from 'node:test';
import {communityForPublicCell} from '../../../packages/domain/src/singapore-geography.js';
import {samples,legacyEnglishNames,samplePlaces} from './fixtures.js';
test('sixteen unique labelled sample cats span every Singapore planning region',()=>{
 assert.equal(samples.length,16);assert.equal(new Set(samples.map(s=>s[1])).size,16);
 assert.deepEqual(new Set(samples.map(s=>communityForPublicCell(s[4])?.region)),new Set(['central','east','north','north_east','west']));
 samples.forEach((sample,i)=>assert.match(legacyEnglishNames[i]??sample[2],/[A-Za-z]/));
 assert.equal(samples.filter(s=>s[3]!==null).length,12);
 for(const place of Object.values(samplePlaces))assert.match(place.name,/^Demo /);
});
