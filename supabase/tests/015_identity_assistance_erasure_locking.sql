begin;
create extension if not exists dblink with schema extensions;
select no_plan();

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values
  ('00000000-0000-4000-8000-000000006000', 'Task 3 Erasure Actor', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006001', 'Task 3 Reviewer', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006002', 'Task 3 Animal Creator', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006003', 'Task 3 Source Owner', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006004', 'Task 3 Selector', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006005', 'Task 3 Exception Actor', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006006', 'Task 3 Replay Reviewer', pg_catalog.now());
set local session_replication_role = origin;

insert into public.role_grants (
  id, user_id, role, granted_by, provisional_until, revoked_at,
  verification_method, verification_completed_at
) values
  ('00000000-0000-4000-8000-000000006050',
    '00000000-0000-4000-8000-000000006000', 'trusted_contributor',
    '00000000-0000-4000-8000-000000006002', null, null,
    'task3_erasure', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006051',
    '00000000-0000-4000-8000-000000006001', 'platform_admin',
    '00000000-0000-4000-8000-000000006002', null, null,
    'task3_review', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006054',
    '00000000-0000-4000-8000-000000006004', 'trusted_contributor',
    '00000000-0000-4000-8000-000000006002', null, null,
    'task3_selector', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000006056',
    '00000000-0000-4000-8000-000000006006', 'area_steward',
    '00000000-0000-4000-8000-000000006002', null, null,
    'task3_replay', pg_catalog.now());

insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk,
  visibility, client_dedupe_key
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6100 + fixture)::text, 12, '0')
       )::uuid,
       case when fixture <= 9
         then '00000000-0000-4000-8000-000000006000'::uuid
         else '00000000-0000-4000-8000-000000006003'::uuid
       end,
       pg_catalog.now(), '8928308280fffff', 'morning', 'normal', 'limited',
       'task3-identity-source-' || fixture::text
  from generate_series(1, 15) as fixtures(fixture);

insert into public.media_assets (
  id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
  redaction_confirmed_at, training_eligible, client_media_id, byte_length,
  width, height, recipe_version, detector_versions, status, reviewed_at
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6200 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6100 + fixture)::text, 12, '0')
       )::uuid,
       case when fixture <= 7
         then '00000000-0000-4000-8000-000000006000'::uuid
         else '00000000-0000-4000-8000-000000006003'::uuid
       end,
       'media-staging',
       'jobs/' || pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6250 + fixture)::text, 12, '0')
       ) || '.jpg',
       repeat(substr('123456789abcdef', fixture, 1), 64),
       pg_catalog.now(), false, 'task3-media-' || lpad(fixture::text, 2, '0'),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       'quarantined', pg_catalog.now()
  from unnest(array[1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14])
    as fixtures(fixture);

insert into private.media_upload_jobs (
  id, uploader_id, sighting_id, media_id, sha256, byte_length, width, height,
  recipe_version, detector_versions, confirmed_at_local, object_path, status,
  reserved_at, reservation_expires_at, upload_token_expires_at,
  next_cleanup_at, finalized_at, media_asset_id
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6250 + fixture)::text, 12, '0')
       )::uuid,
       case when fixture <= 7
         then '00000000-0000-4000-8000-000000006000'::uuid
         else '00000000-0000-4000-8000-000000006003'::uuid
       end,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6100 + fixture)::text, 12, '0')
       )::uuid,
       'task3-media-' || lpad(fixture::text, 2, '0'),
       repeat(substr('123456789abcdef', fixture, 1), 64),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       pg_catalog.now(),
       'jobs/' || pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6250 + fixture)::text, 12, '0')
       ) || '.jpg',
       'finalized', pg_catalog.now(), pg_catalog.now() + interval '10 minutes',
       pg_catalog.now() + interval '1 hour', 'infinity'::timestamptz,
       pg_catalog.now(),
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6200 + fixture)::text, 12, '0')
       )::uuid
  from unnest(array[1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14])
    as fixtures(fixture);

insert into public.animals (id, primary_alias, profile_created_by, visibility)
values
  ('00000000-0000-4000-8000-000000006501', 'Task 3 Stable Candidate',
    '00000000-0000-4000-8000-000000006002', 'limited'),
  ('00000000-0000-4000-8000-000000006502', 'Task 3 Hidden Candidate',
    '00000000-0000-4000-8000-000000006002', 'limited'),
  ('00000000-0000-4000-8000-000000006503', 'Task 3 Archived Candidate',
    '00000000-0000-4000-8000-000000006002', 'limited'),
  ('00000000-0000-4000-8000-000000006504', 'Task 3 Deleted Candidate',
    '00000000-0000-4000-8000-000000006002', 'limited'),
  ('00000000-0000-4000-8000-000000006505', 'Task 3 Media Candidate',
    '00000000-0000-4000-8000-000000006002', 'limited');

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, notice_version, input_sha256
) values (
  '00000000-0000-4000-8000-000000006301',
  '00000000-0000-4000-8000-000000006101',
  '00000000-0000-4000-8000-000000006201',
  '00000000-0000-4000-8000-000000006000', 'notice.v1', repeat('1', 64)
);

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, lease_id, lease_expires_at, processing_at
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6300 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6100 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6200 + fixture)::text, 12, '0')
       )::uuid,
       case when fixture <= 7
         then '00000000-0000-4000-8000-000000006000'::uuid
         else '00000000-0000-4000-8000-000000006003'::uuid
       end,
       'processing', 'notice.v1',
       repeat(substr('123456789abcdef', fixture, 1), 64), 1,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6600 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.now() + interval '2 minutes', pg_catalog.now()
  from unnest(array[2, 3, 4, 5, 7, 10, 11, 12, 13, 14])
    as fixtures(fixture);

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, failed_at, failure_code
) values (
  '00000000-0000-4000-8000-000000006306',
  '00000000-0000-4000-8000-000000006106',
  '00000000-0000-4000-8000-000000006206',
  '00000000-0000-4000-8000-000000006000', 'failed', 'notice.v1',
  repeat('6', 64), 1, pg_catalog.now(), 'internal_error'
);

