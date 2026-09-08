begin;
select plan(46);

select has_function('public', 'identity_has_active_reviewer', array[]::text[],
  'identity reviewer shell capability exists');
select has_function('public', 'list_identity_review_queue', array['integer', 'timestamp with time zone', 'uuid', 'uuid'],
  'bounded reviewer queue exists');
select has_function('public', 'get_identity_review_detail', array['uuid', 'uuid'],
  'reviewer detail exists');
select has_function('public', 'get_my_identity_result', array['uuid'],
  'owner result lookup exists');
select has_function('public', 'service_get_identity_review_media', array['uuid', 'uuid', 'uuid'],
  'service-only media reference lookup exists');
select has_function('public', 'decide_identity_review_workbench', array['uuid', 'text', 'text', 'text', 'uuid'],
  'locked workbench decision RPC exists');

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000002401', 'Proposal Owner', now()),
  ('00000000-0000-4000-8000-000000002402', 'Independent Reviewer', now()),
  ('00000000-0000-4000-8000-000000002403', 'Area Reviewer', now()),
  ('00000000-0000-4000-8000-000000002404', 'Other Area Reviewer', now()),
  ('00000000-0000-4000-8000-000000002405', 'Expired Reviewer', now()),
  ('00000000-0000-4000-8000-000000002406', 'Target Creator', now()),
  ('00000000-0000-4000-8000-000000002407', 'Stranger', now());
set local session_replication_role = origin;

insert into public.role_grants (user_id, role, area_cell_id, provisional_until, revoked_at) values
  ('00000000-0000-4000-8000-000000002402', 'trusted_contributor', null, null, null),
  ('00000000-0000-4000-8000-000000002403', 'area_steward', '8928308280fffff', null, null),
  ('00000000-0000-4000-8000-000000002404', 'area_steward', '8928308284fffff', null, null),
  ('00000000-0000-4000-8000-000000002405', 'trusted_contributor', null, now() - interval '1 hour', null);

insert into public.animals (id, primary_alias, profile_created_by, visibility) values
  ('00000000-0000-4000-8000-000000002410', 'Queue Cat', '00000000-0000-4000-8000-000000002406', 'public');
insert into public.sightings (id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key) values
  ('00000000-0000-4000-8000-000000002420', '00000000-0000-4000-8000-000000002401', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'workbench-2420'),
  ('00000000-0000-4000-8000-000000002421', '00000000-0000-4000-8000-000000002401', now() - interval '1 minute', '8928308284fffff', 'morning', 'normal', 'limited', 'workbench-2421');
insert into public.sightings (id, animal_id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, visible_at, client_dedupe_key) values
  ('00000000-0000-4000-8000-000000002411', '00000000-0000-4000-8000-000000002410', '00000000-0000-4000-8000-000000002406', now() - interval '2 days', '8928308280fffff', 'morning', 'normal', 'public', now() - interval '1 day', 'workbench-2411');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002401', true);
select lives_ok($$select * from public.submit_identity_proposal('00000000-0000-4000-8000-000000002420', '00000000-0000-4000-8000-000000002410', 'manual_search', '00000000-0000-4000-8000-000000002430')$$,
  'owner creates queue proposal');
select lives_ok($$select * from public.submit_identity_proposal('00000000-0000-4000-8000-000000002421', null, 'new_animal', '00000000-0000-4000-8000-000000002431')$$,
  'owner creates second-area proposal');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002402', true);
select is(public.identity_has_active_reviewer(), true, 'global reviewer has workbench capability');
select is((select count(*) from public.list_identity_review_queue(20, null, null, '00000000-0000-4000-8000-000000002440')), 2::bigint,
  'global reviewer sees both non-recused proposals');
select is((select array_agg("proposalId" order by "proposalId") from public.list_identity_review_queue(20, null, null, '00000000-0000-4000-8000-000000002441')),
  (select array_agg(id order by id) from public.identity_proposals where sighting_id in ('00000000-0000-4000-8000-000000002420', '00000000-0000-4000-8000-000000002421')),
  'queue returns only opaque proposal identifiers');
