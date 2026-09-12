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
test('aborts a hung read and gives each bounded attempt a fresh signal',async()=>{
 const signals:AbortSignal[]=[];
 await assert.rejects(retrySampleRead(signal=>{signals.push(signal);return new Promise<{error:unknown}>(()=>{});},async()=>{},5),/test_sample_read_timeout/);
 assert.equal(signals.length,3);assert.equal(new Set(signals).size,3);assert.ok(signals.every(signal=>signal.aborted));
});
