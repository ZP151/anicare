begin;
create extension if not exists dblink with schema extensions;
select no_plan();

select is(
  (select p.proargnames
     from pg_proc p
    where p.oid = 'public.server_request_media_deletion(uuid,uuid)'::regprocedure),
  array[
    'p_actor_id', 'p_media_id', 'storage_bucket', 'storage_path',
    'remove_immediately'
  ]::text[],
  'media deletion retains exactly two inputs and the three approved response columns'
);
select is(
  (select array(
     select mode::text
       from unnest(p.proargmodes) with ordinality as modes(mode, ordinal)
      order by ordinal
   )
     from pg_proc p
    where p.oid = 'public.server_request_media_deletion(uuid,uuid)'::regprocedure),
  array['i', 'i', 't', 't', 't']::text[],
  'media deletion retains exact input and table-output modes'
);
select is(
  (select array(
     select pg_catalog.format_type(type_oid, null)
       from unnest(p.proallargtypes) with ordinality as types(type_oid, ordinal)
      order by ordinal
   )
     from pg_proc p
    where p.oid = 'public.server_request_media_deletion(uuid,uuid)'::regprocedure),
  array['uuid', 'uuid', 'text', 'text', 'boolean']::text[],
  'media deletion retains exact input and response types'
);
select ok(
  (select p.prosecdef
      and p.proconfig = array['search_path=pg_catalog']::text[]
     from pg_proc p
    where p.oid = 'public.server_request_media_deletion(uuid,uuid)'::regprocedure),
  'media deletion remains security definer with a fixed pg_catalog search path'
);
with expected(role_name, allowed) as (
  values
    ('public', false),
    ('anon', false),
    ('authenticated', false),
    ('service_role', true)
)
select is(
  has_function_privilege(
    role_name,
    'public.server_request_media_deletion(uuid,uuid)',
    'execute'
  ),
  allowed,
  role_name || ' media deletion execute privilege remains bounded'
)
from expected;

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values
  ('00000000-0000-4000-8000-000000004000', 'Task 2 Media Owner', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004001', 'Task 2 Unrelated Actor', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004002', 'Task 2 Active Admin', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004003', 'Task 2 Revoked Admin', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004004', 'Task 2 Expired Admin', pg_catalog.now());
set local session_replication_role = origin;

insert into public.role_grants (
  id, user_id, role, granted_by, provisional_until, revoked_at,
  verification_method, verification_completed_at
) values
  ('00000000-0000-4000-8000-000000004052',
    '00000000-0000-4000-8000-000000004002', 'platform_admin',
    '00000000-0000-4000-8000-000000004000',
    pg_catalog.now() + interval '1 hour', null, 'task2_active', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004053',
    '00000000-0000-4000-8000-000000004003', 'platform_admin',
    '00000000-0000-4000-8000-000000004000',
    pg_catalog.now() + interval '1 hour', pg_catalog.now(),
    'task2_revoked', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004054',
    '00000000-0000-4000-8000-000000004004', 'platform_admin',
    '00000000-0000-4000-8000-000000004000',
    pg_catalog.now() - interval '1 hour', null,
    'task2_expired', pg_catalog.now());

insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk,
  visibility, client_dedupe_key
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((4100 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000004000',
       pg_catalog.now(), '8928308280fffff', 'morning', 'normal', 'limited',
       'task2-media-invalidation-' || fixture::text
  from generate_series(1, 7) as fixtures(fixture);

insert into public.media_assets (
  id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
  redaction_confirmed_at, training_eligible, client_media_id, byte_length,
  width, height, recipe_version, detector_versions, status, reviewed_at
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((4200 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((4100 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000004000',
       'media-staging',
       'jobs/' || pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((4250 + fixture)::text, 12, '0')
       ) || '.jpg',
       repeat(substr('abcdef01', fixture, 1), 64),
       pg_catalog.now(), true, 'task2-media-0' || fixture::text,
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       'quarantined', pg_catalog.now()
  from generate_series(1, 5) as fixtures(fixture);

insert into public.media_assets (
  id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
  redaction_confirmed_at, training_eligible, status
) values (
  '00000000-0000-4000-8000-000000004206',
  '00000000-0000-4000-8000-000000004106',
  '00000000-0000-4000-8000-000000004000',
  'private-evidence', 'evidence/task2-non-staged.jpg', repeat('0', 64),
  pg_catalog.now(), true, 'quarantined'
);

insert into public.media_assets (
  id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
  redaction_confirmed_at, training_eligible, client_media_id, byte_length,
  width, height, recipe_version, detector_versions, status, reviewed_at
) values (
  '00000000-0000-4000-8000-000000004207',
  '00000000-0000-4000-8000-000000004107',
  '00000000-0000-4000-8000-000000004000',
  'media-staging', 'jobs/00000000-0000-4000-8000-000000004257.jpg',
  repeat('1', 64), pg_catalog.now(), true, 'task2-media-07', 4096, 512, 512,
  'jpeg-srgb-2048-q88.v1',
  '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
  'quarantined', pg_catalog.now()
);

insert into private.media_upload_jobs (
  id, uploader_id, sighting_id, media_id, sha256, byte_length, width, height,
  recipe_version, detector_versions, confirmed_at_local, object_path, status,
  reserved_at, reservation_expires_at, upload_token_expires_at,
  next_cleanup_at, cleanup_claimed_at, cleanup_claim_id, finalized_at,
  media_asset_id
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((4250 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000004000',
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((4100 + fixture)::text, 12, '0')
       )::uuid,
       'task2-media-0' || fixture::text,
       repeat(substr('abcdef01', fixture, 1), 64),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       pg_catalog.now(),
       'jobs/' || pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((4250 + fixture)::text, 12, '0')
       ) || '.jpg',
       'finalized', pg_catalog.now(), pg_catalog.now() + interval '10 minutes',
       pg_catalog.now() + interval '1 hour', 'infinity'::timestamptz,
       case when fixture = 1 then pg_catalog.now() else null end,
       case when fixture = 1
         then '00000000-0000-4000-8000-000000004291'::uuid
         else null
       end,
       pg_catalog.now(),
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((4200 + fixture)::text, 12, '0')
       )::uuid
  from unnest(array[1, 2, 3, 4, 7]) as fixtures(fixture);

insert into public.animals (id, primary_alias, profile_created_by, visibility)
values
  ('00000000-0000-4000-8000-000000004501', 'Task 2 Candidate One',
    '00000000-0000-4000-8000-000000004000', 'limited'),
  ('00000000-0000-4000-8000-000000004502', 'Task 2 Candidate Two',
    '00000000-0000-4000-8000-000000004000', 'limited'),
  ('00000000-0000-4000-8000-000000004503', 'Task 2 Candidate Three',
    '00000000-0000-4000-8000-000000004000', 'limited');

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, notice_version, input_sha256
) values (
  '00000000-0000-4000-8000-000000004301',
  '00000000-0000-4000-8000-000000004101',
  '00000000-0000-4000-8000-000000004201',
  '00000000-0000-4000-8000-000000004000', 'notice.v1', repeat('a', 64)
);

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, lease_id, lease_expires_at, processing_at
) values
  ('00000000-0000-4000-8000-000000004302',
    '00000000-0000-4000-8000-000000004102',
    '00000000-0000-4000-8000-000000004202',
    '00000000-0000-4000-8000-000000004000', 'processing', 'notice.v1',
    repeat('b', 64), 1, '00000000-0000-4000-8000-000000004602',
    pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004303',
    '00000000-0000-4000-8000-000000004103',
    '00000000-0000-4000-8000-000000004203',
    '00000000-0000-4000-8000-000000004000', 'processing', 'notice.v1',
    repeat('c', 64), 1, '00000000-0000-4000-8000-000000004603',
    pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004304',
    '00000000-0000-4000-8000-000000004104',
    '00000000-0000-4000-8000-000000004204',
    '00000000-0000-4000-8000-000000004000', 'processing', 'notice.v1',
    repeat('d', 64), 1, '00000000-0000-4000-8000-000000004604',
    pg_catalog.now() + interval '2 minutes', pg_catalog.now());

select set_config(
  'private.identity_assistance_candidate_writer',
  '00000000-0000-4000-8000-000000004303', true
);
insert into private.identity_assistance_candidates (
  job_id, rank, animal_id, confidence_band, reason_codes
) values
  ('00000000-0000-4000-8000-000000004303', 1,
    '00000000-0000-4000-8000-000000004501', 'likely',
    array['face_pattern_similar']::private.identity_assistance_reason_code[]),
  ('00000000-0000-4000-8000-000000004303', 2,
    '00000000-0000-4000-8000-000000004502', 'possible',
    array['view_angle_limited']::private.identity_assistance_reason_code[]);
select set_config(
  'private.identity_assistance_candidate_writer',
  '00000000-0000-4000-8000-000000004304', true
);
insert into private.identity_assistance_candidates (
  job_id, rank, animal_id, confidence_band, reason_codes
) values (
  '00000000-0000-4000-8000-000000004304', 1,
  '00000000-0000-4000-8000-000000004501', 'likely',
  array['ear_shape_similar']::private.identity_assistance_reason_code[]
);
select set_config('private.identity_assistance_candidate_writer', '', true);

select set_config(
  'private.identity_assistance_job_writer',
  '00000000-0000-4000-8000-000000004303', true
);
update private.identity_assistance_jobs
   set status = 'succeeded', lease_id = null, lease_expires_at = null,
       model_version = 'model.v1',
       callback_contract_version = 'identify-callback.v1',
       new_cat_recommended = false, completed_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000004303';
select set_config(
  'private.identity_assistance_job_writer',
  '00000000-0000-4000-8000-000000004304', true
);
update private.identity_assistance_jobs
   set status = 'succeeded', lease_id = null, lease_expires_at = null,
       model_version = 'model.v1',
       callback_contract_version = 'identify-callback.v1',
       new_cat_recommended = false, completed_at = pg_catalog.now(),
       selected_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000004304';
select set_config('private.identity_assistance_job_writer', '', true);

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, lease_id, lease_expires_at, processing_at
) values (
  '00000000-0000-4000-8000-000000004305',
  '00000000-0000-4000-8000-000000004104',
  '00000000-0000-4000-8000-000000004204',
  '00000000-0000-4000-8000-000000004000', 'processing', 'notice.v1',
  repeat('d', 64), 1, '00000000-0000-4000-8000-000000004605',
  pg_catalog.now() + interval '2 minutes', pg_catalog.now()
);
select set_config(
  'private.identity_assistance_candidate_writer',
  '00000000-0000-4000-8000-000000004305', true
);
insert into private.identity_assistance_candidates (
  job_id, rank, animal_id, confidence_band, reason_codes
) values
  ('00000000-0000-4000-8000-000000004305', 1,
    '00000000-0000-4000-8000-000000004502', 'likely',
    array['coat_marking_similar']::private.identity_assistance_reason_code[]),
  ('00000000-0000-4000-8000-000000004305', 2,
    '00000000-0000-4000-8000-000000004503', 'weak',
    array['image_quality_limited']::private.identity_assistance_reason_code[]);
select set_config('private.identity_assistance_candidate_writer', '', true);
select set_config(
  'private.identity_assistance_job_writer',
  '00000000-0000-4000-8000-000000004305', true
);
update private.identity_assistance_jobs
   set status = 'succeeded', lease_id = null, lease_expires_at = null,
       model_version = 'model.v1',
       callback_contract_version = 'identify-callback.v1',
       new_cat_recommended = true, completed_at = pg_catalog.now(),
       selected_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000004305';
select set_config('private.identity_assistance_job_writer', '', true);

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, failed_at, failure_code
) values (
  '00000000-0000-4000-8000-000000004306',
  '00000000-0000-4000-8000-000000004104',
  '00000000-0000-4000-8000-000000004204',
  '00000000-0000-4000-8000-000000004000', 'failed', 'notice.v1',
  repeat('d', 64), 1, pg_catalog.now(), 'internal_error'
);

insert into public.identity_proposals (
  id, sighting_id, proposed_animal_id, proposer_id, source, status,
  model_version, confidence_band, reasons
) values (
  '00000000-0000-4000-8000-000000004402',
  '00000000-0000-4000-8000-000000004104',
  '00000000-0000-4000-8000-000000004502', null, 'ai_candidate',
  'tentative', 'model.v1', 'likely', '["coat_marking_similar"]'::jsonb
);
update public.identity_proposals
   set status = 'confirmed', reviewed_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000004402';
insert into public.identity_proposals (
  id, sighting_id, proposed_animal_id, proposer_id, source, status,
  model_version, confidence_band, reasons
) values (
  '00000000-0000-4000-8000-000000004401',
  '00000000-0000-4000-8000-000000004104',
  '00000000-0000-4000-8000-000000004501', null, 'ai_candidate',
  'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb
);
insert into public.match_reviews (
  id, proposal_id, reviewer_id, decision, rationale, request_id
) values (
  '00000000-0000-4000-8000-000000004452',
  '00000000-0000-4000-8000-000000004402',
  '00000000-0000-4000-8000-000000004002',
  'confirm', 'Confirmed governance history remains minimized.',
  '00000000-0000-4000-8000-000000004492'
);
insert into private.identity_proposal_evidence (
  proposal_id, job_id, selected_candidate_rank, media_asset_id,
  recipe_version, crop_contract_version, embedding_contract_version,
  identify_contract_version, model_version, callback_contract_version,
  selector_id, selected_at
) values
  ('00000000-0000-4000-8000-000000004401',
    '00000000-0000-4000-8000-000000004304', 1,
    '00000000-0000-4000-8000-000000004204',
    'jpeg-srgb-2048-q88.v1', 'crop.v1', 'embedding.v1', 'identify.v1',
    'model.v1', 'identify-callback.v1',
    '00000000-0000-4000-8000-000000004000', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000004402',
    '00000000-0000-4000-8000-000000004305', 1,
    '00000000-0000-4000-8000-000000004204',
    'jpeg-srgb-2048-q88.v1', 'crop.v1', 'embedding.v1', 'identify.v1',
    'model.v1', 'identify-callback.v1',
    '00000000-0000-4000-8000-000000004000', pg_catalog.now());

select throws_ok(
  $$select * from public.server_request_media_deletion(
      null, '00000000-0000-4000-8000-000000004201'
    )$$,
  '42501', 'authentication_required',
  'media deletion preserves the bounded null-actor error'
);
select throws_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004001',
      '00000000-0000-4000-8000-000000004201'
    )$$,
  '42501', 'media_not_found_or_forbidden',
  'an unrelated actor cannot delete another uploader media'
);
select throws_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004003',
      '00000000-0000-4000-8000-000000004207'
    )$$,
  '42501', 'media_not_found_or_forbidden',
  'a revoked platform admin cannot delete media'
);
select throws_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004004',
      '00000000-0000-4000-8000-000000004207'
    )$$,
  '42501', 'media_not_found_or_forbidden',
  'an expired platform admin cannot delete media'
);

