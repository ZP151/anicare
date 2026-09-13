import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDiscoverableSamples } from './discovery.js';
test('checks every fixture over public discovery pages without assuming supported area filters',async()=>{
 const cursors:(string|null)[]=[];
 await verifyDiscoverableSamples(['a','b'],async cursor=>{cursors.push(cursor);return {error:null,data:cursor===null?[{animalId:'a',cursor:'first'}]:[{animalId:'b',cursor:'second'}]};});
 assert.deepEqual(cursors,[null,'first']);
});
test('fails closed when an expected fixture is absent or a public read fails',async()=>{
 await assert.rejects(verifyDiscoverableSamples(['a'],async()=>({error:null,data:[]})),/test_sample_discovery_failed/);
 await assert.rejects(verifyDiscoverableSamples(['a'],async()=>({error:{code:'offline'},data:null})),/test_sample_discovery_failed/);
});
test('bounds pagination and rejects a repeated cursor or malformed projection',async()=>{
 let calls=0;
 await assert.rejects(verifyDiscoverableSamples(['missing'],async()=>{calls++;return {error:null,data:[{animalId:'other',cursor:'same'}]};}),/test_sample_discovery_failed/);
 assert.equal(calls,2);
 await assert.rejects(verifyDiscoverableSamples(['a'],async()=>({error:null,data:[{animalId:'a'}]})),/test_sample_discovery_failed/);
});
