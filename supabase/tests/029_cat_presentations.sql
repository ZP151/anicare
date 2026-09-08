begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private','cat_presentations','approved portrait registry is private');
select has_function('public','get_public_cat_presentations',array['uuid[]'],'narrow presentation batch RPC exists');
select ok(not has_table_privilege('authenticated','private.cat_presentations','select,insert,update,delete'),'presentation registry is not readable or writable by clients');
select ok(exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='approved public cat portraits are readable' and cmd='SELECT'),'portrait storage has only an eligibility-bound read policy');
select ok(has_function_privilege('anon','public.get_public_cat_presentations(uuid[])','execute'),'anonymous rendering reads use only the narrow RPC');
select is((select public from storage.buckets where id='cat-portraits'),false,'portrait bucket is private');

set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000002921','Presentation reporter',now()),
 ('00000000-0000-4000-8000-000000002922','Presentation viewer',now());
set local session_replication_role=origin;
insert into public.animals(id,primary_alias,visibility,verification,identity_origin_required) values
 ('00000000-0000-4000-8000-000000002901','Visible portrait','public','reported',false),
 ('00000000-0000-4000-8000-000000002902','Hidden portrait','hidden','reported',false),
 ('00000000-0000-4000-8000-000000002903','Delayed portrait','public','reported',false),
 ('00000000-0000-4000-8000-000000002904','Critical portrait','public','reported',false),
 ('00000000-0000-4000-8000-000000002905','Blocked portrait','public','reported',false),
 ('00000000-0000-4000-8000-000000002906','No portrait','public','reported',false);
insert into public.sightings(id,animal_id,reporter_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,client_dedupe_key) values
 ('00000000-0000-4000-8000-000000002911','00000000-0000-4000-8000-000000002901',null,now()-interval '3 hours','89652636d87ffff','morning','normal','public',now()-interval '2 hours','{}','presentation-visible'),
 ('00000000-0000-4000-8000-000000002912','00000000-0000-4000-8000-000000002902',null,now()-interval '3 hours','89652636d87ffff','morning','normal','public',now()-interval '2 hours','{}','presentation-hidden'),
 ('00000000-0000-4000-8000-000000002913','00000000-0000-4000-8000-000000002903',null,now()-interval '3 hours','89652636d87ffff','morning','normal','public',now()+interval '2 hours','{}','presentation-delayed'),
 ('00000000-0000-4000-8000-000000002914','00000000-0000-4000-8000-000000002904',null,now()-interval '3 hours','89652636d87ffff','morning','critical','hidden',null,'{}','presentation-critical'),
 ('00000000-0000-4000-8000-000000002915','00000000-0000-4000-8000-000000002905','00000000-0000-4000-8000-000000002921',now()-interval '3 hours','89652636d87ffff','morning','normal','public',now()-interval '2 hours','{}','presentation-blocked'),
 ('00000000-0000-4000-8000-000000002916','00000000-0000-4000-8000-000000002906',null,now()-interval '3 hours','89652636d87ffff','morning','normal','public',now()-interval '2 hours','{}','presentation-no-portrait');
insert into private.cat_presentations(animal_id,portrait_path,sample_label,source_metadata) values
 ('00000000-0000-4000-8000-000000002901','synthetic-test/00000000-0000-4000-8000-000000002901/portrait.jpg','测试样本 S01','{"provenance":"synthetic_test","training_eligible":false}'),
 ('00000000-0000-4000-8000-000000002902','synthetic-test/00000000-0000-4000-8000-000000002902/portrait.jpg','测试样本 S02','{"provenance":"synthetic_test","training_eligible":false}'),
 ('00000000-0000-4000-8000-000000002903','synthetic-test/00000000-0000-4000-8000-000000002903/portrait.jpg','测试样本 S03','{"provenance":"synthetic_test","training_eligible":false}'),
 ('00000000-0000-4000-8000-000000002904','synthetic-test/00000000-0000-4000-8000-000000002904/portrait.jpg','测试样本 S04','{"provenance":"synthetic_test","training_eligible":false}'),
 ('00000000-0000-4000-8000-000000002905','synthetic-test/00000000-0000-4000-8000-000000002905/portrait.jpg','测试样本 S05','{"provenance":"synthetic_test","training_eligible":false}'),
 ('00000000-0000-4000-8000-000000002906',null,'测试样本 S06','{"provenance":"synthetic_test","training_eligible":false}');
insert into storage.objects(bucket_id,name) values
 ('cat-portraits','synthetic-test/00000000-0000-4000-8000-000000002901/portrait.jpg'),
 ('cat-portraits','synthetic-test/00000000-0000-4000-8000-000000002902/portrait.jpg'),
 ('cat-portraits','synthetic-test/00000000-0000-4000-8000-000000002905/portrait.jpg');

set local role anon;
select is((select count(*) from storage.objects where bucket_id='cat-portraits' and name='synthetic-test/00000000-0000-4000-8000-000000002901/portrait.jpg'),1::bigint,'anon can read an eligible approved portrait through Storage RLS');
select is((select count(*) from storage.objects where bucket_id='cat-portraits' and name='synthetic-test/00000000-0000-4000-8000-000000002902/portrait.jpg'),0::bigint,'anon cannot read a hidden cat portrait through Storage RLS');
reset role;

select is((select array_agg("animalId" order by "animalId") from public.get_public_cat_presentations(array[
 '00000000-0000-4000-8000-000000002901','00000000-0000-4000-8000-000000002902','00000000-0000-4000-8000-000000002903','00000000-0000-4000-8000-000000002904','00000000-0000-4000-8000-000000002905','00000000-0000-4000-8000-000000002906']::uuid[])),
 array['00000000-0000-4000-8000-000000002901'::uuid,'00000000-0000-4000-8000-000000002905'::uuid,'00000000-0000-4000-8000-000000002906'::uuid],
 'only currently public, non-delayed, non-critical presentations are projected');
select is((select "portraitPath" from public.get_public_cat_presentations(array['00000000-0000-4000-8000-000000002901']::uuid[])),
 'synthetic-test/00000000-0000-4000-8000-000000002901/portrait.jpg','RPC returns only opaque approved portrait path');
select is((select "sampleLabel" from public.get_public_cat_presentations(array['00000000-0000-4000-8000-000000002906']::uuid[])),
 '测试样本 S06','photo-less synthetic sample remains explicitly labeled');
insert into public.user_blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000002922','00000000-0000-4000-8000-000000002921');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002922',true);
select is((select count(*) from public.get_public_cat_presentations(array['00000000-0000-4000-8000-000000002905']::uuid[])),0::bigint,'blocked source suppresses both portrait and label');
select is((select count(*) from storage.objects where bucket_id='cat-portraits' and name='synthetic-test/00000000-0000-4000-8000-000000002905/portrait.jpg'),0::bigint,'blocked caller cannot read the portrait through Storage RLS');
reset role;

set local role authenticated;
select throws_ok($$insert into storage.objects(bucket_id,name) values('cat-portraits','synthetic-test/forged/portrait.jpg')$$,'42501',null,'raw portrait object writes are denied');
reset role;
select throws_ok($$insert into private.cat_presentations(animal_id,portrait_path,sample_label,source_metadata) values('00000000-0000-4000-8000-000000002901','synthetic-test/other/portrait.jpg','测试样本 S01','{}')$$,null,null,'registry rejects a non-canonical portrait path');
select * from finish(); rollback;