select results_eq(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004000',
      '00000000-0000-4000-8000-000000004201'
    )$$,
  $$values (
      'media-staging'::text,
      'jobs/00000000-0000-4000-8000-000000004251.jpg'::text,
      false
    )$$,
  'the owner receives only the existing staged deletion response'
);
select ok(
  (select status = 'cancelled'
      and media_asset_id is null
      and input_sha256 is null
      and lease_id is null
      and lease_expires_at is null
      and processing_at is null
      and cancelled_at is not null
      and withdrawn_at is not null
      and result_invalidated_at is not null
     from private.identity_assistance_jobs
    where id = '00000000-0000-4000-8000-000000004301'),
  'requested identity work is cancelled and fully source-invalidated'
);
select ok(
  (select status = 'deletion_pending'
      and cleanup_claimed_at is null
      and cleanup_claim_id is null
      and next_cleanup_at = upload_token_expires_at + interval '5 minutes'
     from private.media_upload_jobs
    where id = '00000000-0000-4000-8000-000000004251'),
  'staged deletion clears cleanup claims and preserves the safe replay window'
);

select results_eq(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004002',
      '00000000-0000-4000-8000-000000004202'
    )$$,
  $$values (
      'media-staging'::text,
      'jobs/00000000-0000-4000-8000-000000004252.jpg'::text,
      false
    )$$,
  'an active platform admin may request staged media deletion'
);
select ok(
  (select status = 'cancelled'
      and media_asset_id is null
      and input_sha256 is null
      and lease_id is null
      and lease_expires_at is null
      and processing_at is null
      and cancelled_at is not null
      and withdrawn_at is not null
      and result_invalidated_at is not null
     from private.identity_assistance_jobs
    where id = '00000000-0000-4000-8000-000000004302'),
  'processing identity work is cancelled and its former lease is cleared'
);
select set_config(
  'private.identity_assistance_job_writer',
  '00000000-0000-4000-8000-000000004302', true
);
select throws_ok(
  $$update private.identity_assistance_jobs
       set status = 'succeeded', model_version = 'stale-worker.v1',
           callback_contract_version = 'identify-callback.v1',
           new_cat_recommended = false, completed_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000004302'$$,
  '42501', 'identity_assistance_job_transition_forbidden',
  'a stale former processing lease cannot complete after media deletion'
);
select set_config('private.identity_assistance_job_writer', '', true);

