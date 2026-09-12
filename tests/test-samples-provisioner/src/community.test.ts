import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureCommunitySample,readSampleExtras} from './community.js';

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

test('reads expanded fixture extras in batches no larger than the public RPC limit',async()=>{
 const ids=Array.from({length:56},(_,i)=>String(i)),batches:string[][]=[];
 const rows=await readSampleExtras(ids,async batch=>{batches.push([...batch]);return {error:null,data:batch.map(postId=>({postId}))};});
 assert.deepEqual(batches.map(batch=>batch.length),[50,6]);assert.deepEqual(rows.map(row=>row.postId),ids);
});
test('does not accept a partial verification if a later extras batch fails',async()=>{
 let calls=0;await assert.rejects(readSampleExtras(Array.from({length:101},(_,i)=>String(i)),async ids=>++calls===2?{data:null,error:'failed'}:{data:ids.map(postId=>({postId})),error:null}),/test_sample_community_media_public_read_failed/);
 assert.equal(calls,2);
});