do $fixture$
declare
  fixture integer;
  job_id uuid;
  animal_id uuid;
begin
  foreach fixture in array array[3, 4, 5, 7, 10, 11, 12, 13, 14]
  loop
    job_id := pg_catalog.format(
      '00000000-0000-4000-8000-%s', lpad((6300 + fixture)::text, 12, '0')
    )::uuid;
    animal_id := case fixture
      when 11 then '00000000-0000-4000-8000-000000006502'::uuid
      when 12 then '00000000-0000-4000-8000-000000006503'::uuid
      when 13 then '00000000-0000-4000-8000-000000006504'::uuid
      when 14 then '00000000-0000-4000-8000-000000006505'::uuid
      else '00000000-0000-4000-8000-000000006501'::uuid
    end;
    perform pg_catalog.set_config(
      'private.identity_assistance_candidate_writer', job_id::text, true
    );
    insert into private.identity_assistance_candidates (
      job_id, rank, animal_id, confidence_band, reason_codes
    ) values (
      job_id, 1, animal_id, 'likely',
      array['face_pattern_similar']::private.identity_assistance_reason_code[]
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer', job_id::text, true
    );
    update private.identity_assistance_jobs
       set status = 'succeeded', lease_id = null, lease_expires_at = null,
           model_version = 'model.v1',
           callback_contract_version = 'identify-callback.v1',
           new_cat_recommended = false, completed_at = pg_catalog.now(),
           selected_at = case when fixture = 3 then null else pg_catalog.now() end
     where id = job_id;
  end loop;
  perform pg_catalog.set_config('private.identity_assistance_candidate_writer', '', true);
  perform pg_catalog.set_config('private.identity_assistance_job_writer', '', true);
end;
$fixture$;