select results_eq(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004000',
      '00000000-0000-4000-8000-000000004203'
    )$$,
  $$values (
      'media-staging'::text,
      'jobs/00000000-0000-4000-8000-000000004253.jpg'::text,
      false
    )$$,
  'successful-unselected source deletion retains the existing response'
);
select ok(
  (select status = 'cancelled'
      and media_asset_id is null
      and input_sha256 is null
      and completed_at is not null
      and model_version = 'model.v1'
      and callback_contract_version = 'identify-callback.v1'
      and new_cat_recommended is false
      and cancelled_at is not null
      and withdrawn_at is not null
      and result_invalidated_at is not null
     from private.identity_assistance_jobs
    where id = '00000000-0000-4000-8000-000000004303'),
  'successful-unselected work becomes permanently non-actionable without losing completion facts'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_candidates
    where job_id = '00000000-0000-4000-8000-000000004303'),
  0::bigint,
  'media deletion purges the successful job entire candidate set'
);

select results_eq(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004000',
      '00000000-0000-4000-8000-000000004204'
    )$$,
  $$values (
      'media-staging'::text,
      'jobs/00000000-0000-4000-8000-000000004254.jpg'::text,
      false
    )$$,
  'selected-result source deletion retains the existing response'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_candidates
    where job_id in (
      '00000000-0000-4000-8000-000000004304',
      '00000000-0000-4000-8000-000000004305'
    )),
  0::bigint,
  'selected-result deletion purges every candidate from every affected job'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs
    where id in (
      '00000000-0000-4000-8000-000000004304',
      '00000000-0000-4000-8000-000000004305'
    )
      and status = 'succeeded'
      and selected_at is not null
      and completed_at is not null
      and model_version = 'model.v1'
      and callback_contract_version = 'identify-callback.v1'
      and media_asset_id is null
      and input_sha256 is null
      and withdrawn_at is not null
      and result_invalidated_at is not null),
  2::bigint,
  'selected successes preserve selection and completion provenance while losing source bindings'
);
select ok(
  (select status = 'failed'
      and failure_code = 'internal_error'
      and failed_at is not null
      and media_asset_id is null
      and input_sha256 is null
      and withdrawn_at is not null
      and result_invalidated_at is not null
     from private.identity_assistance_jobs
    where id = '00000000-0000-4000-8000-000000004306'),
  'other terminal work retains legal terminal facts while source bindings are cleared'
);
select ok(
  not exists (
    select 1 from public.identity_proposals
     where id = '00000000-0000-4000-8000-000000004401'
  )
  and not exists (
    select 1 from private.identity_proposal_evidence
     where proposal_id = '00000000-0000-4000-8000-000000004401'
  ),
  'tentative evidence-backed AI work is withdrawn by deleting proposal and evidence'
);
select is(
  (select pg_catalog.count(*) from public.match_reviews
    where proposal_id in (
      '00000000-0000-4000-8000-000000004401',
      '00000000-0000-4000-8000-000000004402'
    )),
  1::bigint,
  'source invalidation creates no false rejection review and preserves prior governance review'
);
select ok(
  exists (
    select 1
      from public.identity_proposals proposals
      join private.identity_proposal_evidence evidence
        on evidence.proposal_id = proposals.id
     where proposals.id = '00000000-0000-4000-8000-000000004402'
       and proposals.status = 'confirmed'
       and evidence.media_asset_id is null
       and evidence.selector_id is null
  ),
  'retained non-tentative evidence loses media and selector references before tombstoning'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events
    where job_id in (
      '00000000-0000-4000-8000-000000004301',
      '00000000-0000-4000-8000-000000004302',
      '00000000-0000-4000-8000-000000004303',
      '00000000-0000-4000-8000-000000004304',
      '00000000-0000-4000-8000-000000004305',
      '00000000-0000-4000-8000-000000004306'
    )
      and event_type = 'invalidated'
      and failure_code = 'source_invalidated'
      and reason_code = 'source_invalidated'
      and actor_id is null
      and request_id is null),
  6::bigint,
  'each newly affected job receives exactly one minimized source-invalidated event'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs
    where id in (
      '00000000-0000-4000-8000-000000004301',
      '00000000-0000-4000-8000-000000004302',
      '00000000-0000-4000-8000-000000004303',
      '00000000-0000-4000-8000-000000004304',
      '00000000-0000-4000-8000-000000004305',
      '00000000-0000-4000-8000-000000004306'
    ) and requester_id = '00000000-0000-4000-8000-000000004000'),
  6::bigint,
  'media invalidation does not erase the requester identity by itself'
);

