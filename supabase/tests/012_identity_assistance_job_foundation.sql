begin;
select plan(177);

select has_type('private', 'identity_assistance_job_status', 'identity-assistance job status enum exists');
select has_type('private', 'identity_assistance_confidence_band', 'identity-assistance confidence enum exists');
select has_type('private', 'identity_assistance_reason_code', 'identity-assistance reason enum exists');
select has_type('private', 'identity_assistance_failure_code', 'identity-assistance failure enum exists');
select has_type('private', 'identity_assistance_event_type', 'identity-assistance event enum exists');

select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
     join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where nspname = 'private' and typname = 'identity_assistance_job_status'),
  array['requested', 'processing', 'succeeded', 'failed', 'cancelled', 'expired']::text[],
  'job-status enum is exactly allow-listed'
);
select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
     join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where nspname = 'private' and typname = 'identity_assistance_confidence_band'),
  array['likely', 'possible', 'weak']::text[],
  'confidence enum is exactly allow-listed'
);
select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
     join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where nspname = 'private' and typname = 'identity_assistance_reason_code'),
  array['face_pattern_similar', 'ear_shape_similar', 'coat_marking_similar', 'view_angle_limited', 'image_quality_limited']::text[],
  'reason-code enum is exactly allow-listed'
);
select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
     join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where nspname = 'private' and typname = 'identity_assistance_failure_code'),
  array['invalid_input', 'provider_unavailable', 'quality_rejected', 'internal_error', 'lease_expired', 'source_invalidated']::text[],
  'failure-code enum is exactly allow-listed'
);
select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum join pg_type on pg_type.oid = pg_enum.enumtypid
     join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where nspname = 'private' and typname = 'identity_assistance_event_type'),
  array['requested', 'claimed', 'completed', 'retry_released', 'failed', 'cancelled', 'expired', 'selected', 'invalidated', 'cleaned']::text[],
  'event enum is exactly allow-listed'
);

select has_table('private', 'identity_assistance_jobs', 'private job table exists');
select has_table('private', 'identity_assistance_candidates', 'private candidate table exists');
select has_table('private', 'identity_assistance_requests', 'private contributor idempotency ledger exists');
select has_table('private', 'identity_assistance_service_requests', 'private service idempotency ledger exists');
select has_table('private', 'identity_assistance_events', 'private bounded event ledger exists');
select has_table('private', 'identity_assistance_status_reads', 'private status-read aggregate exists');
select has_table('private', 'identity_proposal_evidence', 'private proposal evidence exists');

with roles(role_name) as (values ('public'), ('anon'), ('authenticated'), ('service_role')),
tables(table_name) as (values
  ('identity_assistance_jobs'), ('identity_assistance_candidates'),
  ('identity_assistance_requests'), ('identity_assistance_service_requests'),
  ('identity_assistance_events'), ('identity_assistance_status_reads'),
  ('identity_proposal_evidence')
), privileges(privilege_name) as (values ('select'), ('insert'), ('update'), ('delete'))
select ok(
  not has_table_privilege(roles.role_name, 'private.' || tables.table_name, privileges.privilege_name),
  roles.role_name || ' has no ' || privileges.privilege_name || ' on private.' || tables.table_name
)
from roles cross join tables cross join privileges;

