begin;
select plan(34);
select has_function('public','get_public_cat_summary',array['uuid'],'direct public cat summary exists');
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000002501','Journey owner',now()),
 ('00000000-0000-4000-8000-000000002502','Independent reviewer',now()),
 ('00000000-0000-4000-8000-000000002503','Other reader',now()),
 ('00000000-0000-4000-8000-000000002504','Second reviewer',now());
set local session_replication_role=origin;
insert into public.role_grants(user_id,role) values ('00000000-0000-4000-8000-000000002502','trusted_contributor'),('00000000-0000-4000-8000-000000002504','trusted_contributor');
-- C02 uses the real service report entry, then owner proposal and independent workbench.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.m14.sighting',public.create_sighting_in_public_cell(
 '00000000-0000-4000-8000-000000002501',now(),'8928308280fffff','morning','normal','public',
 now()+interval '1 day','{}','', 'm14-new-report','m14-create')::text,true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002501',true);
select set_config('test.m14.proposal',(select "proposalId"::text from public.submit_identity_proposal(
 current_setting('test.m14.sighting')::uuid,null,'new_animal','00000000-0000-4000-8000-000000002510')),true);
reset role;
select is((select animal_id from public.sightings where id=current_setting('test.m14.sighting')::uuid),null::uuid,'C02 proposal cannot link or create a cat');
-- Synthetic bytes metadata; no target animal is seeded for C02.
insert into public.media_assets(id,sighting_id,uploader_id,storage_bucket,storage_path,sha256,redaction_confirmed_at,status,reviewed_at,client_media_id,byte_length,width,height,recipe_version,detector_versions)
values ('00000000-0000-4000-8000-000000002520',current_setting('test.m14.sighting')::uuid,'00000000-0000-4000-8000-000000002501',
 'media-staging','jobs/00000000-0000-4000-8000-000000002521.jpg',repeat('a',64),now(),'quarantined',now(),'m14-media',100,64,64,'jpeg-srgb-2048-q88.v1','{"cats":"unavailable","people":"unavailable","plates":"unavailable"}');
insert into private.media_upload_jobs(id,sighting_id,uploader_id,media_id,sha256,byte_length,width,height,recipe_version,detector_versions,confirmed_at_local,object_path,status,reserved_at,reservation_expires_at,next_cleanup_at,finalized_at,media_asset_id)
values ('00000000-0000-4000-8000-000000002521',current_setting('test.m14.sighting')::uuid,'00000000-0000-4000-8000-000000002501',
 'm14-media',repeat('a',64),100,64,64,'jpeg-srgb-2048-q88.v1','{"cats":"unavailable","people":"unavailable","plates":"unavailable"}',now(),
 'jobs/00000000-0000-4000-8000-000000002521.jpg','finalized',now(),now()+interval '10 minutes',now()+interval '1 day',now(),'00000000-0000-4000-8000-000000002520');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002502',true);
select set_config('test.m14.cat',(select "animalId"::text from public.decide_identity_review_workbench(
 current_setting('test.m14.proposal')::uuid,'confirm','Independent photo review confirms a new cat.','Journey cat','00000000-0000-4000-8000-000000002511')),true);