create temporary table task2_media_retry_snapshot on commit drop as
select
  (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(jobs) order by jobs.id)
     from private.identity_assistance_jobs jobs
    where jobs.id in (
      '00000000-0000-4000-8000-000000004304',
      '00000000-0000-4000-8000-000000004305',
      '00000000-0000-4000-8000-000000004306'
    )) as job_rows,
  (select pg_catalog.count(*) from private.identity_assistance_candidates
    where job_id in (
      '00000000-0000-4000-8000-000000004304',
      '00000000-0000-4000-8000-000000004305',
      '00000000-0000-4000-8000-000000004306'
    )) as candidate_count,
  (select pg_catalog.count(*) from public.identity_proposals
    where id in (
      '00000000-0000-4000-8000-000000004401',
      '00000000-0000-4000-8000-000000004402'
    )) as proposal_count,
  (select pg_catalog.count(*) from private.identity_proposal_evidence
    where proposal_id in (
      '00000000-0000-4000-8000-000000004401',
      '00000000-0000-4000-8000-000000004402'
    )) as evidence_count,
  (select pg_catalog.count(*) from public.match_reviews
    where proposal_id in (
      '00000000-0000-4000-8000-000000004401',
      '00000000-0000-4000-8000-000000004402'
    )) as review_count,
  (select pg_catalog.count(*) from private.identity_assistance_events
    where job_id in (
      '00000000-0000-4000-8000-000000004304',
      '00000000-0000-4000-8000-000000004305',
      '00000000-0000-4000-8000-000000004306'
    )) as event_count;