select is(
  (select array_agg(attname::text order by attnum)
     from pg_attribute
    where attrelid = 'private.identity_assistance_jobs'::regclass
      and attnum > 0 and not attisdropped),
  array[
    'id', 'sighting_id', 'media_asset_id', 'requester_id', 'status', 'purpose',
    'notice_version', 'input_sha256', 'recipe_version', 'crop_contract_version',
    'embedding_contract_version', 'identify_contract_version', 'model_version',
    'callback_contract_version', 'new_cat_recommended', 'attempt_count', 'lease_id',
    'lease_expires_at', 'failure_code', 'requested_at', 'processing_at', 'completed_at',
    'failed_at', 'cancelled_at', 'expires_at', 'selected_at', 'withdrawn_at',
    'result_invalidated_at', 'created_at', 'updated_at'
  ]::text[],
  'job table exposes exactly the approved application columns'
);
select is(
  (select count(*) from pg_attribute
    where attrelid = 'private.identity_assistance_jobs'::regclass
      and attnum > 0 and not attisdropped
      and attname = any(array['storage_bucket', 'storage_path', 'object_path', 'signed_url',
                              'embedding', 'vector', 'score', 'location', 'latitude',
                              'longitude', 'payload', 'worker_log'])),
  0::bigint,
  'job table stores no locator, capability, vector, score, location, payload, or worker log'
);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values ('00000000-0000-4000-8000-000000001800', 'Identity Job Owner', now());
set local session_replication_role = origin;

insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
) values
  ('00000000-0000-4000-8000-000000001810', '00000000-0000-4000-8000-000000001800', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-job-1810'),
  ('00000000-0000-4000-8000-000000001811', '00000000-0000-4000-8000-000000001800', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-job-1811'),
  ('00000000-0000-4000-8000-000000001812', '00000000-0000-4000-8000-000000001800', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-job-1812'),
  ('00000000-0000-4000-8000-000000001813', '00000000-0000-4000-8000-000000001800', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-job-1813'),
  ('00000000-0000-4000-8000-000000001814', '00000000-0000-4000-8000-000000001800', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-job-1814');

insert into public.animals (id, primary_alias, profile_created_by, visibility) values
  ('00000000-0000-4000-8000-000000001820', 'Candidate One', '00000000-0000-4000-8000-000000001800', 'limited'),
  ('00000000-0000-4000-8000-000000001821', 'Candidate Two', '00000000-0000-4000-8000-000000001800', 'limited'),
  ('00000000-0000-4000-8000-000000001822', 'Candidate Three', '00000000-0000-4000-8000-000000001800', 'limited');

insert into public.identity_proposals (id, sighting_id, proposer_id, source, status, reasons)
values (
  '00000000-0000-4000-8000-000000001830', '00000000-0000-4000-8000-000000001812',
  '00000000-0000-4000-8000-000000001800', 'new_animal', 'tentative', '[]'::jsonb
);

select lives_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256)
    values ('00000000-0000-4000-8000-000000001840', '00000000-0000-4000-8000-000000001810',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('a', 64))$$,
  'a hand-written requested job is valid'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256)
    values ('00000000-0000-4000-8000-000000001853', '00000000-0000-4000-8000-000000001813',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', null)$$,
  '23514', null, 'requested jobs require an input hash'
);
select lives_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, status, notice_version, input_sha256, failed_at, failure_code)
    values ('00000000-0000-4000-8000-000000001854', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'failed', 'notice.v1', null, now(), 'source_invalidated')$$,
  'terminal cleanup can clear an input hash'
);
select lives_ok(
  $$insert into private.identity_assistance_jobs (
      id, sighting_id, requester_id, status, notice_version, input_sha256,
      model_version, callback_contract_version, new_cat_recommended, completed_at,
      result_invalidated_at
    ) values (
      '00000000-0000-4000-8000-000000001855', '00000000-0000-4000-8000-000000001812',
      '00000000-0000-4000-8000-000000001800', 'succeeded', 'notice.v1', null,
      'model.v1', 'identify-callback.v1', true, now(), now()
    )$$,
  'invalidation cleanup can clear an input hash'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256)
    values ('00000000-0000-4000-8000-000000001841', '00000000-0000-4000-8000-000000001810',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('b', 64))$$,
  '23505', null, 'a sighting cannot have two actionable jobs'
);
select lives_ok(
  $$update private.identity_assistance_jobs set status = 'failed', failed_at = now(), failure_code = 'internal_error'
    where id = '00000000-0000-4000-8000-000000001840'$$,
  'a terminal failed job is valid'
);
select lives_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256)
    values ('00000000-0000-4000-8000-000000001842', '00000000-0000-4000-8000-000000001810',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('c', 64))$$,
  'a terminal failed job permits a fresh requested job'
);