insert into public.identity_proposals (
  id, sighting_id, proposed_animal_id, proposer_id, source, status,
  model_version, confidence_band, reasons
) values
  ('00000000-0000-4000-8000-000000006404',
    '00000000-0000-4000-8000-000000006104',
    '00000000-0000-4000-8000-000000006501', null, 'ai_candidate',
    'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb),
  ('00000000-0000-4000-8000-000000006405',
    '00000000-0000-4000-8000-000000006105',
    '00000000-0000-4000-8000-000000006501', null, 'ai_candidate',
    'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb),
  ('00000000-0000-4000-8000-000000006407',
    '00000000-0000-4000-8000-000000006107',
    '00000000-0000-4000-8000-000000006501', null, 'ai_candidate',
    'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb),
  ('00000000-0000-4000-8000-000000006408',
    '00000000-0000-4000-8000-000000006108',
    '00000000-0000-4000-8000-000000006501',
    '00000000-0000-4000-8000-000000006000', 'manual_search',
    'tentative', null, null, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000006409',
    '00000000-0000-4000-8000-000000006109',
    '00000000-0000-4000-8000-000000006501',
    '00000000-0000-4000-8000-000000006000', 'manual_search',
    'tentative', null, null, '[]'::jsonb),
  ('00000000-0000-4000-8000-000000006410',
    '00000000-0000-4000-8000-000000006110',
    '00000000-0000-4000-8000-000000006501', null, 'ai_candidate',
    'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb),
  ('00000000-0000-4000-8000-000000006411',
    '00000000-0000-4000-8000-000000006111',
    '00000000-0000-4000-8000-000000006502', null, 'ai_candidate',
    'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb),
  ('00000000-0000-4000-8000-000000006412',
    '00000000-0000-4000-8000-000000006112',
    '00000000-0000-4000-8000-000000006503', null, 'ai_candidate',
    'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb),
  ('00000000-0000-4000-8000-000000006413',
    '00000000-0000-4000-8000-000000006113',
    '00000000-0000-4000-8000-000000006504', null, 'ai_candidate',
    'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb),
  ('00000000-0000-4000-8000-000000006414',
    '00000000-0000-4000-8000-000000006114',
    '00000000-0000-4000-8000-000000006505', null, 'ai_candidate',
    'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb),
  ('00000000-0000-4000-8000-000000006415',
    '00000000-0000-4000-8000-000000006115',
    '00000000-0000-4000-8000-000000006501',
    '00000000-0000-4000-8000-000000006003', 'manual_search',
    'tentative', null, null, '[]'::jsonb);

update public.identity_proposals
   set status = 'confirmed', reviewed_at = pg_catalog.now()
 where id in (
   '00000000-0000-4000-8000-000000006405',
   '00000000-0000-4000-8000-000000006409'
 );
update public.identity_proposals
   set status = 'rejected', reviewed_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000006407';

insert into public.match_reviews (
  id, proposal_id, reviewer_id, decision, rationale, request_id
) values
  ('00000000-0000-4000-8000-000000006454',
    '00000000-0000-4000-8000-000000006404',
    '00000000-0000-4000-8000-000000006001', 'needs_more_evidence',
    'A second clear angle is still required.',
    '00000000-0000-4000-8000-000000006464'),
  ('00000000-0000-4000-8000-000000006455',
    '00000000-0000-4000-8000-000000006405',
    '00000000-0000-4000-8000-000000006000', 'confirm',
    'Confirmed decision integrity must survive erasure.',
    '00000000-0000-4000-8000-000000006465'),
  ('00000000-0000-4000-8000-000000006457',
    '00000000-0000-4000-8000-000000006407',
    '00000000-0000-4000-8000-000000006001', 'reject',
    'Rejected decision integrity must survive erasure.',
    '00000000-0000-4000-8000-000000006467'),
  ('00000000-0000-4000-8000-000000006459',
    '00000000-0000-4000-8000-000000006409',
    '00000000-0000-4000-8000-000000006001', 'confirm',
    'Confirmed manual history must remain deidentified.',
    '00000000-0000-4000-8000-000000006469');

insert into private.identity_proposal_evidence (
  proposal_id, job_id, selected_candidate_rank, media_asset_id,
  recipe_version, crop_contract_version, embedding_contract_version,
  identify_contract_version, model_version, callback_contract_version,
  selector_id, selected_at
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6400 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6300 + fixture)::text, 12, '0')
       )::uuid,
       1,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((6200 + fixture)::text, 12, '0')
       )::uuid,
       'jpeg-srgb-2048-q88.v1', 'crop.v1', 'embedding.v1', 'identify.v1',
       'model.v1', 'identify-callback.v1',
       case
         when fixture in (4, 5, 7)
           then '00000000-0000-4000-8000-000000006000'::uuid
         when fixture = 10
           then '00000000-0000-4000-8000-000000006004'::uuid
         else '00000000-0000-4000-8000-000000006003'::uuid
       end,
       (select selected_at from private.identity_assistance_jobs
         where id = pg_catalog.format(
           '00000000-0000-4000-8000-%s', lpad((6300 + fixture)::text, 12, '0')
         )::uuid)
  from unnest(array[4, 5, 7, 10, 11, 12, 13, 14]) as fixtures(fixture);

insert into private.identity_assistance_requests (
  actor_id, request_id, payload_sha256, operation, job_id, proposal_id
) values (
  '00000000-0000-4000-8000-000000006000',
  '00000000-0000-4000-8000-000000006471', repeat('a', 64), 'request',
  '00000000-0000-4000-8000-000000006301', null
);
insert into private.identity_assistance_status_reads (
  actor_id, job_id, accessed_on, first_accessed_at, last_accessed_at,
  access_count
) values (
  '00000000-0000-4000-8000-000000006000',
  '00000000-0000-4000-8000-000000006301', current_date,
  pg_catalog.now(), pg_catalog.now(), 1
);
insert into private.identity_requests (
  actor_id, request_id, operation, payload_hash, proposal_id, review_id
) values
  ('00000000-0000-4000-8000-000000006000',
    '00000000-0000-4000-8000-000000006481', 'submit', repeat('b', 64),
    '00000000-0000-4000-8000-000000006409', null),
  ('00000000-0000-4000-8000-000000006000',
    '00000000-0000-4000-8000-000000006482', 'review', repeat('c', 64),
    '00000000-0000-4000-8000-000000006405',
    '00000000-0000-4000-8000-000000006455');
insert into private.identity_assistance_events (
  job_id, actor_id, request_id, event_type, occurred_at
) values (
  '00000000-0000-4000-8000-000000006301',
  '00000000-0000-4000-8000-000000006000',
  '00000000-0000-4000-8000-000000006471', 'requested', pg_catalog.now()
);

insert into public.moderation_reports (
  id, content_type, reason, risk, status, due_at
) values (
  '00000000-0000-4000-8000-000000006600',
  'sighting', 'spam', 'normal', 'resolved', pg_catalog.now() + interval '1 day'
);
insert into public.moderation_actions (
  actor_id, report_id, action, rationale, request_id, resulting_visibility
) values (
  '00000000-0000-4000-8000-000000006000',
  '00000000-0000-4000-8000-000000006600', 'no_action',
  'Task 3 retained moderation decision integrity.',
  '00000000-0000-4000-8000-000000006601', 'limited'
);
insert into audit.access_audit (
  actor_id, action, resource_type, resource_id, purpose, request_id
) values (
  '00000000-0000-4000-8000-000000006000', 'identity_proposal_review',
  'identity_proposal', '00000000-0000-4000-8000-000000006405',
  'identity_review', '00000000-0000-4000-8000-000000006601'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000006004', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
      '00000000-0000-4000-8000-000000006410', 'confirm',
      'Independent evidence supports this selected candidate.',
      '00000000-0000-4000-8000-000000006490'
    )$$,
  '42501', 'identity_reviewer_recusal_required',
  'the private evidence selector must recuse from reviewing selected work'
);
reset role;
select is(
  (select pg_catalog.count(*) from public.match_reviews
    where request_id = '00000000-0000-4000-8000-000000006490'),
  0::bigint,
  'selector recusal writes no review row'
);
select is(
  (select pg_catalog.count(*) from private.identity_requests
    where request_id = '00000000-0000-4000-8000-000000006490'),
  0::bigint,
  'selector recusal writes no request ledger row'
);
select is(
  (select pg_catalog.count(*) from audit.access_audit
    where request_id = '00000000-0000-4000-8000-000000006490'),
  0::bigint,
  'selector recusal writes no audit row'
);

select set_config('private.account_erasure_actor', 'task3-outer-scope', true);
select set_config('private.identity_assistance_job_writer', 'task3-outer-job', true);
select set_config('private.identity_assistance_candidate_writer', 'task3-outer-candidate', true);
select lives_ok(
  $$delete from public.user_profiles
      where id = '00000000-0000-4000-8000-000000006000'$$,
  'account deletion invalidates every source-derived identity job before foreign-key anonymization'
);
do $red_contract$
begin
  if exists (
    select 1
      from private.identity_assistance_jobs
     where id = '00000000-0000-4000-8000-000000006301'
       and (
         status is distinct from 'cancelled'::private.identity_assistance_job_status
         or input_sha256 is not null
         or result_invalidated_at is null
       )
  ) then
    raise exception 'task3_account_erasure_did_not_invalidate_identity_jobs'
      using errcode = 'P0001';
  end if;
end;
$red_contract$;
select is(
  current_setting('private.account_erasure_actor', true),
  'task3-outer-scope',
  'account erasure restores the caller erasure context'
);
select is(
  current_setting('private.identity_assistance_job_writer', true),
  'task3-outer-job',
  'account erasure restores the caller job-writer context'
);
select is(
  current_setting('private.identity_assistance_candidate_writer', true),
  'task3-outer-candidate',
  'account erasure restores the caller candidate-writer context'
);

select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs
    where id in (
      '00000000-0000-4000-8000-000000006301',
      '00000000-0000-4000-8000-000000006302',
      '00000000-0000-4000-8000-000000006303'
    )
      and status = 'cancelled'
      and requester_id is null
      and media_asset_id is null
      and input_sha256 is null
      and lease_id is null
      and lease_expires_at is null
      and processing_at is null
      and cancelled_at is not null
      and withdrawn_at is not null
      and result_invalidated_at is not null),
  3::bigint,
  'requested processing and successful-unselected jobs become safely cancelled'
);
select ok(
  (select completed_at is not null
      and model_version = 'model.v1'
      and callback_contract_version = 'identify-callback.v1'
      and new_cat_recommended is false
     from private.identity_assistance_jobs
    where id = '00000000-0000-4000-8000-000000006303'),
  'successful-unselected invalidation preserves immutable completion facts'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs
    where id in (
      '00000000-0000-4000-8000-000000006304',
      '00000000-0000-4000-8000-000000006305',
      '00000000-0000-4000-8000-000000006307'
    )
      and status = 'succeeded'
      and selected_at is not null
      and completed_at is not null
      and model_version = 'model.v1'
      and callback_contract_version = 'identify-callback.v1'
      and requester_id is null
      and media_asset_id is null
      and input_sha256 is null
      and withdrawn_at is not null
      and result_invalidated_at is not null),
  3::bigint,
  'selected successes preserve selection and completion while losing erased source provenance'
);
select ok(
  (select status = 'failed'
      and failed_at is not null
      and failure_code = 'internal_error'
      and requester_id is null
      and media_asset_id is null
      and input_sha256 is null
      and withdrawn_at is not null
      and result_invalidated_at is not null
     from private.identity_assistance_jobs
    where id = '00000000-0000-4000-8000-000000006306'),
  'already-terminal work retains legal terminal facts after source erasure'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_candidates
    where job_id between
      '00000000-0000-4000-8000-000000006301'::uuid and
      '00000000-0000-4000-8000-000000006307'::uuid),
  0::bigint,
  'account erasure purges every candidate from every affected job'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_events
    where job_id between
      '00000000-0000-4000-8000-000000006301'::uuid and
      '00000000-0000-4000-8000-000000006307'::uuid
      and event_type = 'invalidated'
      and failure_code = 'source_invalidated'
      and reason_code = 'source_invalidated'
      and actor_id is null
      and request_id is null),
  7::bigint,
  'each newly invalidated account job receives one minimized invalidation event'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_events
    where job_id between
      '00000000-0000-4000-8000-000000006301'::uuid and
      '00000000-0000-4000-8000-000000006307'::uuid
      and event_type = 'invalidated'),
  7::bigint,
  'account invalidation emits no duplicate job event'
);