select throws_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004000',
      '00000000-0000-4000-8000-000000004204'
    )$$,
  'P0001', 'media_deleted',
  'an exact media deletion retry retains the bounded tombstone error'
);
select ok(
  (select snapshot.job_rows = (
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(jobs) order by jobs.id)
        from private.identity_assistance_jobs jobs
       where jobs.id in (
         '00000000-0000-4000-8000-000000004304',
         '00000000-0000-4000-8000-000000004305',
         '00000000-0000-4000-8000-000000004306'
       )
    )
    and snapshot.candidate_count = (
      select pg_catalog.count(*) from private.identity_assistance_candidates
       where job_id in (
         '00000000-0000-4000-8000-000000004304',
         '00000000-0000-4000-8000-000000004305',
         '00000000-0000-4000-8000-000000004306'
       )
    )
    and snapshot.proposal_count = (
      select pg_catalog.count(*) from public.identity_proposals
       where id in (
         '00000000-0000-4000-8000-000000004401',
         '00000000-0000-4000-8000-000000004402'
       )
    )
    and snapshot.evidence_count = (
      select pg_catalog.count(*) from private.identity_proposal_evidence
       where proposal_id in (
         '00000000-0000-4000-8000-000000004401',
         '00000000-0000-4000-8000-000000004402'
       )
    )
    and snapshot.review_count = (
      select pg_catalog.count(*) from public.match_reviews
       where proposal_id in (
         '00000000-0000-4000-8000-000000004401',
         '00000000-0000-4000-8000-000000004402'
       )
    )
    and snapshot.event_count = (
      select pg_catalog.count(*) from private.identity_assistance_events
       where job_id in (
         '00000000-0000-4000-8000-000000004304',
         '00000000-0000-4000-8000-000000004305',
         '00000000-0000-4000-8000-000000004306'
       )
    )
   from task2_media_retry_snapshot snapshot),
  'exact deletion retry changes no timestamps or row counts and recreates no state'
);