select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, purpose)
    values ('00000000-0000-4000-8000-000000001843', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), 'training')$$,
  '23514', null, 'job purpose is fixed to identity assistance'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, recipe_version)
    values ('00000000-0000-4000-8000-000000001844', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), 'jpeg.v2')$$,
  '23514', null, 'recipe provenance is fixed'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, crop_contract_version)
    values ('00000000-0000-4000-8000-000000001845', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), 'crop.v2')$$,
  '23514', null, 'crop contract provenance is fixed'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, embedding_contract_version)
    values ('00000000-0000-4000-8000-000000001846', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), 'embedding.v2')$$,
  '23514', null, 'embedding contract provenance is fixed'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, identify_contract_version)
    values ('00000000-0000-4000-8000-000000001852', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), 'identify.v2')$$,
  '23514', null, 'identify contract provenance is fixed'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256)
    values ('00000000-0000-4000-8000-000000001847', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', 'not-a-lowercase-sha')$$,
  '23514', null, 'job input hash is lowercase sha256 only'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, attempt_count)
    values ('00000000-0000-4000-8000-000000001848', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), 4)$$,
  '23514', null, 'job attempts are bounded at three'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, lease_id)
    values ('00000000-0000-4000-8000-000000001849', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), '00000000-0000-4000-8000-000000001899')$$,
  '23514', null, 'a lease id requires a lease expiry'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, callback_contract_version)
    values ('00000000-0000-4000-8000-000000001850', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), 'identify-callback.v1')$$,
  '23514', null, 'callback provenance is unavailable before completion'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256, completed_at)
    values ('00000000-0000-4000-8000-000000001851', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64), now())$$,
  '23514', null, 'requested jobs cannot carry completion fields'
);

select lives_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256)
    values ('00000000-0000-4000-8000-000000001860', '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('e', 64))$$,
  'candidate fixture job is valid'
);
select throws_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001860', 0, '00000000-0000-4000-8000-000000001820', 'likely', array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  '23514', null, 'candidate rank zero is rejected'
);
select throws_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001860', 4, '00000000-0000-4000-8000-000000001820', 'likely', array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  '23514', null, 'candidate rank four is rejected'
);
select lives_ok(
  $$insert into private.identity_assistance_jobs (id, sighting_id, requester_id, notice_version, input_sha256)
    values ('00000000-0000-4000-8000-000000001861', '00000000-0000-4000-8000-000000001814',
      '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('f', 64))$$,
  'null-reason candidate fixture job is valid'
);
select throws_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001861', 1, '00000000-0000-4000-8000-000000001820', 'likely', array[null]::private.identity_assistance_reason_code[])$$,
  '23514', null, 'candidate reason arrays reject null elements'
);
select lives_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001860', 1, '00000000-0000-4000-8000-000000001820', 'likely', array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  'rank one candidate with one reason is valid'
);
select lives_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001860', 2, '00000000-0000-4000-8000-000000001821', 'possible', array['face_pattern_similar', 'ear_shape_similar']::private.identity_assistance_reason_code[])$$,
  'rank two candidate with two reasons is valid'
);
select lives_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001860', 3, '00000000-0000-4000-8000-000000001822', 'weak', array['face_pattern_similar', 'ear_shape_similar', 'coat_marking_similar', 'view_angle_limited']::private.identity_assistance_reason_code[])$$,
  'rank three candidate with four reasons is valid'
);
select throws_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001860', 2, '00000000-0000-4000-8000-000000001820', 'possible', array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  '23505', null, 'candidate animals are unique within a job'
);
select throws_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001860', 1, '00000000-0000-4000-8000-000000001821', 'possible', array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  '23505', null, 'candidate ranks are unique within a job'
);
select throws_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001842', 1, '00000000-0000-4000-8000-000000001820', 'likely', array[]::private.identity_assistance_reason_code[])$$,
  '23514', null, 'candidate reasons cannot be empty'
);
select throws_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001842', 1, '00000000-0000-4000-8000-000000001820', 'likely', array['face_pattern_similar', 'ear_shape_similar', 'coat_marking_similar', 'view_angle_limited', 'image_quality_limited']::private.identity_assistance_reason_code[])$$,
  '23514', null, 'candidate reasons are bounded at four'
);
select throws_ok(
  $$insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001842', 1, '00000000-0000-4000-8000-000000001820', 'likely', array['fabricated']::private.identity_assistance_reason_code[])$$,
  '22P02', null, 'fabricated candidate reason codes are rejected'
);

