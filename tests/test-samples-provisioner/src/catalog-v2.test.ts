import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_COMMUNITY_TEST_POSTS as posts,SAMPLE_ACTORS_V2 as actors,SAMPLE_CATS_V2 as cats } from '../../../apps/mobile/src/community/sample-catalog-v2.js';
test('each active cat has stories from two real fixture actors and unique photographs',()=>{
 assert.equal(posts.length,8);assert.equal(new Set(actors.map(a=>a.id)).size,4);
 const media=posts.flatMap(p=>[...p.media]);assert.equal(media.length,16);assert.equal(new Set(media).size,media.length);
 for(const cat of cats){const stories=posts.filter(p=>p.catId===cat[1]);assert.equal(stories.length,2);assert.equal(new Set(stories.map(p=>p.profile.id)).size,2);assert.ok(stories.some(p=>p.media.includes(cat[3] as never)));}
 assert.ok(posts.some(p=>p.media.length===6));assert.ok(posts.every(p=>p.catId&&p.media.length&&p.body.en.startsWith('[Test sample')));
});