select is((select count(*) from public.get_identity_review_detail((select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002420'), '00000000-0000-4000-8000-000000002442')), 1::bigint,
  'independent reviewer reads a safe detail');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002403', true);
select is((select count(*) from public.list_identity_review_queue(20, null, null, '00000000-0000-4000-8000-000000002443')), 1::bigint,
  'area grant sees exactly its public cell');
select is((select count(*) from public.get_identity_review_detail((select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002421'), '00000000-0000-4000-8000-000000002444')), 0::bigint,
  'area mismatch cannot read a proposal detail');
reset role;
insert into public.role_grants (user_id, role, area_cell_id, provisional_until, revoked_at)
  values ('00000000-0000-4000-8000-000000002401', 'trusted_contributor', null, null, null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002401', true);
select is((select count(*) from public.list_identity_review_queue(20, null, null, '00000000-0000-4000-8000-000000002445')), 0::bigint,
  'proposal owner is excluded from the queue');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002405', true);
select is(public.identity_has_active_reviewer(), false, 'expired reviewer has no workbench capability');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002402', true);
select lives_ok($$select * from public.review_identity_proposal(
  (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002420'),
  'reject', 'Independent evidence does not support this proposed match.', '00000000-0000-4000-8000-000000002446')$$,
  'independent reviewer decides through the existing review RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002401', true);
select is((select "status" from public.get_my_identity_result('00000000-0000-4000-8000-000000002420')), 'rejected',
  'owner sees the reviewed rejection result');
reset role;


-- Exercise the real workbench decision, not just queue metadata.
reset role;
select set_config('test.m13.existing', (select id::text from public.identity_proposals where sighting_id='00000000-0000-4000-8000-000000002420'), true);
select set_config('test.m13.new', (select id::text from public.identity_proposals where sighting_id='00000000-0000-4000-8000-000000002421'), true);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002402',true);
select throws_ok($q$select * from public.decide_identity_review_workbench(current_setting('test.m13.new')::uuid,'confirm','Independent review confirms the observed identity.','M13 Fresh','00000000-0000-4000-8000-000000002450')$q$,
 'P0001','identity_review_material_required','no photo cannot be confirmed by the workbench');
select throws_ok($q$select * from public.decide_identity_review_workbench(current_setting('test.m13.new')::uuid,null,'Independent review confirms the observed identity.','M13 Fresh','00000000-0000-4000-8000-000000002450')$q$,
 '22023','invalid_identity_review','a null decision never means confirm');
select is((select decision from public.decide_identity_review_workbench(current_setting('test.m13.new')::uuid,'needs_more_evidence','A clear source photo is still needed.',null,'00000000-0000-4000-8000-000000002451')),
 'needs_more_evidence','new cats can request more evidence without an alias or photo');
reset role;
select is((select status::text from public.identity_proposals where id=current_setting('test.m13.new')::uuid),'tentative','more evidence leaves the proposal pending');

-- Synthetic finalized media uses exactly the production owner/path/hash binding.
insert into public.media_assets(id,sighting_id,uploader_id,storage_bucket,storage_path,sha256,redaction_confirmed_at,status,reviewed_at,client_media_id,byte_length,width,height,recipe_version,detector_versions)
select ('00000000-0000-4000-8000-'||lpad((2460+n)::text,12,'0'))::uuid,
 ('00000000-0000-4000-8000-'||lpad((2420+n)::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000002401','media-staging',
 'jobs/00000000-0000-4000-8000-'||lpad((2470+n)::text,12,'0')||'.jpg',repeat('a',64),now(),'quarantined',now(),
 'm13-media-'||n,100,64,64,'jpeg-srgb-2048-q88.v1','{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb
from generate_series(0,1) n;
insert into private.media_upload_jobs(id,sighting_id,uploader_id,media_id,sha256,byte_length,width,height,recipe_version,detector_versions,confirmed_at_local,object_path,status,reserved_at,reservation_expires_at,next_cleanup_at,finalized_at,media_asset_id)
select ('00000000-0000-4000-8000-'||lpad((2470+n)::text,12,'0'))::uuid,
 ('00000000-0000-4000-8000-'||lpad((2420+n)::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000002401','m13-media-'||n,repeat('a',64),100,64,64,'jpeg-srgb-2048-q88.v1',
 '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,now(),
 'jobs/00000000-0000-4000-8000-'||lpad((2470+n)::text,12,'0')||'.jpg','finalized',now(),now()+interval '10 minutes',now()+interval '1 day',now(),
 ('00000000-0000-4000-8000-'||lpad((2460+n)::text,12,'0'))::uuid
from generate_series(0,1) n;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002401',true);
select is((select decision from public.get_my_identity_result('00000000-0000-4000-8000-000000002421')),'needs_more_evidence','owner reads a safe request for more evidence');
select is((select "requestId"::text from public.get_my_identity_result('00000000-0000-4000-8000-000000002420')),'00000000-0000-4000-8000-000000002430','owner result binds the rejected proposal to its submission request');
select lives_ok($q$select * from public.submit_identity_proposal('00000000-0000-4000-8000-000000002420','00000000-0000-4000-8000-000000002410','manual_search','00000000-0000-4000-8000-000000002452')$q$,'rejected owner can resubmit against the same report');
reset role;
update public.identity_proposals set created_at=now()-interval '1 minute' where id=current_setting('test.m13.existing')::uuid;
select set_config('test.m13.retry',(select id::text from public.identity_proposals where sighting_id='00000000-0000-4000-8000-000000002420' and status='tentative'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002401',true);
select is((select "requestId"::text from public.get_my_identity_result('00000000-0000-4000-8000-000000002420')),'00000000-0000-4000-8000-000000002452','new pending request supersedes the old rejection in the owner result');
select is((select "animalId" from public.get_my_identity_result('00000000-0000-4000-8000-000000002420')),null::uuid,'a pending candidate is not a confirmed animal reference');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002407',true);
select is((select count(*) from public.get_my_identity_result('00000000-0000-4000-8000-000000002420')),0::bigint,'stranger cannot read owner result or request identifiers');
select throws_ok($q$select * from public.list_identity_review_queue(20,null,null,'00000000-0000-4000-8000-000000002453')$q$,'42501','trusted_identity_reviewer_required','stranger cannot read the queue');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002402',true);
select is((select "evidenceState" from public.get_identity_review_detail(current_setting('test.m13.retry')::uuid,'00000000-0000-4000-8000-000000002454')),'available','a finalized manual photo is reviewable without AI');
select is((select count(*) from public.list_identity_review_queue(1,null,null,'00000000-0000-4000-8000-000000002455')),1::bigint,'queue page size is bounded');
select is((select count(*) from public.list_identity_review_queue(20,now(),greatest(current_setting('test.m13.retry')::uuid,current_setting('test.m13.new')::uuid),'00000000-0000-4000-8000-000000002455')),1::bigint,'cursor excludes the previous row without skipping the second proposal');
select throws_ok($q$select * from public.service_get_identity_review_media('00000000-0000-4000-8000-000000002402',current_setting('test.m13.retry')::uuid,'00000000-0000-4000-8000-000000002456')$q$,'42501',null,'authenticated clients cannot get private storage references');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is((select "byteLength" from public.service_get_identity_review_media('00000000-0000-4000-8000-000000002402',current_setting('test.m13.retry')::uuid,'00000000-0000-4000-8000-000000002456')),100,'trusted server obtains the bound private source');
select throws_ok($q$select * from public.service_get_identity_review_media('00000000-0000-4000-8000-000000002404',current_setting('test.m13.retry')::uuid,'00000000-0000-4000-8000-000000002456')$q$,'42501','identity_reviewer_area_required','another-area reviewer cannot get a private reference');
reset role;
update public.media_assets set deleted_at=now() where id='00000000-0000-4000-8000-000000002460';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002402',true);
select throws_ok($q$select * from public.decide_identity_review_workbench(current_setting('test.m13.retry')::uuid,'confirm','Independent review confirms the observed identity.',null,'00000000-0000-4000-8000-000000002457')$q$,'P0001','identity_review_material_required','deleted material blocks a decision even after a detail was read');
reset role;
select is((select animal_id from public.sightings where id='00000000-0000-4000-8000-000000002420'),null::uuid,'failed confirmation leaves the report unlinked');
update public.media_assets set deleted_at=null where id='00000000-0000-4000-8000-000000002460';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002404',true);
select throws_ok($q$select * from public.decide_identity_review_workbench(current_setting('test.m13.retry')::uuid,'confirm','Independent review confirms the observed identity.',null,'00000000-0000-4000-8000-000000002457')$q$,'42501','identity_reviewer_area_required','another-area reviewer cannot decide');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002402',true);
select is((select status from public.decide_identity_review_workbench(current_setting('test.m13.retry')::uuid,'confirm','Independent review confirms the observed identity.',null,'00000000-0000-4000-8000-000000002457')),'confirmed','workbench confirms an existing-cat association with source material');
select is((select status from public.decide_identity_review_workbench(current_setting('test.m13.retry')::uuid,'confirm','Independent review confirms the observed identity.',null,'00000000-0000-4000-8000-000000002457')),'confirmed','lost existing-cat response replays through the workbench');
select is((select status from public.decide_identity_review_workbench(current_setting('test.m13.new')::uuid,'confirm','Independent review confirms the observed identity.','M13 Fresh','00000000-0000-4000-8000-000000002458')),'confirmed','workbench atomically creates a reviewed new cat');
select is((select status from public.decide_identity_review_workbench(current_setting('test.m13.new')::uuid,'confirm','Independent review confirms the observed identity.','M13 Fresh','00000000-0000-4000-8000-000000002458')),'confirmed','lost new-cat response replays through the workbench');
reset role;
select is((select count(*) from public.animals where primary_alias='M13 Fresh'),1::bigint,'workbench replay creates exactly one profile');
insert into public.sightings(id,reporter_id,occurred_at,public_cell_id,time_bucket,risk,visibility,client_dedupe_key)
values('00000000-0000-4000-8000-000000002490','00000000-0000-4000-8000-000000002401',now(),'8928308280fffff','morning','normal','limited','m13-legacy-marker');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002401',true);
select set_config('test.m13.legacy',(select "proposalId"::text from public.submit_identity_proposal('00000000-0000-4000-8000-000000002490',null,'new_animal','00000000-0000-4000-8000-000000002491')),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002402',true);
select is((select status from public.review_identity_proposal(current_setting('test.m13.legacy')::uuid,'confirm','Independent legacy review without a workbench photo.','00000000-0000-4000-8000-000000002492')),'confirmed','legacy confirmation-only behavior stays compatible');
select throws_ok($q$select * from public.decide_identity_review_workbench(current_setting('test.m13.legacy')::uuid,'confirm','Independent legacy review without a workbench photo.','Must not bypass material','00000000-0000-4000-8000-000000002492')$q$,'P0001','identity_review_material_required','a legacy request is not proof of a previous workbench material check');
reset role;
update public.role_grants set revoked_at=now() where user_id='00000000-0000-4000-8000-000000002402';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002402',true);
select throws_ok($q$select * from public.decide_identity_review_workbench(current_setting('test.m13.new')::uuid,'confirm','Independent review confirms the observed identity.','M13 Fresh','00000000-0000-4000-8000-000000002458')$q$,'42501','trusted_identity_reviewer_required','revoked reviewer cannot replay privileged outcomes');
reset role;

select * from finish();
rollback;
