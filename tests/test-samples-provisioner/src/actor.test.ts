import assert from 'node:assert/strict';import test from 'node:test';import {validateFixtureActor} from './actor.js';
const expected={name:'Demo Mei',avatarKey:'human-01'},user={raw_app_meta_data:{fixture:'c1-samples-v2'}},profile={public_name:expected.name,avatar_key:expected.avatarKey};
test('only credentialless untouched fixture actors can be reused',()=>{
 assert.doesNotThrow(()=>validateFixtureActor(user,profile,0,expected));
 for(const key of ['email','phone','encrypted_password','email_confirmed_at','phone_confirmed_at','last_sign_in_at'])assert.throws(()=>validateFixtureActor({...user,[key]:'changed'},profile,0,expected),/actor_collision/);
 for(const key of ['adult_confirmed_at','training_consent_at','training_consent_withdrawn_at'])assert.throws(()=>validateFixtureActor(user,{...profile,[key]:'changed'},0,expected),/actor_collision/);
 assert.throws(()=>validateFixtureActor({...user,is_anonymous:true},profile,0,expected),/actor_collision/);
 assert.throws(()=>validateFixtureActor(user,profile,0,expected,1),/actor_collision/);
 assert.throws(()=>validateFixtureActor(user,profile,1,expected),/actor_collision/);
 assert.throws(()=>validateFixtureActor({raw_app_meta_data:{}},profile,0,expected),/actor_collision/);
});