select ok(
  not exists (
    select 1 from public.identity_proposals
     where id in (
       '00000000-0000-4000-8000-000000006404',
       '00000000-0000-4000-8000-000000006408'
     )
  )
  and not exists (
    select 1 from public.match_reviews
     where id = '00000000-0000-4000-8000-000000006454'
  ),
  'tentative evidence manual and prior-needs-more-evidence work is withdrawn without a terminal decision'
);
select is(
  (select pg_catalog.count(*)
     from public.identity_proposals as proposals
     join private.identity_proposal_evidence as evidence
       on evidence.proposal_id = proposals.id
    where proposals.id in (
      '00000000-0000-4000-8000-000000006405',
      '00000000-0000-4000-8000-000000006407'
    )
      and proposals.status in ('confirmed', 'rejected')
      and evidence.selector_id is null
      and evidence.media_asset_id is null),
  2::bigint,
  'terminal proposal decisions remain intact with minimized evidence provenance'
);
select ok(
  (select proposer_id is null and status = 'confirmed'
     from public.identity_proposals
    where id = '00000000-0000-4000-8000-000000006409'),
  'retained manual decision history loses the erased proposer identity'
);
select ok(
  (select reviewer_id is null and decision = 'confirm'
     from public.match_reviews
    where id = '00000000-0000-4000-8000-000000006455'),
  'retained match decision loses the erased reviewer identity'
);
select ok(
  (select reviewer_id = '00000000-0000-4000-8000-000000006001'
      and decision = 'reject'
     from public.match_reviews
    where id = '00000000-0000-4000-8000-000000006457'),
  'retained match decision preserves a non-erased reviewer and rejection integrity'
);