select lives_ok(
  $$insert into private.identity_assistance_requests (actor_id, request_id, payload_sha256, operation, job_id)
    values ('00000000-0000-4000-8000-000000001800', '00000000-0000-4000-8000-000000001870', repeat('a', 64), 'request', '00000000-0000-4000-8000-000000001842')$$,
  'contributor request ledger stores a bounded request'
);
select throws_ok(
  $$insert into private.identity_assistance_requests (actor_id, request_id, payload_sha256, operation)
    values ('00000000-0000-4000-8000-000000001800', '00000000-0000-4000-8000-000000001870', repeat('a', 64), 'request')$$,
  '23505', null, 'contributor request ledger rejects duplicate actor request keys'
);
select throws_ok(
  $$insert into private.identity_assistance_requests (actor_id, request_id, payload_sha256, operation)
    values ('00000000-0000-4000-8000-000000001800', '00000000-0000-4000-8000-000000001871', 'upper-case', 'request')$$,
  '23514', null, 'contributor ledger payload hashes are lowercase sha256 only'
);
select throws_ok(
  $$insert into private.identity_assistance_requests (actor_id, request_id, payload_sha256, operation)
    values ('00000000-0000-4000-8000-000000001800', '00000000-0000-4000-8000-000000001872', repeat('a', 64), 'anything')$$,
  '23514', null, 'contributor ledger operations are bounded'
);
select lives_ok(
  $$insert into private.identity_assistance_service_requests (request_id, payload_sha256, operation, job_id)
    values ('00000000-0000-4000-8000-000000001873', repeat('a', 64), 'claim', '00000000-0000-4000-8000-000000001842')$$,
  'service request ledger stores a bounded request'
);
select throws_ok(
  $$insert into private.identity_assistance_service_requests (request_id, payload_sha256, operation)
    values ('00000000-0000-4000-8000-000000001873', repeat('a', 64), 'claim')$$,
  '23505', null, 'service request ledger rejects duplicate request keys'
);
select throws_ok(
  $$insert into private.identity_assistance_service_requests (request_id, payload_sha256, operation)
    values ('00000000-0000-4000-8000-000000001874', 'upper-case', 'claim')$$,
  '23514', null, 'service ledger payload hashes are lowercase sha256 only'
);
select throws_ok(
  $$insert into private.identity_assistance_service_requests (request_id, payload_sha256, operation)
    values ('00000000-0000-4000-8000-000000001875', repeat('a', 64), 'anything')$$,
  '23514', null, 'service ledger operations are bounded'
);

select lives_ok(
  $$insert into private.identity_assistance_events (job_id, actor_id, request_id, event_type, reason_code)
    values ('00000000-0000-4000-8000-000000001842', '00000000-0000-4000-8000-000000001800',
      '00000000-0000-4000-8000-000000001876', 'requested', 'user_requested')$$,
  'bounded identity event is valid'
);
select throws_ok(
  $$insert into private.identity_assistance_events (event_type) values ('anything')$$,
  '22P02', null, 'arbitrary event names are rejected'
);
select is(
  (select count(*) from pg_attribute
    where attrelid = 'private.identity_assistance_events'::regclass
      and attnum > 0 and not attisdropped and attname = any(array['payload', 'payload_json', 'details', 'worker_log'])),
  0::bigint,
  'event ledger has no arbitrary payload column'
);
select throws_ok(
  $$insert into private.identity_assistance_events (event_type, reason_code)
    values ('requested', repeat('a', 65))$$,
  '23514', null, 'event reason codes are bounded'
);

