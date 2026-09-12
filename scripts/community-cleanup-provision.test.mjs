import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanupProvisioner} from './community-cleanup-provision.mjs';

function fake(secret, jobs=[{schedule:'*/15 * * * *',command:'select private.invoke_community_media_cleanup()',active:true,username:'postgres'}]) {
  const calls=[];
  const sql=async (strings,...values)=>{const text=strings.join('?');calls.push({text,values});if(text.includes('decrypted_secret'))return secret===undefined?[]:[{decrypted_secret:secret}];if(text.includes('cron.job'))return jobs;return [];};
  sql.begin=fn=>fn(sql);sql.end=async()=>{calls.push({text:'closed'});};
  return {calls,adapter:cleanupProvisioner(()=>sql)};
}
test('generates once, restores an existing capability and closes connections',async()=>{
  const fresh=fake();assert.match(await fresh.adapter.prepare('db'),/^[A-Za-z0-9_-]{43}$/);assert.equal(fresh.calls.at(-1).text,'closed');
  const existing=fake('a'.repeat(43));assert.equal(await existing.adapter.prepare('db'),'a'.repeat(43));
});
test('first activation uses a parameterized secret and validates the exact cron job',async()=>{
  const state=fake();await state.adapter.activate('db','a'.repeat(43));assert.ok(state.calls.some(x=>x.text.includes('vault.create_secret')&&x.values[0]==='a'.repeat(43)));assert.ok(state.calls.every(x=>!x.text.includes('a'.repeat(43))));
});
test('never rotates an existing secret and rejects drift without leaking values',async()=>{
  const state=fake('b'.repeat(43));await assert.rejects(state.adapter.activate('db','a'.repeat(43)),{message:'community_cleanup_configuration_failed'});assert.ok(!state.calls.some(x=>x.text.includes('vault.create_secret')));
  await assert.rejects(fake('invalid').adapter.prepare('db'),{message:'community_cleanup_configuration_failed'});
  await assert.rejects(fake(undefined,[]).adapter.activate('db','a'.repeat(43)),{message:'community_cleanup_configuration_failed'});
});
test('connection closure failures remain sanitized',async()=>{
  const sql=async()=>[];sql.end=async()=>{throw new Error('driver leaked a-secret');};
  await assert.rejects(cleanupProvisioner(()=>sql).prepare('private-db-url'),{message:'community_cleanup_configuration_failed'});
});
