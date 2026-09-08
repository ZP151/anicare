import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ensurePortrait } from './portrait.js';

const bytes = Buffer.from('approved test artwork');
const hash = createHash('sha256').update(bytes).digest('hex');
test('uploads a missing file only after a successful exact directory listing', async () => {
  let uploaded = 0;
  await ensurePortrait({ list: async () => ({data:[],error:null}), download: async () => {throw new Error('must not download absent file');}, upload: async () => {uploaded++;return {error:null};} },hash);
  assert.equal(uploaded,1);
});
test('never treats a failed listing as an absent file', async () => {
  let uploaded=0;
  await assert.rejects(ensurePortrait({list:async()=>({data:null,error:{status:403}}),download:async()=>({data:null,error:null}),upload:async()=>{uploaded++;return {error:null};}},hash),/portrait_list_failed/);
  assert.equal(uploaded,0);
});
test('reuses an uploaded matching portrait after an interrupted transaction', async () => {
  let uploaded=0;
  await ensurePortrait({list:async()=>({data:[{name:'portrait.jpg'}],error:null}),download:async()=>({data:new Blob([bytes]),error:null}),upload:async()=>{uploaded++;return {error:null};}},hash);
  assert.equal(uploaded,0);
});
test('refuses to overwrite a different existing portrait', async () => {
  await assert.rejects(ensurePortrait({list:async()=>({data:[{name:'portrait.jpg'}],error:null}),download:async()=>({data:new Blob(['different']),error:null}),upload:async()=>{throw new Error('must not overwrite');}},hash),/portrait_collision/);
});
