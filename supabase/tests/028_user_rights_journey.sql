begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','block_sighting_author',array['uuid','uuid'],'C08 block command exists');
select has_function('public','list_public_cat_safety_activity',array['uuid','uuid','integer'],'C08 safe activity projection exists');
select has_function('public','request_user_rights',array['text','uuid','text','uuid'],'rights intake exists');
select has_function('public','request_account_erasure',array['uuid'],'C09 intake exists');
select has_function('public','claim_account_erasure',array['uuid','uuid'],'C09 service claim exists');
select has_function('public','finish_account_erasure',array['uuid','uuid'],'C09 finish exists');
select has_function('public','fail_account_erasure',array['uuid','uuid'],'C09 retryable failure exists');
select ok(not has_table_privilege('authenticated','public.follows','insert,update,delete'),'unrelated raw paths remain denied');
select ok(not has_table_privilege('authenticated','public.user_blocks','insert,update,delete'),'block has no raw write bypass');
select ok(not has_table_privilege('authenticated','public.moderation_reports','insert,update,delete'),'moderation has no raw write bypass');
select ok(not has_table_privilege('authenticated','private.user_rights_requests','select,insert,update,delete'),'rights requests stay private');
select ok(not has_table_privilege('authenticated','private.account_erasure_requests','select,insert,update,delete'),'erasure requests stay private');
select ok(not has_function_privilege('authenticated','public.claim_account_erasure(uuid,uuid)','execute'),'clients cannot claim account erasure');
select ok(has_function_privilege('service_role','public.claim_account_erasure(uuid,uuid)','execute'),'service may claim account erasure');