select is(
  (select pg_catalog.count(*) from private.identity_assistance_requests
    where actor_id = '00000000-0000-4000-8000-000000006000'),
  0::bigint,
  'actor-bound identity-assistance request ledgers are deleted'
);
select is(
  (select pg_catalog.count(*) from private.identity_requests
    where actor_id = '00000000-0000-4000-8000-000000006000'),
  0::bigint,
  'actor-bound proposal and review request ledgers are deleted'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_status_reads
    where actor_id = '00000000-0000-4000-8000-000000006000'),
  0::bigint,
  'actor-bound identity status-read rows are deleted'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs
    where requester_id = '00000000-0000-4000-8000-000000006000')
  + (select pg_catalog.count(*)
       from private.identity_proposal_evidence
      where selector_id = '00000000-0000-4000-8000-000000006000')
  + (select pg_catalog.count(*)
       from public.match_reviews
      where reviewer_id = '00000000-0000-4000-8000-000000006000')
  + (select pg_catalog.count(*)
       from public.identity_proposals
      where proposer_id = '00000000-0000-4000-8000-000000006000')
  + (select pg_catalog.count(*)
       from private.identity_assistance_events
      where actor_id = '00000000-0000-4000-8000-000000006000')
  + (select pg_catalog.count(*)
       from public.moderation_actions
      where actor_id = '00000000-0000-4000-8000-000000006000')
  + (select pg_catalog.count(*)
       from audit.access_audit
      where actor_id = '00000000-0000-4000-8000-000000006000'),
  0::bigint,
  'no retained identity moderation or audit actor field contains the erased UUID'
);
select ok(
  (select actor_id is null and actor_erasure_token is not null
     from public.moderation_actions
    where request_id = '00000000-0000-4000-8000-000000006601')
  and (select actor_id is null and actor_erasure_token is not null
     from audit.access_audit
    where request_id = '00000000-0000-4000-8000-000000006601'),
  'moderation and audit history remains pseudonymized under the established erasure contract'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000006001', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
      '00000000-0000-4000-8000-000000006404', 'confirm',
      'Erased source evidence cannot support a later review.',
      '00000000-0000-4000-8000-000000006491'
    )$$,
  'P0001', 'identity_proposal_not_actionable',
  'account-invalidated evidence-backed work cannot be reviewed later'
);
reset role;
select is(
  (select pg_catalog.count(*) from public.match_reviews
    where request_id = '00000000-0000-4000-8000-000000006491'),
  0::bigint,
  'account-invalidated review writes no decision'
);

update public.animals
   set visibility = 'hidden'
 where id = '00000000-0000-4000-8000-000000006502';
update public.animals
   set visibility = 'archived', archived_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000006503';
delete from public.animals
 where id = '00000000-0000-4000-8000-000000006504';
select is(
  (select pg_catalog.count(*) from private.identity_assistance_candidates
    where job_id in (
      '00000000-0000-4000-8000-000000006311',
      '00000000-0000-4000-8000-000000006312',
      '00000000-0000-4000-8000-000000006313'
    )),
  0::bigint,
  'animal hide archive and delete each purge the complete containing candidate set'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_jobs
    where id in (
      '00000000-0000-4000-8000-000000006311',
      '00000000-0000-4000-8000-000000006312',
      '00000000-0000-4000-8000-000000006313'
    )
      and input_sha256 is null
      and result_invalidated_at is not null
      and withdrawn_at is not null),
  3::bigint,
  'animal unavailability marks every affected selected result non-actionable'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000006001', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
      '00000000-0000-4000-8000-000000006411', 'confirm',
      'Hidden candidate evidence cannot support a review.',
      '00000000-0000-4000-8000-000000006492'
    )$$,
  'P0001', 'identity_proposal_not_actionable',
  'review revalidation rejects a hidden-candidate invalidated source'
);
select throws_ok(
  $$select * from public.review_identity_proposal(
      '00000000-0000-4000-8000-000000006412', 'confirm',
      'Archived candidate evidence cannot support a review.',
      '00000000-0000-4000-8000-000000006493'
    )$$,
  'P0001', 'identity_proposal_not_actionable',
  'review revalidation rejects an archived-candidate invalidated source'
);
select throws_ok(
  $$select * from public.review_identity_proposal(
      '00000000-0000-4000-8000-000000006413', 'confirm',
      'Deleted candidate evidence cannot support a review.',
      '00000000-0000-4000-8000-000000006494'
    )$$,
  'P0001', 'identity_proposal_not_actionable',
  'review revalidation rejects a deleted-candidate invalidated source'
);
reset role;
select is(
  (select pg_catalog.count(*) from public.match_reviews
    where request_id in (
      '00000000-0000-4000-8000-000000006492',
      '00000000-0000-4000-8000-000000006493',
      '00000000-0000-4000-8000-000000006494'
    ))
  + (select pg_catalog.count(*) from private.identity_requests
      where request_id in (
        '00000000-0000-4000-8000-000000006492',
        '00000000-0000-4000-8000-000000006493',
        '00000000-0000-4000-8000-000000006494'
      ))
  + (select pg_catalog.count(*) from audit.access_audit
      where request_id in (
        '00000000-0000-4000-8000-000000006492',
        '00000000-0000-4000-8000-000000006493',
        '00000000-0000-4000-8000-000000006494'
      )),
  0::bigint,
  'animal-invalidated review attempts write no review ledger or audit side effect'
);
select is(
  (select pg_catalog.count(*) from public.sightings
    where id in (
      '00000000-0000-4000-8000-000000006111',
      '00000000-0000-4000-8000-000000006112',
      '00000000-0000-4000-8000-000000006113'
    ) and animal_id is not null),
  0::bigint,
  'animal-invalidated review attempts never link a sighting'
);