select is((select "animalId"::text from public.decide_identity_review_workbench(current_setting('test.m14.proposal')::uuid,'confirm','Independent photo review confirms a new cat.','Journey cat','00000000-0000-4000-8000-000000002511')),current_setting('test.m14.cat'),'C02 confirmation replay returns one stable cat');
reset role;
select is((select count(*) from public.animals where primary_alias='Journey cat'),1::bigint,'C02 creates exactly one profile');
select is((select identity_origin_required from public.animals where id=current_setting('test.m14.cat')::uuid),true,'new profile retains origin requirement');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002501',true);
select is((select "animalId" from public.get_my_identity_result(current_setting('test.m14.sighting')::uuid)),null::uuid,'owner cannot open a delayed new profile early');
select is((select count(*) from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),0::bigint,'by-ID cannot bypass the delay');
select is((select count(*) from public.list_public_sighting_feed(null,50) where "animalId"=current_setting('test.m14.cat')::uuid),0::bigint,'feed cannot bypass the delay');
reset role;
-- Advance the fixture policy clock, without sleeping or changing production policy.
update public.sightings set visible_at=now()-interval '2 days' where id=current_setting('test.m14.sighting')::uuid;
set local role authenticated;
select is((select "animalId"::text from public.get_my_identity_result(current_setting('test.m14.sighting')::uuid)),current_setting('test.m14.cat'),'owner can open an eligible confirmed profile');
select is((select "primaryAlias" from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),'Journey cat','C02 confirmed profile becomes readable');
select is((select count(*) from public.list_public_sighting_feed(null,50) where "animalId"=current_setting('test.m14.cat')::uuid),1::bigint,'C02 completed profile becomes discoverable');
select is((select count(*) from jsonb_object_keys((select to_jsonb(summary) from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid) summary))),4::bigint,'public summary exposes exactly four fields');
reset role;
-- C04: more than fifty newer records cannot break a valid deep link.
insert into public.animals(id,primary_alias,visibility)
select format('00000000-0000-4000-8000-%s',lpad((2600+n)::text,12,'0'))::uuid,'Window cat '||n,'public' from generate_series(1,51) n;
insert into public.sightings(animal_id,reporter_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,client_dedupe_key)
select id,'00000000-0000-4000-8000-000000002503',now(),'8928308280fffff','morning','normal','public',now()-interval '1 hour','m14-window-'||id from public.animals where primary_alias like 'Window cat %';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is((select count(*) from public.list_public_sighting_feed(null,50) where "animalId"=current_setting('test.m14.cat')::uuid),0::bigint,'C04 target is outside latest fifty');
select is((select "primaryAlias" from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),'Journey cat','C04 target still opens directly by ID');
reset role;
insert into public.animals(id,primary_alias,visibility) values ('00000000-0000-4000-8000-000000002599','Empty legacy cat','public');
set local role anon;
select is((select "timeBucket" from public.get_public_cat_summary('00000000-0000-4000-8000-000000002599')),null::text,'legacy public profile explicitly has no public activity');
select is((select "primaryAlias" from public.get_public_cat_summary('00000000-0000-4000-8000-000000002599')),'Empty legacy cat','empty activity is not a missing profile');
select is((select count(*) from public.get_public_cat_summary('00000000-0000-4000-8000-000000009999')),0::bigint,'unknown profile is unavailable');
select throws_ok($q$select * from public.animals$q$,'42501',null,'raw animal rows remain denied');
reset role;
update public.animals set archived_at=now() where id='00000000-0000-4000-8000-000000002599';
set local role anon;
select is((select count(*) from public.get_public_cat_summary('00000000-0000-4000-8000-000000002599')),0::bigint,'archived profile is indistinguishable from missing');
reset role;
update public.sightings set visibility='hidden' where id=current_setting('test.m14.sighting')::uuid;
set local role anon;
select is((select count(*) from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),0::bigint,'hidden origin immediately withdraws the new public profile');
reset role;
update public.sightings set visibility='public' where id=current_setting('test.m14.sighting')::uuid;
insert into public.user_blocks(blocker_id,blocked_id) values ('00000000-0000-4000-8000-000000002503','00000000-0000-4000-8000-000000002501');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002503',true);
select is((select count(*) from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),0::bigint,'reader blocking source owner suppresses by-ID summary');
reset role;
update public.user_blocks set blocker_id='00000000-0000-4000-8000-000000002501',blocked_id='00000000-0000-4000-8000-000000002503';
set local role authenticated;
select is((select count(*) from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),0::bigint,'source owner blocking reader also suppresses summary');
reset role;
delete from public.user_blocks where blocker_id='00000000-0000-4000-8000-000000002501';
-- C01: report an existing visible cat, then reject without accidentally linking it.
set local role service_role;
select set_config('test.m14.existing',public.create_sighting_in_public_cell('00000000-0000-4000-8000-000000002503',now(),'8928308280fffff','morning','normal','limited',null,'{}','','m14-existing-report','m14-existing-create')::text,true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002503',true);
select set_config('test.m14.existing_proposal',(select "proposalId"::text from public.submit_identity_proposal(current_setting('test.m14.existing')::uuid,current_setting('test.m14.cat')::uuid,'manual_search','00000000-0000-4000-8000-000000002512')),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002504',true);
select is((select status from public.decide_identity_review_workbench(current_setting('test.m14.existing_proposal')::uuid,'reject','The evidence does not support the proposed match.',null,'00000000-0000-4000-8000-000000002513')),'rejected','C01 reviewer can reject an existing-cat proposal');
reset role;
select is((select animal_id from public.sightings where id=current_setting('test.m14.existing')::uuid),null::uuid,'C01 rejected report stays unlinked');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002503',true);
select set_config('test.m14.existing_retry',(select "proposalId"::text from public.submit_identity_proposal(current_setting('test.m14.existing')::uuid,current_setting('test.m14.cat')::uuid,'manual_search','00000000-0000-4000-8000-000000002514')),true);
reset role;
select is((select animal_id from public.sightings where id=current_setting('test.m14.existing')::uuid),null::uuid,'C01 new candidate still does not link before confirmation');
insert into public.media_assets(id,sighting_id,uploader_id,storage_bucket,storage_path,sha256,redaction_confirmed_at,status,reviewed_at,client_media_id,byte_length,width,height,recipe_version,detector_versions)
values ('00000000-0000-4000-8000-000000002522',current_setting('test.m14.existing')::uuid,'00000000-0000-4000-8000-000000002503',
 'media-staging','jobs/00000000-0000-4000-8000-000000002523.jpg',repeat('a',64),now(),'quarantined',now(),'m14-existing-media',100,64,64,'jpeg-srgb-2048-q88.v1','{"cats":"unavailable","people":"unavailable","plates":"unavailable"}');
insert into private.media_upload_jobs(id,sighting_id,uploader_id,media_id,sha256,byte_length,width,height,recipe_version,detector_versions,confirmed_at_local,object_path,status,reserved_at,reservation_expires_at,next_cleanup_at,finalized_at,media_asset_id)
values ('00000000-0000-4000-8000-000000002523',current_setting('test.m14.existing')::uuid,'00000000-0000-4000-8000-000000002503',
 'm14-existing-media',repeat('a',64),100,64,64,'jpeg-srgb-2048-q88.v1','{"cats":"unavailable","people":"unavailable","plates":"unavailable"}',now(),
 'jobs/00000000-0000-4000-8000-000000002523.jpg','finalized',now(),now()+interval '10 minutes',now()+interval '1 day',now(),'00000000-0000-4000-8000-000000002522');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002504',true);
select is((select status from public.decide_identity_review_workbench(current_setting('test.m14.existing_retry')::uuid,'confirm','Independent source photo supports the existing identity.',null,'00000000-0000-4000-8000-000000002515')),'confirmed','C01 independent workbench confirms the existing cat');
reset role;
select is((select animal_id::text from public.sightings where id=current_setting('test.m14.existing')::uuid),current_setting('test.m14.cat'),'C01 confirmation links the original report to the existing cat');
update public.sightings set visibility='public',visible_at=now() where id=current_setting('test.m14.existing')::uuid;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is((select "timeBucket" from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),'today','C01 eligible confirmed report contributes to the cat activity');
reset role;
update public.animals set visibility='hidden' where id=current_setting('test.m14.cat')::uuid;
set local role anon;
select is((select count(*) from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),0::bigint,'hidden profile is unavailable');
reset role;
update public.animals set visibility='public' where id=current_setting('test.m14.cat')::uuid;
-- Loss of the source must never reclassify the new profile as an empty legacy profile.
delete from public.sightings where id=current_setting('test.m14.sighting')::uuid;
select is((select identity_origin_required from public.animals where id=current_setting('test.m14.cat')::uuid),true,'origin deletion preserves required marker');
select is((select identity_origin_sighting_id from public.animals where id=current_setting('test.m14.cat')::uuid),null::uuid,'origin foreign key clears safely');
set local role anon;
select is((select count(*) from public.get_public_cat_summary(current_setting('test.m14.cat')::uuid)),0::bigint,'deleted origin cannot expose an empty new profile');
select throws_ok($q$select private.is_public_cat_available(current_setting('test.m14.cat')::uuid,null)$q$,'42501',null,'private eligibility cannot be invoked by public callers');
reset role;
select is((select count(*) from public.animals where primary_alias='Journey cat'),1::bigint,'withdrawal never creates a replacement profile');
select * from finish();
rollback;
