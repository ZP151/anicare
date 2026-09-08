begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

do $seed$
begin
  insert into public.animals(id,primary_alias,verification,lifecycle,visibility,identity_origin_required,confirmed_photo_count)
  values('00000000-0000-4000-8000-000000003001','Smoke 测试样本 S01','reported','active','public',false,0);
  insert into public.animal_aliases(animal_id,alias) values('00000000-0000-4000-8000-000000003001','测试样本 S01');
  insert into public.sightings(animal_id,occurred_at,recorded_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,notes,client_dedupe_key)
  values('00000000-0000-4000-8000-000000003001',now()-interval '8 hours',now()-interval '7 hours','896520ca163ffff','morning','normal','public',now()-interval '5 hours','{"source":"synthetic_test","provenance":"reported"}','Synthetic test sample; not a human confirmation.','ios26-s01-sighting');
  insert into public.care_events(animal_id,activity,completed_at,public_cell_id,notes,client_dedupe_key,visibility,visible_at,created_at)
  values('00000000-0000-4000-8000-000000003001','feed',now()-interval '6 hours','896520ca163ffff','Synthetic reported care test sample.','ios26-s01-care','public',now()-interval '3 hours',now()-interval '5 hours');
  insert into private.cat_presentations(animal_id,portrait_path,sample_label,source_metadata)
  values('00000000-0000-4000-8000-000000003001','synthetic-test/00000000-0000-4000-8000-000000003001/portrait.jpg','测试样本 S01','{"provenance":"synthetic_test","training_eligible":false,"fixture_key":"ios26-s01"}');
  insert into private.test_sample_provisioning(fixture_key,animal_id,source_sha256)
  values('ios26-s01','00000000-0000-4000-8000-000000003001',repeat('a',64));
end
$seed$;

select is((select count(*) from public.get_public_cat_presentations(array['00000000-0000-4000-8000-000000003001']::uuid[])),1::bigint,'seed shape yields one public presentation');
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000003001',null,20)),1::bigint,'seeded care is visible after its two-hour delay');
select lives_ok($$insert into private.test_sample_provisioning(fixture_key,animal_id,source_sha256) values('ios26-s01','00000000-0000-4000-8000-000000003001',repeat('a',64)) on conflict (fixture_key) do nothing$$,'rerun ledger insert is idempotent');
select is((select count(*) from public.animals where id='00000000-0000-4000-8000-000000003001'),1::bigint,'rerun does not create a duplicate animal');
select * from finish();
rollback;