select lives_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000006003',
      '00000000-0000-4000-8000-000000006214'
    )$$,
  'media invalidation remains compatible with the evidence review gate'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000006001', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
      '00000000-0000-4000-8000-000000006414', 'confirm',
      'Deleted media evidence cannot support a review.',
      '00000000-0000-4000-8000-000000006495'
    )$$,
  'P0001', 'identity_proposal_not_actionable',
  'media-invalidated evidence-backed work cannot be reviewed later'
);
reset role;
select is(
  (select pg_catalog.count(*) from public.match_reviews
    where request_id = '00000000-0000-4000-8000-000000006495')
  + (select pg_catalog.count(*) from private.identity_requests
      where request_id = '00000000-0000-4000-8000-000000006495')
  + (select pg_catalog.count(*) from audit.access_audit
      where request_id = '00000000-0000-4000-8000-000000006495'),
  0::bigint,
  'media-invalidated review writes no review ledger or audit side effect'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000006006', true);
select results_eq(
  $$select "proposalId", "decision" collate "C", "status" collate "C", "animalId"
      from public.review_identity_proposal(
        '00000000-0000-4000-8000-000000006415', 'needs_more_evidence',
        'A second independent angle remains necessary.',
        '00000000-0000-4000-8000-000000006496'
      )$$,
  $$values (
      '00000000-0000-4000-8000-000000006415'::uuid,
      'needs_more_evidence'::text collate "C", 'tentative'::text collate "C",
      '00000000-0000-4000-8000-000000006501'::uuid
    )$$,
  'legacy manual review retains the exact four-column response'
);
select lives_ok(
  $$select * from public.review_identity_proposal(
      '00000000-0000-4000-8000-000000006415', 'needs_more_evidence',
      'A second independent angle remains necessary.',
      '00000000-0000-4000-8000-000000006496'
    )$$,
  'an authorized exact review replay remains idempotent'
);
reset role;
update public.role_grants
   set revoked_at = pg_catalog.clock_timestamp()
 where id = '00000000-0000-4000-8000-000000006056';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000006006', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
      '00000000-0000-4000-8000-000000006415', 'needs_more_evidence',
      'A second independent angle remains necessary.',
      '00000000-0000-4000-8000-000000006496'
    )$$,
  '42501', 'trusted_identity_reviewer_required',
  'exact replay does not bypass current authorization after grant revocation'
);
reset role;
select is(
  (select pg_catalog.count(*) from public.match_reviews
    where request_id = '00000000-0000-4000-8000-000000006496'),
  1::bigint,
  'authorized replay and later revoked replay retain one review row'
);
select is(
  (select pg_catalog.count(*) from audit.access_audit
    where request_id = '00000000-0000-4000-8000-000000006496'),
  1::bigint,
  'authorized replay and later revoked replay retain one audit row'
);

insert into public.media_assets (
  id, uploader_id, storage_bucket, storage_path, sha256,
  redaction_confirmed_at, training_eligible
) values (
  '00000000-0000-4000-8000-000000006299',
  '00000000-0000-4000-8000-000000006005', 'public-media',
  '00000000-0000-4000-8000-000000006005/task3-exception.jpg', repeat('f', 64),
  pg_catalog.now(), false
);
create function pg_temp.fail_task3_account_erasure()
returns trigger
language plpgsql
set search_path = pg_catalog
as $failure$
begin
  raise exception 'task3_erasure_fixture_failure' using errcode = 'P0001';
end;
$failure$;
create trigger task3_account_erasure_fixture_failure
before update on public.media_assets
for each row
when (old.uploader_id = '00000000-0000-4000-8000-000000006005'::uuid)
execute function pg_temp.fail_task3_account_erasure();
select set_config('private.account_erasure_actor', 'task3-exception-scope', true);
select set_config('private.identity_assistance_job_writer', 'task3-exception-job', true);
select set_config('private.identity_assistance_candidate_writer', 'task3-exception-candidate', true);
select throws_ok(
  $$delete from public.user_profiles
      where id = '00000000-0000-4000-8000-000000006005'$$,
  'P0001', 'task3_erasure_fixture_failure',
  'fixture forces the account-erasure exception path'
);
drop trigger task3_account_erasure_fixture_failure on public.media_assets;
select is(
  current_setting('private.account_erasure_actor', true),
  'task3-exception-scope',
  'exceptional account erasure restores the caller erasure context'
);
select is(
  current_setting('private.identity_assistance_job_writer', true),
  'task3-exception-job',
  'exceptional account erasure restores the caller job-writer context'
);
select is(
  current_setting('private.identity_assistance_candidate_writer', true),
  'task3-exception-candidate',
  'exceptional account erasure restores the caller candidate-writer context'
);
select ok(
  exists (select 1 from public.user_profiles
    where id = '00000000-0000-4000-8000-000000006005'),
  'exceptional account erasure rolls back the profile deletion'
);

