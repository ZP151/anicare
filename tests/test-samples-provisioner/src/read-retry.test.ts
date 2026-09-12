import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retrySampleRead} from './read-retry.js';
test('recovers a read error without repeating the write and bounds backoff',async()=>{
 let calls=0;const delays:number[]=[];
 const result=await retrySampleRead(async()=>++calls<3?{data:null,error:{code:'network'}}:{data:['visible'],error:null},async ms=>{delays.push(ms);});
 assert.equal(calls,3);assert.deepEqual(delays,[750,1500]);assert.deepEqual(result.data,['visible']);
});
test('leaves empty or mismatched successful payloads to strict caller validation',async()=>{
 let calls=0;const result=await retrySampleRead(async()=>{calls++;return {data:[],error:null};},async()=>assert.fail('must not retry payload'));
 assert.equal(calls,1);assert.deepEqual(result.data,[]);
});
test('does not convert persistent failures into success',async()=>{
 let calls=0;const result=await retrySampleRead(async()=>{calls++;return {data:null,error:{code:'unavailable'}};},async()=>{});
 assert.equal(calls,3);assert.deepEqual(result.error,{code:'unavailable'});
 let thrown=0;await assert.rejects(retrySampleRead(async()=>{thrown++;throw new Error('offline');},async()=>{}),/offline/);assert.equal(thrown,3);
});