select lives_ok(
  $$insert into private.identity_assistance_status_reads (actor_id, job_id, accessed_on, first_accessed_at, last_accessed_at, access_count)
    values ('00000000-0000-4000-8000-000000001800', '00000000-0000-4000-8000-000000001842', current_date, now(), now(), 1)$$,
  'daily status-read aggregate is valid'
);
select throws_ok(
  $$insert into private.identity_assistance_status_reads (actor_id, job_id, accessed_on, first_accessed_at, last_accessed_at, access_count)
    values ('00000000-0000-4000-8000-000000001800', '00000000-0000-4000-8000-000000001842', current_date, now(), now(), 1)$$,
  '23505', null, 'daily status-read aggregate is unique per actor and job'
);

select lives_ok(
  $$insert into private.identity_proposal_evidence (
      proposal_id, job_id, selected_candidate_rank, recipe_version, crop_contract_version,
      embedding_contract_version, identify_contract_version, model_version,
      callback_contract_version, selector_id, selected_at
    ) values (
      '00000000-0000-4000-8000-000000001830', '00000000-0000-4000-8000-000000001842', 1,
      'jpeg-srgb-2048-q88.v1', 'crop.v1', 'embedding.v1', 'identify.v1', 'model.v1',
      'identify-callback.v1', '00000000-0000-4000-8000-000000001800', now()
    )$$,
  'evidence stores only bounded selection provenance'
);
select is(
  (select count(*) from pg_attribute
    where attrelid = 'private.identity_proposal_evidence'::regclass
      and attnum > 0 and not attisdropped
      and attname = any(array['storage_bucket', 'storage_path', 'object_path', 'path', 'sha256',
                              'input_sha256', 'score', 'vector', 'embedding', 'location', 'payload'])),
  0::bigint,
  'evidence has no locator, hash, score, vector, location, or arbitrary payload column'
);

delete from private.identity_proposal_evidence where proposal_id = '00000000-0000-4000-8000-000000001830';
delete from private.identity_assistance_status_reads where actor_id = '00000000-0000-4000-8000-000000001800';
delete from private.identity_assistance_events where request_id = '00000000-0000-4000-8000-000000001876';
delete from private.identity_assistance_service_requests where request_id between '00000000-0000-4000-8000-000000001873' and '00000000-0000-4000-8000-000000001875';
delete from private.identity_assistance_requests where actor_id = '00000000-0000-4000-8000-000000001800';
delete from private.identity_assistance_candidates where job_id in ('00000000-0000-4000-8000-000000001860', '00000000-0000-4000-8000-000000001842');
delete from private.identity_assistance_jobs where id in ('00000000-0000-4000-8000-000000001840', '00000000-0000-4000-8000-000000001842', '00000000-0000-4000-8000-000000001853', '00000000-0000-4000-8000-000000001854', '00000000-0000-4000-8000-000000001855', '00000000-0000-4000-8000-000000001860', '00000000-0000-4000-8000-000000001861');
delete from public.identity_proposals where id = '00000000-0000-4000-8000-000000001830';
delete from public.animals where id in ('00000000-0000-4000-8000-000000001820', '00000000-0000-4000-8000-000000001821', '00000000-0000-4000-8000-000000001822');
delete from public.sightings where id in ('00000000-0000-4000-8000-000000001810', '00000000-0000-4000-8000-000000001811', '00000000-0000-4000-8000-000000001812', '00000000-0000-4000-8000-000000001813', '00000000-0000-4000-8000-000000001814');
set local session_replication_role = replica;
delete from public.user_profiles where id = '00000000-0000-4000-8000-000000001800';
set local session_replication_role = origin;

select * from finish();
rollback;
