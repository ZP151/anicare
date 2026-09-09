import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureCommunitySample} from './community.js';

test('inserts once, preserves an existing deleted sample, and rejects collisions',async()=>{
 const expected={id:'fixed-id',author_id:null,body:'[Test sample C01] Hello',community_slug:'clementi',cat_id:null};
 let existing:Record<string,unknown>|null=null, inserts=0;
 const adapter={read:async()=>existing,insert:async()=>{inserts++;existing={...expected};}};
 await ensureCommunitySample(adapter,expected);
 await ensureCommunitySample(adapter,expected);
 assert.equal(inserts,1);
 existing={...expected,deleted_at:'2026-09-10'};
 await ensureCommunitySample(adapter,expected);assert.equal(inserts,1);
 existing={...expected,body:'Unrelated content'};
 await assert.rejects(ensureCommunitySample(adapter,expected),/test_sample_community_collision/);
});
