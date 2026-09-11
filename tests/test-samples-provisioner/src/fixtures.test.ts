import assert from 'node:assert/strict';
import test from 'node:test';
import {communityForPublicCell} from '../../../packages/domain/src/singapore-geography.js';
import {samples,legacyEnglishNames,samplePlaces} from './fixtures.js';
test('thirty-two labelled sample cats span every Singapore planning region with two intentional missing portraits',()=>{
 assert.equal(samples.length,32);assert.equal(new Set(samples.map(s=>s[1])).size,32);
 assert.deepEqual(new Set(samples.map(s=>communityForPublicCell(s[4])?.region)),new Set(['central','east','north','north_east','west']));
 samples.forEach((sample,i)=>assert.match(legacyEnglishNames[i]??sample[2],/[A-Za-z]/));
 assert.equal(samples.filter(s=>s[3]!==null).length,30);
 assert.equal(samples.find(sample=>sample[0]==='ios26-s05')?.[3],null);
 assert.equal(samples.find(sample=>sample[0]==='ios26-s06')?.[3],null);
 assert.equal(samples.find(sample=>sample[0]==='ios26-s15')?.[3],'biscuit.jpg');
 assert.equal(samples.find(sample=>sample[0]==='ios26-s16')?.[3],'willow.jpg');
 for(const place of Object.values(samplePlaces))assert.match(place.name,/^Demo /);
});