insert into auth.users(id,email,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000002801','m4-owner@example.invalid',now(),now()),
 ('00000000-0000-4000-8000-000000002802','m4-author@example.invalid',now(),now()),
 ('00000000-0000-4000-8000-000000002803','m4-admin@example.invalid',now(),now()),
 ('00000000-0000-4000-8000-000000002804','m4-stranger@example.invalid',now(),now()),
 ('00000000-0000-4000-8000-000000002805','m4-no-profile@example.invalid',now(),now());
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000002801','M4 owner',now()),
 ('00000000-0000-4000-8000-000000002802','M4 author',now()),
 ('00000000-0000-4000-8000-000000002803','M4 admin',now()),
 ('00000000-0000-4000-8000-000000002804','M4 stranger',now());
insert into public.animals(id,primary_alias,visibility) values('00000000-0000-4000-8000-000000002810','M4 public cat','public');
insert into public.sightings(id,animal_id,reporter_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,client_dedupe_key) values
 ('00000000-0000-4000-8000-000000002811','00000000-0000-4000-8000-000000002810','00000000-0000-4000-8000-000000002802',now()-interval '4 hours','89652636d87ffff','morning','normal','public',now()-interval '3 hours','{}','m4-safety');
set local session_replication_role=origin;
insert into public.media_assets(id,uploader_id,storage_bucket,storage_path,sha256,redaction_confirmed_at) values
 ('00000000-0000-4000-8000-000000002812','00000000-0000-4000-8000-000000002801','private-evidence','00000000-0000-4000-8000-000000002801/m4-erasure.jpg',repeat('e',64),now());
insert into private.media_upload_jobs(id,uploader_id,sighting_id,media_id,sha256,byte_length,width,height,recipe_version,detector_versions,confirmed_at_local,object_path,reserved_at,reservation_expires_at,next_cleanup_at) values
 ('00000000-0000-4000-8000-000000002813','00000000-0000-4000-8000-000000002801','00000000-0000-4000-8000-000000002811','m4-staging',repeat('f',64),128,1,1,'jpeg-srgb-2048-q88.v1','{"cats":"unavailable","people":"unavailable","plates":"unavailable"}',now(),'jobs/00000000-0000-4000-8000-000000002813.jpg',now()-interval '2 hours',now()-interval '110 minutes',now()-interval '100 minutes');
insert into public.role_grants(user_id,role,granted_by) values('00000000-0000-4000-8000-000000002803','platform_admin','00000000-0000-4000-8000-000000002803');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002801',true);
select is((select count(*) from public.list_public_cat_safety_activity('00000000-0000-4000-8000-000000002810',null,20)),1::bigint,'safe activity contains only eligible public sighting');
select is(public.create_moderation_report('sighting','00000000-0000-4000-8000-000000002811','spam',null,'00000000-0000-4000-8000-000000002820'),'00000000-0000-4000-8000-000000002820'::uuid,'C08 owner creates a real moderation report');
reset role;
select set_config('test.m4.report',(select id::text from public.moderation_reports where request_id='00000000-0000-4000-8000-000000002820'),true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002803',true);
select is((select status from public.admin_resolve_moderation_report(current_setting('test.m4.report')::uuid,'no_action','Independent reviewer recorded a safe no-action decision.','00000000-0000-4000-8000-000000002824')),'resolved','C08 independent admin resolves the report');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002801',true);
select is((select status from public.list_my_moderation_status(null,20)),'resolved','owner receives a fixed resolved moderation status');
select is((select blocked from public.block_sighting_author('00000000-0000-4000-8000-000000002811','00000000-0000-4000-8000-000000002821')),true,'C08 owner blocks visible sighting author');
select is((select blocked from public.block_sighting_author('00000000-0000-4000-8000-000000002811','00000000-0000-4000-8000-000000002821')),true,'block lost-response replay is stable after source becomes hidden by block');
select is((select count(*) from public.list_public_cat_safety_activity('00000000-0000-4000-8000-000000002810',null,20)),0::bigint,'blocked author activity disappears from caller projection');
select is((select "requestId" from public.request_user_rights('identity_correction','00000000-0000-4000-8000-000000002810','Please review alias','00000000-0000-4000-8000-000000002822')),'00000000-0000-4000-8000-000000002822'::uuid,'owner receives fixed rights receipt');
select is((select "requestId" from public.request_user_rights('identity_correction','00000000-0000-4000-8000-000000002810','Please review alias','00000000-0000-4000-8000-000000002822')),'00000000-0000-4000-8000-000000002822'::uuid,'rights receipt replays');
select is((select count(*) from public.list_my_rights_requests(null,20)),1::bigint,'owner reads own rights request only');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002804',true);
select is((select count(*) from public.list_my_rights_requests(null,20)),0::bigint,'stranger cannot read owner rights requests');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002803',true);
select is((select "requestId" from public.admin_update_user_rights_request('00000000-0000-4000-8000-000000002822','reviewing','00000000-0000-4000-8000-000000002823')),'00000000-0000-4000-8000-000000002822'::uuid,'active independent platform admin updates intake');
select is((select status from public.admin_update_user_rights_request('00000000-0000-4000-8000-000000002822','reviewing','00000000-0000-4000-8000-000000002823')),'reviewing','admin action replay is stable');
select is((select count(*) from public.admin_list_user_rights_requests(null,20)),1::bigint,'admin queue exposes the narrow rights request');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002801',true);
select is((select "requestId" from public.request_account_erasure('00000000-0000-4000-8000-000000002831')),'00000000-0000-4000-8000-000000002831'::uuid,'C09 owner receives durable erasure receipt');
select is((select "requestId" from public.request_account_erasure('00000000-0000-4000-8000-000000002831')),'00000000-0000-4000-8000-000000002831'::uuid,'erasure intake replays before deletion');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.m4.claim',(select "claimId"::text from public.claim_account_erasure('00000000-0000-4000-8000-000000002831','00000000-0000-4000-8000-000000002803')),true);
select is((select status from public.fail_account_erasure('00000000-0000-4000-8000-000000002831',current_setting('test.m4.claim')::uuid)),'retryable','auth API failure leaves a retryable receipt');
select set_config('test.m4.claim',(select "claimId"::text from public.claim_account_erasure('00000000-0000-4000-8000-000000002831','00000000-0000-4000-8000-000000002803')),true);
select throws_ok($$select * from public.finish_account_erasure('00000000-0000-4000-8000-000000002831','00000000-0000-4000-8000-000000002899')$$,'P0001','invalid_erasure_claim','wrong erasure claim cannot finish');
select throws_ok($$select * from public.finish_account_erasure('00000000-0000-4000-8000-000000002831',current_setting('test.m4.claim')::uuid)$$,'P0001','auth_account_not_deleted','profile FK null alone never proves Auth deletion');
reset role;
-- Simulate the authoritative Auth deletion. Existing profile-erasure triggers must capture cleanup links before ownership nullification.
delete from auth.users where id='00000000-0000-4000-8000-000000002801';
set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002801',true);
select throws_ok($$select * from public.list_my_rights_requests(null,20)$$,'42501','authentication_required','pre-deletion JWT cannot read erasure status after Auth removal');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
reset role;
select is((select count(*) from private.account_erasure_cleanup_links link join private.account_erasure_requests request on request.id=link.erasure_request_id where request.request_id='00000000-0000-4000-8000-000000002831' and link.cleanup_kind='legacy'),1::bigint,'Auth deletion captures the durable legacy media outbox link');
set local role service_role;
select is((select status from public.finish_account_erasure('00000000-0000-4000-8000-000000002831',current_setting('test.m4.claim')::uuid)),'cleanup_pending','pending durable media cleanup prevents false erasure completion');
select is((select count(*) from public.claim_legacy_media_deletion_jobs(50) where media_id='00000000-0000-4000-8000-000000002812'),1::bigint,'service claims the linked legacy cleanup job');
reset role;
select set_config('test.m4.legacy_job',id::text,true),set_config('test.m4.legacy_claim',cleanup_claim_id::text,true) from private.legacy_media_deletion_jobs where media_id='00000000-0000-4000-8000-000000002812';
set local role service_role;
select is(public.complete_legacy_media_deletion_job(current_setting('test.m4.legacy_job')::uuid,'00000000-0000-4000-8000-000000002812','private-evidence','00000000-0000-4000-8000-000000002801/m4-erasure.jpg',current_setting('test.m4.legacy_claim')::uuid,'missing'),'completed','missing object converges the linked legacy cleanup');
select set_config('test.m4.claim',(select "claimId"::text from public.claim_account_erasure('00000000-0000-4000-8000-000000002831','00000000-0000-4000-8000-000000002803')),true);
select is((select status from public.finish_account_erasure('00000000-0000-4000-8000-000000002831',current_setting('test.m4.claim')::uuid)),'cleanup_pending','staging cleanup still blocks completion after legacy cleanup converges');
reset role;
select is((select count(*) from private.account_erasure_cleanup_links link join private.account_erasure_requests request on request.id=link.erasure_request_id where request.request_id='00000000-0000-4000-8000-000000002831' and link.cleanup_kind='staging'),1::bigint,'Auth deletion captures the staging job before uploader nullification');
set local role service_role;
select set_config('test.m4.staging_claim',cleanup_claim_id::text,true) from public.claim_expired_media_staging_jobs(50) where job_id='00000000-0000-4000-8000-000000002813';
select lives_ok($$select public.complete_media_staging_cleanup('00000000-0000-4000-8000-000000002813','jobs/00000000-0000-4000-8000-000000002813.jpg',current_setting('test.m4.staging_claim')::uuid,'remove_and_purge',true)$$,'existing staging cleanup removes the linked expired reservation');
select set_config('test.m4.claim',(select "claimId"::text from public.claim_account_erasure('00000000-0000-4000-8000-000000002831','00000000-0000-4000-8000-000000002803')),true);
select is((select status from public.finish_account_erasure('00000000-0000-4000-8000-000000002831',current_setting('test.m4.claim')::uuid)),'completed','only absent Auth user and converged cleanup mark erasure completed');
reset role;
select is((select count(*) from auth.users where id='00000000-0000-4000-8000-000000002801'),0::bigint,'C09 synthetic Auth account is absent at completion');
reset role;
select is((select target_subject_id from private.account_erasure_requests where request_id='00000000-0000-4000-8000-000000002831'),null::uuid,'completed erasure clears the temporary target subject');
reset role;
-- A signed-in browser can lack a contributor profile. The deletion request still binds to Auth, not to adult/profile creation.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002805',true);
select is((select "requestId" from public.request_account_erasure('00000000-0000-4000-8000-000000002832')),'00000000-0000-4000-8000-000000002832'::uuid,'signed-in account without a profile can request erasure');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.m4.no_profile_claim',(select "claimId"::text from public.claim_account_erasure('00000000-0000-4000-8000-000000002832','00000000-0000-4000-8000-000000002803')),true);
reset role;
delete from auth.users where id='00000000-0000-4000-8000-000000002805';
set local role service_role;
select is((select status from public.finish_account_erasure('00000000-0000-4000-8000-000000002832',current_setting('test.m4.no_profile_claim')::uuid)),'completed','no-profile erasure completes only after the Auth account is gone');
reset role;

select * from finish();
rollback;