select results_eq(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004000',
      '00000000-0000-4000-8000-000000004206'
    )$$,
  $$values (
      'private-evidence'::text,
      'evidence/task2-non-staged.jpg'::text,
      true
    )$$,
  'non-staged deletion still requests immediate physical removal'
);
select throws_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004000',
      '00000000-0000-4000-8000-000000004205'
    )$$,
  'P0001', 'media_deletion_unavailable',
  'staged deletion retains the bounded unavailable error without a finalized upload job'
);
select results_eq(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000004000',
      '00000000-0000-4000-8000-000000004207'
    )$$,
  $$values (
      'media-staging'::text,
      'jobs/00000000-0000-4000-8000-000000004257.jpg'::text,
      false
    )$$,
  'the owner remains authorized after revoked and expired admin denials'
);

select lives_ok(
  $orchestrator$
  do $main$
  declare
    delete_pid integer;
    revoke_pid integer;
    wait_deadline timestamptz;
    deletion_blocked_by_revoke boolean := false;
    deletion_error text;
    local_connection text :=
      'host=' || pg_catalog.host(pg_catalog.inet_server_addr())
      || ' port=' || pg_catalog.current_setting('port')
      || ' dbname=' || pg_catalog.current_database()
      || ' user=' || session_user
      || ' password=' || session_user;
  begin
    perform extensions.dblink_connect(
      'task2_media_setup',
      local_connection || ' application_name=task2_media_setup'
    );
    perform extensions.dblink_exec(
      'task2_media_setup', 'set session_replication_role = replica'
    );
    perform extensions.dblink_exec(
      'task2_media_setup',
      $remote$
        insert into public.user_profiles (id, public_name, adult_confirmed_at)
        values
          ('00000000-0000-4000-8000-000000005000',
            'Task 2 Race Owner', pg_catalog.now()),
          ('00000000-0000-4000-8000-000000005001',
            'Task 2 Race Admin', pg_catalog.now());
      $remote$
    );
    perform extensions.dblink_exec(
      'task2_media_setup', 'set session_replication_role = origin'
    );
    perform extensions.dblink_exec(
      'task2_media_setup',
      $remote$
        insert into public.role_grants (
          id, user_id, role, granted_by, provisional_until,
          verification_method, verification_completed_at
        ) values (
          '00000000-0000-4000-8000-000000005010',
          '00000000-0000-4000-8000-000000005001', 'platform_admin',
          '00000000-0000-4000-8000-000000005000',
          pg_catalog.now() + interval '1 hour', 'task2_race', pg_catalog.now()
        );
        insert into public.sightings (
          id, reporter_id, occurred_at, public_cell_id, time_bucket, risk,
          visibility, client_dedupe_key
        ) values (
          '00000000-0000-4000-8000-000000005020',
          '00000000-0000-4000-8000-000000005000', pg_catalog.now(),
          '8928308280fffff', 'morning', 'normal', 'limited',
          'task2-media-delete-role-race'
        );
        insert into public.media_assets (
          id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
          redaction_confirmed_at, training_eligible, client_media_id,
          byte_length, width, height, recipe_version, detector_versions,
          status, reviewed_at
        ) values (
          '00000000-0000-4000-8000-000000005030',
          '00000000-0000-4000-8000-000000005020',
          '00000000-0000-4000-8000-000000005000', 'media-staging',
          'jobs/00000000-0000-4000-8000-000000005040.jpg', repeat('a', 64),
          pg_catalog.now(), false, 'task2-race-media', 4096, 512, 512,
          'jpeg-srgb-2048-q88.v1',
          '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
          'quarantined', pg_catalog.now()
        );
        insert into private.media_upload_jobs (
          id, uploader_id, sighting_id, media_id, sha256, byte_length, width,
          height, recipe_version, detector_versions, confirmed_at_local,
          object_path, status, reserved_at, reservation_expires_at,
          upload_token_expires_at, next_cleanup_at, finalized_at, media_asset_id
        ) values (
          '00000000-0000-4000-8000-000000005040',
          '00000000-0000-4000-8000-000000005000',
          '00000000-0000-4000-8000-000000005020', 'task2-race-media',
          repeat('a', 64), 4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
          '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
          pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000005040.jpg',
          'finalized', pg_catalog.now(), pg_catalog.now() + interval '10 minutes',
          pg_catalog.now() + interval '1 hour', 'infinity'::timestamptz,
          pg_catalog.now(), '00000000-0000-4000-8000-000000005030'
        );
      $remote$
    );

    perform extensions.dblink_connect(
      'task2_media_revoke',
      local_connection || ' application_name=task2_media_revoke'
    );
    perform extensions.dblink_connect(
      'task2_media_delete',
      local_connection || ' application_name=task2_media_delete'
    );
    perform extensions.dblink_exec(
      'task2_media_revoke', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec(
      'task2_media_delete', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec('task2_media_revoke', 'begin');
    perform extensions.dblink_exec(
      'task2_media_revoke',
      $remote$
        update public.role_grants
           set revoked_at = pg_catalog.clock_timestamp()
         where id = '00000000-0000-4000-8000-000000005010';
      $remote$
    );
    select remote_pid into revoke_pid
      from extensions.dblink(
        'task2_media_revoke', 'select pg_catalog.pg_backend_pid()'
      ) as backend(remote_pid integer);
    select remote_pid into delete_pid
      from extensions.dblink(
        'task2_media_delete', 'select pg_catalog.pg_backend_pid()'
      ) as backend(remote_pid integer);

    perform extensions.dblink_send_query(
      'task2_media_delete',
      $remote$
        select storage_bucket, storage_path, remove_immediately
          from public.server_request_media_deletion(
            '00000000-0000-4000-8000-000000005001',
            '00000000-0000-4000-8000-000000005030'
          );
      $remote$
    );
    wait_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
    loop
      if revoke_pid = any(pg_catalog.pg_blocking_pids(delete_pid)) then
        deletion_blocked_by_revoke := true;
        exit;
      end if;
      exit when extensions.dblink_is_busy('task2_media_delete') = 0;
      if pg_catalog.clock_timestamp() >= wait_deadline then
        raise exception 'media_delete_role_lock_observation_timeout';
      end if;
      perform pg_catalog.pg_sleep(0.01);
    end loop;

    perform extensions.dblink_exec('task2_media_revoke', 'commit');
    wait_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
    while extensions.dblink_is_busy('task2_media_delete') = 1 loop
      if pg_catalog.clock_timestamp() >= wait_deadline then
        raise exception 'media_delete_role_revalidation_timeout';
      end if;
      perform pg_catalog.pg_sleep(0.01);
    end loop;
    perform *
      from extensions.dblink_get_result('task2_media_delete', false)
        as deletion_result(
          storage_bucket text, storage_path text, remove_immediately boolean
        );
    deletion_error := extensions.dblink_error_message('task2_media_delete');
    perform extensions.dblink_disconnect('task2_media_revoke');
    perform extensions.dblink_disconnect('task2_media_delete');

    perform extensions.dblink_exec(
      'task2_media_setup', 'set session_replication_role = replica'
    );
    perform extensions.dblink_exec(
      'task2_media_setup',
      $remote$
        delete from private.media_upload_jobs
         where id = '00000000-0000-4000-8000-000000005040';
        delete from public.media_assets
         where id = '00000000-0000-4000-8000-000000005030';
        delete from public.sightings
         where id = '00000000-0000-4000-8000-000000005020';
        delete from public.role_grants
         where id = '00000000-0000-4000-8000-000000005010';
        delete from public.user_profiles
         where id in (
           '00000000-0000-4000-8000-000000005000',
           '00000000-0000-4000-8000-000000005001'
         );
      $remote$
    );
    perform extensions.dblink_disconnect('task2_media_setup');

    if not deletion_blocked_by_revoke then
      raise exception 'media_deletion_did_not_wait_for_role_revalidation';
    end if;
    if deletion_error not like '%media_not_found_or_forbidden%' then
      raise exception 'media_deletion_did_not_revalidate_revoked_admin';
    end if;
  end
  $main$;
  $orchestrator$,
  'media deletion serializes on the admin grant and revalidates authorization after waiting'
);

select * from finish();
rollback;