select lives_ok(
  $orchestrator$
  do $main$
  declare
    delete_pid integer;
    review_pid integer;
    wait_deadline timestamptz;
    review_waited_for_delete boolean := false;
    review_error text;
    side_effect_count bigint;
    local_connection text :=
      'host=' || pg_catalog.host(pg_catalog.inet_server_addr())
      || ' port=' || pg_catalog.current_setting('port')
      || ' dbname=' || pg_catalog.current_database()
      || ' user=' || session_user
      || ' password=' || session_user;
  begin
    perform extensions.dblink_connect(
      'task3_review_setup',
      local_connection || ' application_name=task3_review_setup'
    );
    perform extensions.dblink_exec(
      'task3_review_setup', 'set session_replication_role = replica'
    );
    perform extensions.dblink_exec(
      'task3_review_setup',
      $remote$
        insert into public.user_profiles (id, public_name, adult_confirmed_at)
        values
          ('00000000-0000-4000-8000-000000007000',
            'Task 3 Race Source', pg_catalog.now()),
          ('00000000-0000-4000-8000-000000007001',
            'Task 3 Race Reviewer', pg_catalog.now()),
          ('00000000-0000-4000-8000-000000007002',
            'Task 3 Race Creator', pg_catalog.now());
      $remote$
    );
    perform extensions.dblink_exec(
      'task3_review_setup', 'set session_replication_role = origin'
    );
    perform extensions.dblink_exec(
      'task3_review_setup',
      $remote$
        insert into public.role_grants (
          id, user_id, role, granted_by, verification_method,
          verification_completed_at
        ) values (
          '00000000-0000-4000-8000-000000007010',
          '00000000-0000-4000-8000-000000007001', 'platform_admin',
          '00000000-0000-4000-8000-000000007002',
          'task3_race', pg_catalog.now()
        );
        insert into public.sightings (
          id, reporter_id, occurred_at, public_cell_id, time_bucket, risk,
          visibility, client_dedupe_key
        ) values (
          '00000000-0000-4000-8000-000000007020',
          '00000000-0000-4000-8000-000000007000', pg_catalog.now(),
          '8928308280fffff', 'morning', 'normal', 'limited',
          'task3-review-erasure-race'
        );
        insert into public.media_assets (
          id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
          redaction_confirmed_at, training_eligible, client_media_id,
          byte_length, width, height, recipe_version, detector_versions,
          status, reviewed_at
        ) values (
          '00000000-0000-4000-8000-000000007030',
          '00000000-0000-4000-8000-000000007020',
          '00000000-0000-4000-8000-000000007000', 'media-staging',
          'jobs/00000000-0000-4000-8000-000000007040.jpg', repeat('a', 64),
          pg_catalog.now(), false, 'task3-race-media', 4096, 512, 512,
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
          '00000000-0000-4000-8000-000000007040',
          '00000000-0000-4000-8000-000000007000',
          '00000000-0000-4000-8000-000000007020', 'task3-race-media',
          repeat('a', 64), 4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
          '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
          pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000007040.jpg',
          'finalized', pg_catalog.now(), pg_catalog.now() + interval '10 minutes',
          pg_catalog.now() + interval '1 hour', 'infinity'::timestamptz,
          pg_catalog.now(), '00000000-0000-4000-8000-000000007030'
        );
        insert into public.animals (
          id, primary_alias, profile_created_by, visibility
        ) values (
          '00000000-0000-4000-8000-000000007060', 'Task 3 Race Candidate',
          '00000000-0000-4000-8000-000000007002', 'limited'
        );
        insert into private.identity_assistance_jobs (
          id, sighting_id, media_asset_id, requester_id, status,
          notice_version, input_sha256, attempt_count, lease_id,
          lease_expires_at, processing_at
        ) values (
          '00000000-0000-4000-8000-000000007050',
          '00000000-0000-4000-8000-000000007020',
          '00000000-0000-4000-8000-000000007030',
          '00000000-0000-4000-8000-000000007000', 'processing',
          'notice.v1', repeat('a', 64), 1,
          '00000000-0000-4000-8000-000000007055',
          pg_catalog.now() + interval '2 minutes', pg_catalog.now()
        );
        select pg_catalog.set_config(
          'private.identity_assistance_candidate_writer',
          '00000000-0000-4000-8000-000000007050', false
        );
        insert into private.identity_assistance_candidates (
          job_id, rank, animal_id, confidence_band, reason_codes
        ) values (
          '00000000-0000-4000-8000-000000007050', 1,
          '00000000-0000-4000-8000-000000007060', 'likely',
          array['face_pattern_similar']::private.identity_assistance_reason_code[]
        );
        select pg_catalog.set_config(
          'private.identity_assistance_job_writer',
          '00000000-0000-4000-8000-000000007050', false
        );
        update private.identity_assistance_jobs
           set status = 'succeeded', lease_id = null, lease_expires_at = null,
               model_version = 'model.v1',
               callback_contract_version = 'identify-callback.v1',
               new_cat_recommended = false, completed_at = pg_catalog.now(),
               selected_at = pg_catalog.now()
         where id = '00000000-0000-4000-8000-000000007050';
        insert into public.identity_proposals (
          id, sighting_id, proposed_animal_id, source, status,
          model_version, confidence_band, reasons
        ) values (
          '00000000-0000-4000-8000-000000007070',
          '00000000-0000-4000-8000-000000007020',
          '00000000-0000-4000-8000-000000007060', 'ai_candidate',
          'tentative', 'model.v1', 'likely', '["face_pattern_similar"]'::jsonb
        );
        insert into private.identity_proposal_evidence (
          proposal_id, job_id, selected_candidate_rank, media_asset_id,
          recipe_version, crop_contract_version, embedding_contract_version,
          identify_contract_version, model_version, callback_contract_version,
          selector_id, selected_at
        ) values (
          '00000000-0000-4000-8000-000000007070',
          '00000000-0000-4000-8000-000000007050', 1,
          '00000000-0000-4000-8000-000000007030',
          'jpeg-srgb-2048-q88.v1', 'crop.v1', 'embedding.v1', 'identify.v1',
          'model.v1', 'identify-callback.v1',
          '00000000-0000-4000-8000-000000007000',
          (select selected_at from private.identity_assistance_jobs
            where id = '00000000-0000-4000-8000-000000007050')
        );
      $remote$
    );

    perform extensions.dblink_connect(
      'task3_account_delete',
      local_connection || ' application_name=task3_account_delete'
    );
    perform extensions.dblink_connect(
      'task3_evidence_review',
      local_connection || ' application_name=task3_evidence_review'
    );
    perform extensions.dblink_exec(
      'task3_account_delete', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec(
      'task3_evidence_review', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec('task3_account_delete', 'begin');
    perform extensions.dblink_exec(
      'task3_account_delete',
      $remote$
        delete from public.user_profiles
         where id = '00000000-0000-4000-8000-000000007000';
      $remote$
    );
    select remote_pid into delete_pid
      from extensions.dblink(
        'task3_account_delete', 'select pg_catalog.pg_backend_pid()'
      ) as backend(remote_pid integer);
    select remote_pid into review_pid
      from extensions.dblink(
        'task3_evidence_review', 'select pg_catalog.pg_backend_pid()'
      ) as backend(remote_pid integer);

    perform extensions.dblink_exec(
      'task3_evidence_review', 'set role authenticated'
    );
    perform extensions.dblink_exec(
      'task3_evidence_review',
      'set request.jwt.claim.role = ''authenticated'''
    );
    perform extensions.dblink_exec(
      'task3_evidence_review',
      'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000007001'''
    );

    perform extensions.dblink_send_query(
      'task3_evidence_review',
      $remote$
        select * from public.review_identity_proposal(
          '00000000-0000-4000-8000-000000007070', 'confirm',
          'Concurrent erased evidence cannot support review.',
          '00000000-0000-4000-8000-000000007080'
        );
      $remote$
    );
    wait_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
    loop
      if delete_pid = any(pg_catalog.pg_blocking_pids(review_pid)) then
        review_waited_for_delete := true;
        exit;
      end if;
      exit when extensions.dblink_is_busy('task3_evidence_review') = 0;
      if pg_catalog.clock_timestamp() >= wait_deadline then
        raise exception 'task3_review_profile_lock_observation_timeout';
      end if;
      perform pg_catalog.pg_sleep(0.01);
    end loop;

    perform extensions.dblink_exec('task3_account_delete', 'commit');
    wait_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
    while extensions.dblink_is_busy('task3_evidence_review') = 1 loop
      if pg_catalog.clock_timestamp() >= wait_deadline then
        raise exception 'task3_review_revalidation_timeout';
      end if;
      perform pg_catalog.pg_sleep(0.01);
    end loop;
    perform *
      from extensions.dblink_get_result('task3_evidence_review', false)
        as review_result(
          proposal_id uuid, decision text, status text, animal_id uuid
        );
    review_error := extensions.dblink_error_message('task3_evidence_review');
    perform extensions.dblink_disconnect('task3_account_delete');
    perform extensions.dblink_disconnect('task3_evidence_review');

    select remote_count into side_effect_count
      from extensions.dblink(
        'task3_review_setup',
        $remote$
          select
            (select pg_catalog.count(*) from public.match_reviews
              where request_id = '00000000-0000-4000-8000-000000007080')
            +
            (select pg_catalog.count(*) from private.identity_requests
              where request_id = '00000000-0000-4000-8000-000000007080')
            +
            (select pg_catalog.count(*) from audit.access_audit
              where request_id = '00000000-0000-4000-8000-000000007080')
            +
            (select pg_catalog.count(*) from public.sightings
              where id = '00000000-0000-4000-8000-000000007020'
                and animal_id is not null)
        $remote$
      ) as effects(remote_count bigint);

    perform extensions.dblink_exec(
      'task3_review_setup', 'set session_replication_role = replica'
    );
    perform extensions.dblink_exec(
      'task3_review_setup',
      $remote$
        delete from public.match_reviews
         where proposal_id = '00000000-0000-4000-8000-000000007070';
        delete from private.identity_proposal_evidence
         where proposal_id = '00000000-0000-4000-8000-000000007070';
        delete from public.identity_proposals
         where id = '00000000-0000-4000-8000-000000007070';
        delete from private.identity_assistance_candidates
         where job_id = '00000000-0000-4000-8000-000000007050';
        delete from private.identity_assistance_events
         where job_id = '00000000-0000-4000-8000-000000007050';
        delete from private.identity_assistance_jobs
         where id = '00000000-0000-4000-8000-000000007050';
        delete from private.media_upload_jobs
         where id = '00000000-0000-4000-8000-000000007040';
        delete from public.media_assets
         where id = '00000000-0000-4000-8000-000000007030';
        delete from public.sightings
         where id = '00000000-0000-4000-8000-000000007020';
        delete from public.animals
         where id = '00000000-0000-4000-8000-000000007060';
        delete from public.role_grants
         where id = '00000000-0000-4000-8000-000000007010';
        delete from public.user_profiles
         where id in (
           '00000000-0000-4000-8000-000000007001',
           '00000000-0000-4000-8000-000000007002'
         );
      $remote$
    );
    perform extensions.dblink_disconnect('task3_review_setup');

    if not review_waited_for_delete then
      raise exception 'task3_review_did_not_wait_for_source_profile';
    end if;
    if review_error collate "C" not like '%identity_proposal_not_actionable%' collate "C" then
      raise exception 'task3_review_did_not_revalidate_erased_source';
    end if;
    if side_effect_count <> 0 then
      raise exception 'task3_review_committed_after_source_erasure';
    end if;
  end
  $main$;
  $orchestrator$,
  'review waits on source profile deletion then revalidates and commits no decision'
);

select * from finish();
rollback;
