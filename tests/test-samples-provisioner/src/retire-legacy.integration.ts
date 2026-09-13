import assert from 'node:assert/strict';
import postgres from 'postgres';
import {retireLegacySamples} from './retire-legacy.js';
const url=process.env.SAMPLE_TEST_DATABASE_URL;
if(!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('local_database_required');
const db=postgres(url,{max:1,prepare:false,onnotice:()=>{}}),rollback=new Error('rollback_test');
try{
 await db.begin(async sql=>{
  const actor='00000000-0000-4000-8000-000000009991';
  await sql`insert into auth.users(id) values(${actor}::uuid)`;
  await sql`insert into public.user_profiles(id,public_name) values(${actor}::uuid,'Protected real test author')`;
  const cats=[91,92,93].map(n=>[`ios26-s${n}`,`00000000-0000-4000-8000-000000009${n}1`,'Test cat',null,'896520ca163ffff'] as const);
  for(const [key,id,name] of cats){await sql`insert into public.animals(id,primary_alias,visibility) values(${id}::uuid,${name+' 测试样本 S'+key.slice(-2)},'public')`;await sql`insert into private.test_sample_provisioning(fixture_key,animal_id,source_sha256) values(${key},${id}::uuid,${'a'.repeat(64)})`;}
  await sql`insert into public.sightings(animal_id,occurred_at,public_cell_id,time_bucket,client_dedupe_key,traits,visibility,visible_at) values(${cats[0]![1]}::uuid,now(),'896520ca163ffff','morning','ios26-s91-sighting','{"source":"synthetic_test"}'::jsonb,'public',now())`;
  await sql`insert into public.care_events(animal_id,activity,completed_at,public_cell_id,client_dedupe_key,notes,visibility,visible_at) values(${cats[0]![1]}::uuid,'feed',now(),'896520ca163ffff','ios26-s91-care','Synthetic reported care test sample.','public',now())`;
  const posts=[91,92,93,94].map((n,i)=>({id:`00000000-0000-4000-8000-000000008${n}1`,code:`C${n}`,body:{en:'Untouched fixture'},catId:cats[Math.min(i,2)]![1],communitySlug:'jurong-west',reply:{id:`00000000-0000-4000-8000-000000007${n}1`,body:{en:'Fixture reply'}}}));
  for(const [i,p] of posts.entries())await sql`insert into public.community_posts(id,author_id,body,cat_id,community_slug) values(${p.id}::uuid,${i===3?actor:null}::uuid,${p.body.en},${p.catId}::uuid,${p.communitySlug})`;
  await sql`create table public.c1_test_post_reference(post_id uuid references public.community_posts(id))`;
  await sql`insert into public.c1_test_post_reference values(${posts[1]!.id}::uuid)`;
  await sql`create table private.c1_test_polymorphic_reference(content_id uuid)`;
  await sql`insert into private.c1_test_polymorphic_reference values(${posts[2]!.id}::uuid)`;
  await sql`create table public.c1_test_cat_reference(animal_id uuid references public.animals(id))`;
  await sql`insert into public.c1_test_cat_reference values(${cats[0]![1]}::uuid)`;
  const adapter={begin:(fn:any)=>sql.savepoint(fn)} as unknown as Parameters<typeof retireLegacySamples>[0];
  const result=await retireLegacySamples(adapter,posts as unknown as Parameters<typeof retireLegacySamples>[1],cats as unknown as Parameters<typeof retireLegacySamples>[2]);
  assert.deepEqual(result.retiredPosts,[posts[0]!.id]);assert.deepEqual(new Set(result.preservedPosts),new Set(posts.slice(1).map(p=>p.id)));
  assert.equal(result.archivedCats.length,0);assert.equal(result.preservedCats.length,3);
  const repeated=await retireLegacySamples(adapter,posts as unknown as Parameters<typeof retireLegacySamples>[1],cats as unknown as Parameters<typeof retireLegacySamples>[2]);assert.deepEqual(repeated,result);
  await sql`delete from public.c1_test_cat_reference`;
  await sql`create table private.c1_test_sighting_hold(sighting_id uuid references public.sightings(id))`;
  await sql`insert into private.c1_test_sighting_hold select id from public.sightings where animal_id=${cats[0]![1]}::uuid`;
  await sql`create table private.c1_test_care_hold(care_event_id uuid references public.care_events(id))`;
  await sql`insert into private.c1_test_care_hold select id from public.care_events where animal_id=${cats[0]![1]}::uuid`;
  const held=await retireLegacySamples(adapter,posts as unknown as Parameters<typeof retireLegacySamples>[1],cats as unknown as Parameters<typeof retireLegacySamples>[2]);
  assert.equal(held.archivedCats.length,0);assert.equal(held.retiredSightings.length,0);assert.equal(held.retiredCare.length,0);
  await sql`delete from private.c1_test_sighting_hold`;
  const careHeld=await retireLegacySamples(adapter,posts as unknown as Parameters<typeof retireLegacySamples>[1],cats as unknown as Parameters<typeof retireLegacySamples>[2]);assert.equal(careHeld.archivedCats.length,0);
  await sql`delete from private.c1_test_care_hold`;
  const final=await retireLegacySamples(adapter,posts as unknown as Parameters<typeof retireLegacySamples>[1],cats as unknown as Parameters<typeof retireLegacySamples>[2]);assert.deepEqual(final.archivedCats,[cats[0]![1]]);assert.equal(final.retiredSightings.length,1);assert.equal(final.retiredCare.length,1);
  const kept=await sql`select id from public.community_posts where id=any(${sql.array(posts.slice(1).map(p=>p.id))}::uuid[]) and deleted_at is null`;assert.equal(kept.length,3);
  console.log('PASS: exact retirement; author, unknown FK and polymorphic reference protection; archive and rerun idempotence. All test writes roll back.');
  throw rollback;
 });
}catch(error){if(error!==rollback)throw error;}finally{await db.end();}
