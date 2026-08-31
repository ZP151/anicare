begin;
create extension if not exists dblink with schema extensions;
select no_plan();

-- A missing RPC or result-count column must be a clean pgTAP RED, not a
-- parse/fixture failure. Every invocation below is therefore dynamic.
select has_function(
  'public', 'service_claim_identity_assistance_jobs',
  array['text', 'integer', 'uuid'],
  'service claim RPC exists with the exact input signature'
);
select has_function(
  'public', 'service_fail_identity_assistance_job',
  array['uuid', 'uuid', 'integer', 'text', 'boolean', 'uuid'],
  'service failure RPC exists with the exact input signature'
);
select has_function(
  'public', 'service_cleanup_identity_assistance',
  array['integer', 'timestamp with time zone', 'uuid'],
  'service cleanup RPC exists with the exact input signature'
);

select is(
  (select procedures.proargnames
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_claim_identity_assistance_jobs(text,integer,uuid)'
    )),
  array[
    'p_worker_id', 'p_limit', 'p_request_id',
    'jobId', 'mediaAssetId', 'inputSha256', 'recipeVersion',
    'cropContractVersion', 'embeddingContractVersion',
    'identifyContractVersion', 'leaseId', 'leaseExpiresAt', 'attempt'
  ]::text[],
  'claim exposes exactly three inputs and ten approved output names'
);
select is(
  (select array(
     select modes.mode::text
       from pg_catalog.unnest(procedures.proargmodes)
         with ordinality as modes(mode, ordinal)
      order by modes.ordinal
   )
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_claim_identity_assistance_jobs(text,integer,uuid)'
    )),
  array['i', 'i', 'i', 't', 't', 't', 't', 't', 't', 't', 't', 't', 't']::text[],
  'claim uses exact input and table-output modes'
);
select is(
  (select array(
     select pg_catalog.format_type(types.type_oid, null)
       from pg_catalog.unnest(procedures.proallargtypes)
         with ordinality as types(type_oid, ordinal)
      order by types.ordinal
   )
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_claim_identity_assistance_jobs(text,integer,uuid)'
    )),
  array[
    'text', 'integer', 'uuid', 'uuid', 'uuid', 'text', 'text', 'text',
    'text', 'text', 'uuid', 'timestamp with time zone', 'integer'
  ]::text[],
  'claim exposes exactly the approved input and output types'
);
select is(
  (select procedures.proargnames
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_fail_identity_assistance_job(uuid,uuid,integer,text,boolean,uuid)'
    )),
  array[
    'p_job_id', 'p_lease_id', 'p_attempt', 'p_failure_code',
    'p_retryable', 'p_request_id'
  ]::text[],
  'failure uses the exact six parameter names and order'
);
select is(
  (select procedures.proargnames
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_cleanup_identity_assistance(integer,timestamp with time zone,uuid)'
    )),
  array['p_batch_size', 'p_cutoff_time', 'p_request_id']::text[],
  'cleanup uses the exact three parameter names and order'
);
select ok(
  (select procedures.provolatile = 'v'
      and procedures.prosecdef
      and procedures.proretset
      and procedures.proconfig = array['search_path=pg_catalog']::text[]
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_claim_identity_assistance_jobs(text,integer,uuid)'
    )),
  'claim is volatile security-definer set-returning with fixed search path'
);
select ok(
  (select procedures.provolatile = 'v'
      and procedures.prosecdef
      and not procedures.proretset
      and procedures.prorettype = 'void'::pg_catalog.regtype
      and procedures.proconfig = array['search_path=pg_catalog']::text[]
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_fail_identity_assistance_job(uuid,uuid,integer,text,boolean,uuid)'
    )),
  'failure is volatile security-definer void with fixed search path'
);
select ok(
  (select procedures.provolatile = 'v'
      and procedures.prosecdef
      and not procedures.proretset
      and procedures.prorettype = 'void'::pg_catalog.regtype
      and procedures.proconfig = array['search_path=pg_catalog']::text[]
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_cleanup_identity_assistance(integer,timestamp with time zone,uuid)'
    )),
  'cleanup is volatile security-definer void with fixed search path'
);

with functions(signature) as (values
  ('public.service_claim_identity_assistance_jobs(text,integer,uuid)'),
  ('public.service_fail_identity_assistance_job(uuid,uuid,integer,text,boolean,uuid)'),
  ('public.service_cleanup_identity_assistance(integer,timestamp with time zone,uuid)')
), roles(role_name, expected) as (values
  ('public', false), ('anon', false), ('authenticated', false),
  ('service_role', true)
)
select is(
  case
    when pg_catalog.to_regprocedure(functions.signature) is null then false
    else pg_catalog.has_function_privilege(
      roles.role_name,
      pg_catalog.to_regprocedure(functions.signature),
      'execute'
    )
  end,
  roles.expected,
  roles.role_name || ' execute privilege is exact for ' || functions.signature
)
from functions cross join roles;

select is(
  (select pg_catalog.format_type(attributes.atttypid, attributes.atttypmod)
     from pg_catalog.pg_attribute as attributes
    where attributes.attrelid =
      'private.identity_assistance_service_requests'::pg_catalog.regclass
      and attributes.attname = 'result_count'
      and attributes.attnum > 0
      and not attributes.attisdropped),
  'integer',
  'service requests store a bounded nullable claim result count'
);
select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint as constraints
     where constraints.conrelid =
       'private.identity_assistance_service_requests'::pg_catalog.regclass
       and constraints.contype = 'c'
       and pg_catalog.pg_get_constraintdef(constraints.oid)
         like '%result_count >= 0%result_count <= 10%'
  ),
  'claim result counts are constrained from zero through ten'
);
select is(
  (select attributes.attnotnull
     from pg_catalog.pg_attribute as attributes
    where attributes.attrelid =
      'private.identity_assistance_service_requests'::pg_catalog.regclass
      and attributes.attname = 'result_count'
      and attributes.attnum > 0
      and not attributes.attisdropped),
  false,
  'historical non-claim service rows may retain a null result count'
);

with roles(role_name) as (
  values ('public'), ('anon'), ('authenticated'), ('service_role')
), tables(table_name) as (values
  ('identity_assistance_jobs'),
  ('identity_assistance_candidates'),
  ('identity_assistance_requests'),
  ('identity_assistance_service_requests'),
  ('identity_assistance_claim_results'),
  ('identity_assistance_events'),
  ('identity_assistance_status_reads'),
  ('identity_proposal_evidence')
), privileges(privilege_name) as (
  values ('select'), ('insert'), ('update'), ('delete')
)
select ok(
  not pg_catalog.has_table_privilege(
    roles.role_name,
    'private.' || tables.table_name,
    privileges.privilege_name
  ),
  roles.role_name || ' retains no ' || privileges.privilege_name
    || ' on private.' || tables.table_name
)
from roles cross join tables cross join privileges;

-- Authentication is independent for each RPC and precedes scalar/table work.
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(null, null, null)$$,
  '42501', 'service_role_required',
  'claim independently requires the service role before scalar validation'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      null, null, null, null, null, null
    )$$,
  '42501', 'service_role_required',
  'failure independently requires the service role before scalar validation'
);
select throws_ok(
  $$select public.service_cleanup_identity_assistance(null, null, null)$$,
  '42501', 'service_role_required',
  'cleanup independently requires the service role before scalar validation'
);
reset role;

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      null, 1, '00000000-0000-4000-8000-000000009001'
    )$$,
  '22023', 'invalid_identity_assistance_claim',
  'claim rejects a null worker id before table work'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'bad worker', 1, '00000000-0000-4000-8000-000000009002'
    )$$,
  '22023', 'invalid_identity_assistance_claim',
  'claim enforces the bounded worker-id grammar'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker.' || repeat('a', 64), 1,
      '00000000-0000-4000-8000-000000009003'
    )$$,
  '22023', 'invalid_identity_assistance_claim',
  'claim bounds worker ids at 64 characters'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker-a', 0, '00000000-0000-4000-8000-000000009004'
    )$$,
  '22023', 'invalid_identity_assistance_claim',
  'claim rejects limit zero'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker-a', 11, '00000000-0000-4000-8000-000000009005'
    )$$,
  '22023', 'invalid_identity_assistance_claim',
  'claim rejects limits above ten'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker-a', 1, null
    )$$,
  '22023', 'invalid_identity_assistance_claim',
  'claim requires a non-null request id'
);

select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      null, '00000000-0000-4000-8000-000000009010', 1,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009011'
    )$$,
  '22023', 'invalid_identity_assistance_failure',
  'failure rejects null identifiers before lease lookup'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009012',
      '00000000-0000-4000-8000-000000009013', 0,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009014'
    )$$,
  '22023', 'invalid_identity_assistance_failure',
  'failure attempts start at one'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009015',
      '00000000-0000-4000-8000-000000009016', 4,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009017'
    )$$,
  '22023', 'invalid_identity_assistance_failure',
  'failure attempts are bounded at three'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009018',
      '00000000-0000-4000-8000-000000009019', 1,
      'lease_expired', false,
      '00000000-0000-4000-8000-000000009020'
    )$$,
  '22023', 'invalid_identity_assistance_failure',
  'worker failure cannot write the sweeper-only lease-expired code'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009021',
      '00000000-0000-4000-8000-000000009022', 1,
      'source_invalidated', false,
      '00000000-0000-4000-8000-000000009023'
    )$$,
  '22023', 'invalid_identity_assistance_failure',
  'worker failure cannot write the deletion-only source-invalidated code'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009024',
      '00000000-0000-4000-8000-000000009025', 1,
      'invalid_input', true,
      '00000000-0000-4000-8000-000000009026'
    )$$,
  '22023', 'invalid_identity_assistance_failure',
  'invalid-input failures cannot be retryable'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009027',
      '00000000-0000-4000-8000-000000009028', 1,
      'quality_rejected', true,
      '00000000-0000-4000-8000-000000009029'
    )$$,
  '22023', 'invalid_identity_assistance_failure',
  'quality-rejected failures cannot be retryable'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009030',
      '00000000-0000-4000-8000-000000009031', 1,
      'fabricated', false,
      '00000000-0000-4000-8000-000000009032'
    )$$,
  '22023', 'invalid_identity_assistance_failure',
  'failure rejects non-allowlisted codes before enum casts or table work'
);

select throws_ok(
  $$select public.service_cleanup_identity_assistance(
      0, pg_catalog.clock_timestamp(),
      '00000000-0000-4000-8000-000000009033'
    )$$,
  '22023', 'invalid_identity_assistance_cleanup',
  'cleanup rejects batch zero'
);
select throws_ok(
  $$select public.service_cleanup_identity_assistance(
      51, pg_catalog.clock_timestamp(),
      '00000000-0000-4000-8000-000000009034'
    )$$,
  '22023', 'invalid_identity_assistance_cleanup',
  'cleanup rejects batches above fifty'
);
select throws_ok(
  $$select public.service_cleanup_identity_assistance(
      1, null, '00000000-0000-4000-8000-000000009035'
    )$$,
  '22023', 'invalid_identity_assistance_cleanup',
  'cleanup requires a non-null cutoff'
);
select throws_ok(
  $$select public.service_cleanup_identity_assistance(
      1, pg_catalog.clock_timestamp() + interval '1 day',
      '00000000-0000-4000-8000-000000009036'
    )$$,
  '22023', 'invalid_identity_assistance_cleanup',
  'cleanup rejects a cutoff later than its post-wait wall clock'
);
select throws_ok(
  $$select public.service_cleanup_identity_assistance(
      1, pg_catalog.clock_timestamp(), null
    )$$,
  '22023', 'invalid_identity_assistance_cleanup',
  'cleanup requires a non-null request id'
);
reset role;

-- Canonical media fixtures for ordinary claim/failure behavior.
set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values (
  '00000000-0000-4000-8000-000000009100',
  'Task 4 Service Lifecycle Owner', pg_catalog.now()
);
set local session_replication_role = origin;

insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk,
  visibility, client_dedupe_key
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9100 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000009100',
       '2026-06-01 00:00:00+00'::timestamptz,
       '8928308280fffff', 'morning', 'normal', 'limited',
       'task4-service-lifecycle-' || fixture::text
  from pg_catalog.generate_series(1, 60) as fixtures(fixture);

insert into public.media_assets (
  id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
  redaction_confirmed_at, training_eligible, client_media_id, byte_length,
  width, height, recipe_version, detector_versions, status, reviewed_at
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9200 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9100 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000009100', 'media-staging',
       'jobs/' || pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9250 + fixture)::text, 12, '0')
       ) || '.jpg',
       pg_catalog.md5('task4-hash-' || fixture::text)
         || pg_catalog.md5('task4-hash-' || fixture::text),
       '2026-06-01 00:00:00+00'::timestamptz, false,
       'task4-media-' || lpad(fixture::text, 2, '0'),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       'quarantined', '2026-06-01 00:00:00+00'::timestamptz
  from pg_catalog.generate_series(1, 60) as fixtures(fixture);

insert into private.media_upload_jobs (
  id, uploader_id, sighting_id, media_id, sha256, byte_length, width, height,
  recipe_version, detector_versions, confirmed_at_local, object_path, status,
  reserved_at, reservation_expires_at, upload_token_expires_at,
  next_cleanup_at, finalized_at, media_asset_id
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9250 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000009100',
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9100 + fixture)::text, 12, '0')
       )::uuid,
       'task4-media-' || lpad(fixture::text, 2, '0'),
       pg_catalog.md5('task4-hash-' || fixture::text)
         || pg_catalog.md5('task4-hash-' || fixture::text),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       '2026-06-01 00:00:00+00'::timestamptz,
       'jobs/' || pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9250 + fixture)::text, 12, '0')
       ) || '.jpg',
       'finalized', '2026-06-01 00:00:00+00'::timestamptz,
       '2026-06-01 00:10:00+00'::timestamptz,
       '2026-06-01 02:00:00+00'::timestamptz,
       'infinity'::timestamptz, '2026-06-01 00:01:00+00'::timestamptz,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9200 + fixture)::text, 12, '0')
       )::uuid
  from pg_catalog.generate_series(1, 60) as fixtures(fixture);

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, notice_version,
  input_sha256, requested_at
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9300 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9100 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', lpad((9200 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000009100', 'notice.v1',
       pg_catalog.md5('task4-hash-' || fixture::text)
         || pg_catalog.md5('task4-hash-' || fixture::text),
       ('2026-06-01 00:00:00+00'::timestamptz
         + fixture * interval '1 minute')
  from pg_catalog.generate_series(1, 5) as fixtures(fixture);

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select results_eq(
  $$select claims."jobId", claims.attempt
      from public.service_claim_identity_assistance_jobs(
        'worker.alpha', 2,
        '00000000-0000-4000-8000-000000009401'
      ) as claims
     order by claims."jobId"$$,
  $$values
      ('00000000-0000-4000-8000-000000009301'::uuid, 1),
      ('00000000-0000-4000-8000-000000009302'::uuid, 1)$$,
  'uncontended claim returns the two oldest requested jobs in order'
);
select is(
  (select requests.result_count
     from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000009401'),
  2,
  'a nonempty original claim stores its exact result count'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_claim_results as results
    where results.request_id = '00000000-0000-4000-8000-000000009401'),
  2::bigint,
  'a nonempty original claim stores one ordered lease result per job'
);
select ok(
  not exists (
    select 1
      from private.identity_assistance_jobs as jobs
     where jobs.id in (
       '00000000-0000-4000-8000-000000009301',
       '00000000-0000-4000-8000-000000009302'
     )
       and (
         jobs.status <> 'processing'
         or jobs.attempt_count <> 1
         or jobs.lease_id is null
         or jobs.lease_expires_at
              is distinct from jobs.processing_at + interval '2 minutes'
       )
  ),
  'claimed jobs increment once and receive an exact two-minute lease'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.job_id in (
      '00000000-0000-4000-8000-000000009301',
      '00000000-0000-4000-8000-000000009302'
    )
      and events.event_type = 'claimed'
      and events.request_id = '00000000-0000-4000-8000-000000009401'),
  2::bigint,
  'claim appends exactly one bounded claimed event per lease'
);
select results_eq(
  $$select *
      from public.service_claim_identity_assistance_jobs(
        'worker.alpha', 2,
        '00000000-0000-4000-8000-000000009401'
      )$$,
  $$select jobs.id, jobs.media_asset_id, jobs.input_sha256,
           jobs.recipe_version, jobs.crop_contract_version,
           jobs.embedding_contract_version, jobs.identify_contract_version,
           results.lease_id, results.lease_expires_at, results.attempt
      from private.identity_assistance_claim_results as results
      join private.identity_assistance_jobs as jobs on jobs.id = results.job_id
     where results.request_id = '00000000-0000-4000-8000-000000009401'
     order by results.ordinal$$,
  'a safe nonempty exact replay reconstructs all ten original ordered values'
);
select is(
  (select pg_catalog.sum(jobs.attempt_count)
     from private.identity_assistance_jobs as jobs
    where jobs.id in (
      '00000000-0000-4000-8000-000000009301',
      '00000000-0000-4000-8000-000000009302'
    )),
  2::bigint,
  'exact claim replay does not increment attempts'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.request_id = '00000000-0000-4000-8000-000000009401'),
  2::bigint,
  'exact claim replay appends no second claimed event'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker.changed', 2,
      '00000000-0000-4000-8000-000000009401'
    )$$,
  'P0001', 'idempotency_conflict',
  'claim request reuse with a changed canonical payload conflicts'
);
select throws_ok(
  $$select public.service_cleanup_identity_assistance(
      2, '2026-08-01 00:00:00+00',
      '00000000-0000-4000-8000-000000009401'
    )$$,
  'P0001', 'idempotency_conflict',
  'cross-operation reuse of a claim request id conflicts'
);

select results_eq(
  $$select claims."jobId", claims.attempt
      from public.service_claim_identity_assistance_jobs(
        'worker.beta', 1,
        '00000000-0000-4000-8000-000000009402'
      ) as claims$$,
  $$values ('00000000-0000-4000-8000-000000009303'::uuid, 1)$$,
  'a bounded follow-up claim takes only the next oldest job'
);

-- Invalidate a claimed source, then require all-or-nothing replay denial.
select results_eq(
  $$select claims."jobId"
      from public.service_claim_identity_assistance_jobs(
        'worker.gamma', 1,
        '00000000-0000-4000-8000-000000009404'
      ) as claims$$,
  $$values ('00000000-0000-4000-8000-000000009304'::uuid)$$,
  'a later claim leases the fourth canonical job'
);
select lives_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000009100',
      '00000000-0000-4000-8000-000000009204'
    )$$,
  'governed media deletion invalidates a currently claimed source'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker.gamma', 1,
      '00000000-0000-4000-8000-000000009404'
    )$$,
  'P0001', 'identity_assistance_claim_outcome_unavailable',
  'claim replay after source invalidation returns no partial null or empty projection'
);

select lives_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000009100',
      '00000000-0000-4000-8000-000000009205'
    )$$,
  'governed source invalidation may win before claim'
);
select results_eq(
  $$select claims."jobId"
      from public.service_claim_identity_assistance_jobs(
        'worker.delta', 1,
        '00000000-0000-4000-8000-000000009405'
      ) as claims$$,
  $$select null::uuid where false$$,
  'claim skips a source-invalidated terminal job'
);
select is(
  (select requests.result_count
     from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000009405'),
  0,
  'an original zero-result claim stores zero explicitly'
);
select results_eq(
  $$select claims."jobId"
      from public.service_claim_identity_assistance_jobs(
        'worker.delta', 1,
        '00000000-0000-4000-8000-000000009405'
      ) as claims$$,
  $$select null::uuid where false$$,
  'an exact original zero-result claim replays as zero rows'
);
reset role;

-- Failure semantics use known lease envelopes and prove replay precedes lease
-- validation, retry/terminal policy, stale-attempt isolation, and GUC restore.
insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, lease_id, lease_expires_at, processing_at,
  requested_at
) values
  ('00000000-0000-4000-8000-000000009310',
    '00000000-0000-4000-8000-000000009110',
    '00000000-0000-4000-8000-000000009210',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-10') || pg_catalog.md5('task4-hash-10'), 1,
    '00000000-0000-4000-8000-000000009610',
    pg_catalog.clock_timestamp() + interval '10 minutes',
    pg_catalog.clock_timestamp(), '2026-06-01 00:00:00+00'),
  ('00000000-0000-4000-8000-000000009311',
    '00000000-0000-4000-8000-000000009111',
    '00000000-0000-4000-8000-000000009211',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-11') || pg_catalog.md5('task4-hash-11'), 1,
    '00000000-0000-4000-8000-000000009611',
    pg_catalog.clock_timestamp() + interval '10 minutes',
    pg_catalog.clock_timestamp(), '2026-06-02 00:00:00+00'),
  ('00000000-0000-4000-8000-000000009312',
    '00000000-0000-4000-8000-000000009112',
    '00000000-0000-4000-8000-000000009212',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-12') || pg_catalog.md5('task4-hash-12'), 3,
    '00000000-0000-4000-8000-000000009612',
    pg_catalog.clock_timestamp() + interval '10 minutes',
    pg_catalog.clock_timestamp(), '2026-06-03 00:00:00+00'),
  ('00000000-0000-4000-8000-000000009313',
    '00000000-0000-4000-8000-000000009113',
    '00000000-0000-4000-8000-000000009213',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-13') || pg_catalog.md5('task4-hash-13'), 2,
    '00000000-0000-4000-8000-000000009613',
    pg_catalog.clock_timestamp() + interval '10 minutes',
    pg_catalog.clock_timestamp(), '2026-06-04 00:00:00+00'),
  ('00000000-0000-4000-8000-000000009314',
    '00000000-0000-4000-8000-000000009114',
    '00000000-0000-4000-8000-000000009214',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-14') || pg_catalog.md5('task4-hash-14'), 1,
    '00000000-0000-4000-8000-000000009614',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
    '2026-06-14 00:00:00+00');

select pg_catalog.set_config(
  'private.identity_assistance_job_writer', 'task4-outer-fail-writer', true
);
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009310',
      '00000000-0000-4000-8000-000000009610', 1,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009410'
    )$$,
  'a retryable provider failure releases an early attempt'
);
select ok(
  (select jobs.status = 'requested'
      and jobs.attempt_count = 1
      and jobs.lease_id is null
      and jobs.lease_expires_at is null
      and jobs.processing_at is null
      and jobs.failed_at is null
      and jobs.failure_code is null
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009310'),
  'retry release preserves attempt provenance and clears the lease envelope'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.job_id = '00000000-0000-4000-8000-000000009310'
      and events.event_type = 'retry_released'
      and events.failure_code = 'provider_unavailable'
      and events.request_id = '00000000-0000-4000-8000-000000009410'),
  1::bigint,
  'retryable worker failure appends one bounded retry event'
);
select lives_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009310',
      '00000000-0000-4000-8000-000000009610', 1,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009410'
    )$$,
  'exact failure replay succeeds before observing the now-stale lease'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.request_id = '00000000-0000-4000-8000-000000009410'),
  1::bigint,
  'exact failure replay creates no second event'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000009410'),
  1::bigint,
  'exact failure replay creates no second service request'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009310',
      '00000000-0000-4000-8000-000000009610', 1,
      'internal_error', true,
      '00000000-0000-4000-8000-000000009410'
    )$$,
  'P0001', 'idempotency_conflict',
  'changed failure payload reuse conflicts before lease state'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker.fail-cross-operation', 1,
      '00000000-0000-4000-8000-000000009410'
    )$$,
  'P0001', 'idempotency_conflict',
  'cross-operation reuse of a failure request conflicts'
);

select lives_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009311',
      '00000000-0000-4000-8000-000000009611', 1,
      'internal_error', false,
      '00000000-0000-4000-8000-000000009411'
    )$$,
  'a non-retryable internal failure becomes terminal'
);
select ok(
  (select jobs.status = 'failed'
      and jobs.failure_code = 'internal_error'
      and jobs.failed_at is not null
      and jobs.lease_id is null
      and jobs.lease_expires_at is null
      and jobs.processing_at is null
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009311'),
  'terminal worker failure preserves bounded source provenance and clears lease state'
);
select lives_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009312',
      '00000000-0000-4000-8000-000000009612', 3,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009412'
    )$$,
  'a retryable third attempt still becomes terminal'
);
select ok(
  (select jobs.status = 'failed'
      and jobs.attempt_count = 3
      and jobs.failure_code = 'provider_unavailable'
      and jobs.failed_at is not null
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009312'),
  'attempt three cannot return to requested from the failure RPC'
);

select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009313',
      '00000000-0000-4000-8000-000000009699', 2,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009413'
    )$$,
  'P0001', 'identity_assistance_lease_not_current',
  'a mismatched lease id cannot fail a current attempt'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000009413'),
  0::bigint,
  'a stale lease failure writes no service request'
);
select ok(
  (select jobs.status = 'processing'
      and jobs.lease_id = '00000000-0000-4000-8000-000000009613'
      and jobs.attempt_count = 2
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009313'),
  'a stale lease failure leaves current state unchanged'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009314',
      '00000000-0000-4000-8000-000000009614', 1,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009414'
    )$$,
  'P0001', 'identity_assistance_lease_not_current',
  'lease equality or any post-wait expiry is not current under strict greater-than'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000009414'),
  0::bigint,
  'expired failure writes no service request or state transition'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_job_writer', true),
  'task4-outer-fail-writer',
  'failure restores the caller job-writer context on normal and denial paths'
);

select results_eq(
  $$select claims."jobId", claims.attempt
      from public.service_claim_identity_assistance_jobs(
        'worker.retry', 1,
        '00000000-0000-4000-8000-000000009415'
      ) as claims$$,
  $$values ('00000000-0000-4000-8000-000000009310'::uuid, 2)$$,
  'a released failure is claimed as the next numbered attempt'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000009310',
      '00000000-0000-4000-8000-000000009610', 1,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000009416'
    )$$,
  'P0001', 'identity_assistance_lease_not_current',
  'a stale attempt cannot mutate the newer lease'
);
select ok(
  (select jobs.status = 'processing'
      and jobs.attempt_count = 2
      and jobs.lease_id <> '00000000-0000-4000-8000-000000009610'
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009310'),
  'newer lease state survives a stale prior-attempt failure'
);
reset role;
select pg_catalog.set_config('private.identity_assistance_job_writer', '', true);

-- Expired attempts are swept before requested selection. Attempts one/two
-- release once; attempt three becomes terminal once; replay never sweeps.
insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, lease_id, lease_expires_at, processing_at,
  requested_at
) values
  ('00000000-0000-4000-8000-000000009320',
    '00000000-0000-4000-8000-000000009120',
    '00000000-0000-4000-8000-000000009220',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-20') || pg_catalog.md5('task4-hash-20'), 1,
    '00000000-0000-4000-8000-000000009620',
    pg_catalog.clock_timestamp() - interval '1 minute',
    pg_catalog.clock_timestamp() - interval '3 minutes',
    '2026-05-20 00:00:00+00'),
  ('00000000-0000-4000-8000-000000009321',
    '00000000-0000-4000-8000-000000009121',
    '00000000-0000-4000-8000-000000009221',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-21') || pg_catalog.md5('task4-hash-21'), 2,
    '00000000-0000-4000-8000-000000009621',
    pg_catalog.clock_timestamp() - interval '1 minute',
    pg_catalog.clock_timestamp() - interval '3 minutes',
    '2026-05-21 00:00:00+00'),
  ('00000000-0000-4000-8000-000000009322',
    '00000000-0000-4000-8000-000000009122',
    '00000000-0000-4000-8000-000000009222',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-22') || pg_catalog.md5('task4-hash-22'), 3,
    '00000000-0000-4000-8000-000000009622',
    pg_catalog.clock_timestamp() - interval '1 minute',
    pg_catalog.clock_timestamp() - interval '3 minutes',
    '2026-05-22 00:00:00+00');

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select results_eq(
  $$select claims."jobId", claims.attempt
      from public.service_claim_identity_assistance_jobs(
        'worker.sweeper', 1,
        '00000000-0000-4000-8000-000000009420'
      ) as claims$$,
  $$values ('00000000-0000-4000-8000-000000009320'::uuid, 2)$$,
  'sweeper releases expired work before claiming the oldest released job'
);
select ok(
  (select jobs.status = 'requested'
      and jobs.attempt_count = 2
      and jobs.lease_id is null
      and jobs.lease_expires_at is null
      and jobs.processing_at is null
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009321'),
  'expired attempt two is released without incrementing until a new claim'
);
select ok(
  (select jobs.status = 'failed'
      and jobs.attempt_count = 3
      and jobs.failure_code = 'lease_expired'
      and jobs.failed_at is not null
      and jobs.lease_id is null
      and jobs.lease_expires_at is null
      and jobs.processing_at is null
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009322'),
  'expired attempt three becomes terminal with the sweeper-only code'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.job_id in (
      '00000000-0000-4000-8000-000000009320',
      '00000000-0000-4000-8000-000000009321'
    )
      and events.event_type = 'retry_released'
      and events.failure_code = 'lease_expired'
      and events.reason_code = 'lease_expired'),
  2::bigint,
  'expired attempts one and two are released exactly once'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.job_id = '00000000-0000-4000-8000-000000009322'
      and events.event_type = 'failed'
      and events.failure_code = 'lease_expired'
      and events.reason_code = 'lease_expired'),
  1::bigint,
  'expired attempt three appends one terminal event'
);
select lives_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker.sweeper', 1,
      '00000000-0000-4000-8000-000000009420'
    )$$,
  'exact claim replay remains available after sweeping'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.job_id in (
      '00000000-0000-4000-8000-000000009320',
      '00000000-0000-4000-8000-000000009321',
      '00000000-0000-4000-8000-000000009322'
    )),
  4::bigint,
  'exact claim replay does not run the expired-lease sweeper again'
);
select results_eq(
  $$select claims."jobId", claims.attempt
      from public.service_claim_identity_assistance_jobs(
        'worker.sweeper-next', 10,
        '00000000-0000-4000-8000-000000009421'
      ) as claims
     where claims."jobId" = '00000000-0000-4000-8000-000000009321'$$,
  $$values ('00000000-0000-4000-8000-000000009321'::uuid, 3)$$,
  'released attempt two can be claimed only as attempt three'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs as jobs
    where jobs.attempt_count > 3),
  0::bigint,
  'attempt four remains impossible after claim and sweep cycles'
);
reset role;

-- CI-only committed interleavings use the established local SCRAM/dblink
-- pattern. They prove SKIP LOCKED/disjoint leasing and lower-resource-first
-- claim-versus-deletion serialization rather than simulating concurrency.
set local statement_timeout = '45s';
select lives_ok(
  $orchestrator$
  do $main$
  declare
    first_job uuid;
    second_job uuid;
    first_lease uuid;
    second_lease uuid;
    delete_pid integer;
    claim_pid integer;
    wait_deadline timestamptz;
    claim_waited_for_delete boolean := false;
    delete_claim_count bigint;
    delete_job_actionable bigint;
    local_connection text :=
      'host=' || pg_catalog.host(pg_catalog.inet_server_addr())
      || ' port=' || pg_catalog.current_setting('port')
      || ' dbname=' || pg_catalog.current_database()
      || ' user=' || session_user
      || ' password=' || session_user;
  begin
    perform extensions.dblink_connect(
      'task4_service_setup',
      local_connection || ' application_name=task4_service_setup'
    );
    perform extensions.dblink_exec(
      'task4_service_setup', 'set session_replication_role = replica'
    );
    perform extensions.dblink_exec(
      'task4_service_setup',
      $remote$
        insert into public.user_profiles (id, public_name, adult_confirmed_at)
        values (
          '00000000-0000-4000-8000-000000008800',
          'Task 4 Concurrent Claim Owner', pg_catalog.now()
        );
      $remote$
    );
    perform extensions.dblink_exec(
      'task4_service_setup', 'set session_replication_role = origin'
    );
    perform extensions.dblink_exec(
      'task4_service_setup',
      $remote$
        insert into public.sightings (
          id, reporter_id, occurred_at, public_cell_id, time_bucket, risk,
          visibility, client_dedupe_key
        )
        select pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8810 + fixture)::text, 12, '0')
               )::uuid,
               '00000000-0000-4000-8000-000000008800',
               pg_catalog.now(), '8928308280fffff', 'morning', 'normal',
               'limited', 'task4-concurrent-claim-' || fixture::text
          from pg_catalog.generate_series(0, 3) as fixtures(fixture);
        insert into public.media_assets (
          id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
          redaction_confirmed_at, training_eligible, client_media_id,
          byte_length, width, height, recipe_version, detector_versions,
          status, reviewed_at
        )
        select pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8820 + fixture)::text, 12, '0')
               )::uuid,
               pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8810 + fixture)::text, 12, '0')
               )::uuid,
               '00000000-0000-4000-8000-000000008800', 'media-staging',
               'jobs/' || pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8830 + fixture)::text, 12, '0')
               ) || '.jpg', repeat('a', 64), pg_catalog.now(), false,
               'task4-concurrent-media-' || fixture::text,
               4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
               '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
               'quarantined', pg_catalog.now()
          from pg_catalog.generate_series(0, 3) as fixtures(fixture);
        insert into private.media_upload_jobs (
          id, uploader_id, sighting_id, media_id, sha256, byte_length, width,
          height, recipe_version, detector_versions, confirmed_at_local,
          object_path, status, reserved_at, reservation_expires_at,
          upload_token_expires_at, next_cleanup_at, finalized_at, media_asset_id
        )
        select pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8830 + fixture)::text, 12, '0')
               )::uuid,
               '00000000-0000-4000-8000-000000008800',
               pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8810 + fixture)::text, 12, '0')
               )::uuid,
               'task4-concurrent-media-' || fixture::text, repeat('a', 64),
               4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
               '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
               pg_catalog.now(),
               'jobs/' || pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8830 + fixture)::text, 12, '0')
               ) || '.jpg', 'finalized', pg_catalog.now(),
               pg_catalog.now() + interval '10 minutes',
               pg_catalog.now() + interval '1 hour', 'infinity'::timestamptz,
               pg_catalog.now(),
               pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8820 + fixture)::text, 12, '0')
               )::uuid
          from pg_catalog.generate_series(0, 3) as fixtures(fixture);
        insert into private.identity_assistance_jobs (
          id, sighting_id, media_asset_id, requester_id, notice_version,
          input_sha256, requested_at
        )
        select pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8840 + fixture)::text, 12, '0')
               )::uuid,
               pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8810 + fixture)::text, 12, '0')
               )::uuid,
               pg_catalog.format(
                 '00000000-0000-4000-8000-%s',
                 pg_catalog.lpad((8820 + fixture)::text, 12, '0')
               )::uuid,
               '00000000-0000-4000-8000-000000008800', 'notice.v1',
               repeat('a', 64), pg_catalog.now() + fixture * interval '1 second'
          from pg_catalog.generate_series(0, 3) as fixtures(fixture);
      $remote$
    );

    perform extensions.dblink_connect(
      'task4_service_locker',
      local_connection || ' application_name=task4_service_locker'
    );
    perform extensions.dblink_connect(
      'task4_service_claim_one',
      local_connection || ' application_name=task4_service_claim_one'
    );
    perform extensions.dblink_connect(
      'task4_service_claim_two',
      local_connection || ' application_name=task4_service_claim_two'
    );
    perform extensions.dblink_exec(
      'task4_service_locker', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec(
      'task4_service_claim_one', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec(
      'task4_service_claim_two', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec('task4_service_locker', 'begin');
    perform * from extensions.dblink(
      'task4_service_locker',
      $remote$
        select id from private.identity_assistance_jobs
         where id = '00000000-0000-4000-8000-000000008840'
         for update
      $remote$
    ) as locked_job(id uuid);
    perform extensions.dblink_exec('task4_service_claim_one', 'set role service_role');
    perform extensions.dblink_exec(
      'task4_service_claim_one',
      'set request.jwt.claim.role = ''service_role'''
    );
    perform extensions.dblink_exec('task4_service_claim_two', 'set role service_role');
    perform extensions.dblink_exec(
      'task4_service_claim_two',
      'set request.jwt.claim.role = ''service_role'''
    );
    select remote_job, remote_lease into first_job, first_lease
      from extensions.dblink(
        'task4_service_claim_one',
        $remote$
          select claims."jobId", claims."leaseId"
            from public.service_claim_identity_assistance_jobs(
              'worker.contention.one', 1,
              '00000000-0000-4000-8000-000000008851'
            ) as claims
        $remote$
      ) as first_claim(remote_job uuid, remote_lease uuid);
    select remote_job, remote_lease into second_job, second_lease
      from extensions.dblink(
        'task4_service_claim_two',
        $remote$
          select claims."jobId", claims."leaseId"
            from public.service_claim_identity_assistance_jobs(
              'worker.contention.two', 1,
              '00000000-0000-4000-8000-000000008852'
            ) as claims
        $remote$
      ) as second_claim(remote_job uuid, remote_lease uuid);
    perform extensions.dblink_exec('task4_service_locker', 'commit');
    perform extensions.dblink_disconnect('task4_service_locker');
    perform extensions.dblink_disconnect('task4_service_claim_one');
    perform extensions.dblink_disconnect('task4_service_claim_two');

    if first_job is distinct from '00000000-0000-4000-8000-000000008841'::uuid then
      raise exception 'task4_claim_did_not_skip_locked_oldest';
    end if;
    if second_job is distinct from '00000000-0000-4000-8000-000000008842'::uuid
       or second_job is not distinct from first_job
       or second_lease is not distinct from first_lease then
      raise exception 'task4_claimers_duplicated_job_or_lease';
    end if;

    perform extensions.dblink_exec(
      'task4_service_setup', 'set session_replication_role = replica'
    );
    perform extensions.dblink_exec(
      'task4_service_setup',
      $remote$
        delete from private.identity_assistance_claim_results
         where request_id in (
           '00000000-0000-4000-8000-000000008851',
           '00000000-0000-4000-8000-000000008852'
         );
        delete from private.identity_assistance_service_requests
         where request_id in (
           '00000000-0000-4000-8000-000000008851',
           '00000000-0000-4000-8000-000000008852'
         );
        delete from private.identity_assistance_events
         where job_id between
           '00000000-0000-4000-8000-000000008840'
           and '00000000-0000-4000-8000-000000008843';
        delete from private.identity_assistance_jobs
         where id between
           '00000000-0000-4000-8000-000000008840'
           and '00000000-0000-4000-8000-000000008843';
        delete from private.media_upload_jobs
         where id between
           '00000000-0000-4000-8000-000000008830'
           and '00000000-0000-4000-8000-000000008833';
        delete from public.media_assets
         where id between
           '00000000-0000-4000-8000-000000008820'
           and '00000000-0000-4000-8000-000000008823';
        delete from public.sightings
         where id between
           '00000000-0000-4000-8000-000000008810'
           and '00000000-0000-4000-8000-000000008813';
        delete from public.user_profiles
         where id = '00000000-0000-4000-8000-000000008800';
      $remote$
    );

    perform extensions.dblink_exec(
      'task4_service_setup',
      $remote$
        insert into public.user_profiles (id, public_name, adult_confirmed_at)
        values (
          '00000000-0000-4000-8000-000000008900',
          'Task 4 Deletion Race Owner', pg_catalog.now()
        );
      $remote$
    );
    perform extensions.dblink_exec(
      'task4_service_setup', 'set session_replication_role = origin'
    );
    perform extensions.dblink_exec(
      'task4_service_setup',
      $remote$
        insert into public.sightings (
          id, reporter_id, occurred_at, public_cell_id, time_bucket, risk,
          visibility, client_dedupe_key
        ) values (
          '00000000-0000-4000-8000-000000008910',
          '00000000-0000-4000-8000-000000008900', pg_catalog.now(),
          '8928308280fffff', 'morning', 'normal', 'limited',
          'task4-claim-delete-race'
        );
        insert into public.media_assets (
          id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
          redaction_confirmed_at, training_eligible, client_media_id,
          byte_length, width, height, recipe_version, detector_versions,
          status, reviewed_at
        ) values (
          '00000000-0000-4000-8000-000000008920',
          '00000000-0000-4000-8000-000000008910',
          '00000000-0000-4000-8000-000000008900', 'media-staging',
          'jobs/00000000-0000-4000-8000-000000008930.jpg', repeat('b', 64),
          pg_catalog.now(), false, 'task4-delete-race-media', 4096, 512, 512,
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
          '00000000-0000-4000-8000-000000008930',
          '00000000-0000-4000-8000-000000008900',
          '00000000-0000-4000-8000-000000008910', 'task4-delete-race-media',
          repeat('b', 64), 4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
          '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
          pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000008930.jpg',
          'finalized', pg_catalog.now(), pg_catalog.now() + interval '10 minutes',
          pg_catalog.now() + interval '1 hour', 'infinity'::timestamptz,
          pg_catalog.now(), '00000000-0000-4000-8000-000000008920'
        );
        insert into private.identity_assistance_jobs (
          id, sighting_id, media_asset_id, requester_id, notice_version,
          input_sha256, requested_at
        ) values (
          '00000000-0000-4000-8000-000000008940',
          '00000000-0000-4000-8000-000000008910',
          '00000000-0000-4000-8000-000000008920',
          '00000000-0000-4000-8000-000000008900', 'notice.v1',
          repeat('b', 64), pg_catalog.now()
        );
      $remote$
    );
    perform extensions.dblink_connect(
      'task4_service_delete',
      local_connection || ' application_name=task4_service_delete'
    );
    perform extensions.dblink_connect(
      'task4_service_delete_claim',
      local_connection || ' application_name=task4_service_delete_claim'
    );
    perform extensions.dblink_exec(
      'task4_service_delete', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec(
      'task4_service_delete_claim', 'set statement_timeout = ''12s'''
    );
    perform extensions.dblink_exec('task4_service_delete', 'begin');
    perform extensions.dblink_exec(
      'task4_service_delete',
      $remote$
        do $lock$
        begin
          perform 1 from public.sightings
           where id = '00000000-0000-4000-8000-000000008910' for update;
          perform 1 from private.media_upload_jobs
           where id = '00000000-0000-4000-8000-000000008930' for update;
          perform 1 from public.media_assets
           where id = '00000000-0000-4000-8000-000000008920' for update;
        end
        $lock$;
      $remote$
    );
    perform extensions.dblink_exec(
      'task4_service_delete_claim', 'set role service_role'
    );
    perform extensions.dblink_exec(
      'task4_service_delete_claim',
      'set request.jwt.claim.role = ''service_role'''
    );
    select remote_pid into delete_pid
      from extensions.dblink(
        'task4_service_delete', 'select pg_catalog.pg_backend_pid()'
      ) as backend(remote_pid integer);
    select remote_pid into claim_pid
      from extensions.dblink(
        'task4_service_delete_claim', 'select pg_catalog.pg_backend_pid()'
      ) as backend(remote_pid integer);
    perform extensions.dblink_send_query(
      'task4_service_delete_claim',
      $remote$
        select pg_catalog.count(*)
          from public.service_claim_identity_assistance_jobs(
            'worker.delete-race', 1,
            '00000000-0000-4000-8000-000000008951'
          )
      $remote$
    );
    wait_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
    loop
      if delete_pid = any(pg_catalog.pg_blocking_pids(claim_pid)) then
        claim_waited_for_delete := true;
        exit;
      end if;
      exit when extensions.dblink_is_busy('task4_service_delete_claim') = 0;
      if pg_catalog.clock_timestamp() >= wait_deadline then
        raise exception 'task4_claim_delete_lock_observation_timeout';
      end if;
      perform pg_catalog.pg_sleep(0.01);
    end loop;
    perform * from extensions.dblink(
      'task4_service_delete',
      $remote$
        select storage_bucket, storage_path, remove_immediately
          from public.server_request_media_deletion(
            '00000000-0000-4000-8000-000000008900',
            '00000000-0000-4000-8000-000000008920'
          )
      $remote$
    ) as deleted_media(
      storage_bucket text, storage_path text, remove_immediately boolean
    );
    perform extensions.dblink_exec('task4_service_delete', 'commit');
    wait_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
    while extensions.dblink_is_busy('task4_service_delete_claim') = 1 loop
      if pg_catalog.clock_timestamp() >= wait_deadline then
        raise exception 'task4_claim_delete_revalidation_timeout';
      end if;
      perform pg_catalog.pg_sleep(0.01);
    end loop;
    select remote_count into delete_claim_count
      from extensions.dblink_get_result('task4_service_delete_claim')
        as claim_result(remote_count bigint);
    select remote_count into delete_job_actionable
      from extensions.dblink(
        'task4_service_setup',
        $remote$
          select pg_catalog.count(*)
            from private.identity_assistance_jobs
           where id = '00000000-0000-4000-8000-000000008940'
             and (
               status in ('requested', 'processing')
               or lease_id is not null
             )
        $remote$
      ) as state(remote_count bigint);
    perform extensions.dblink_disconnect('task4_service_delete');
    perform extensions.dblink_disconnect('task4_service_delete_claim');

    perform extensions.dblink_exec(
      'task4_service_setup', 'set session_replication_role = replica'
    );
    perform extensions.dblink_exec(
      'task4_service_setup',
      $remote$
        delete from private.identity_assistance_claim_results
         where request_id = '00000000-0000-4000-8000-000000008951';
        delete from private.identity_assistance_service_requests
         where request_id = '00000000-0000-4000-8000-000000008951';
        delete from private.identity_assistance_events
         where job_id = '00000000-0000-4000-8000-000000008940';
        delete from private.identity_assistance_jobs
         where id = '00000000-0000-4000-8000-000000008940';
        delete from private.media_upload_jobs
         where id = '00000000-0000-4000-8000-000000008930';
        delete from public.media_assets
         where id = '00000000-0000-4000-8000-000000008920';
        delete from public.sightings
         where id = '00000000-0000-4000-8000-000000008910';
        delete from public.user_profiles
         where id = '00000000-0000-4000-8000-000000008900';
      $remote$
    );
    perform extensions.dblink_disconnect('task4_service_setup');

    if not claim_waited_for_delete then
      raise exception 'task4_claim_did_not_wait_for_lower_resource';
    end if;
    if delete_claim_count <> 0 or delete_job_actionable <> 0 then
      raise exception 'task4_claim_delete_left_actionable_lease';
    end if;
  end
  $main$;
  $orchestrator$,
  'two claim sessions skip locked work without duplication and deletion wins safely'
);

-- Cleanup owns only unselected operational retention. The fixtures distinguish
-- the seven-day expiration boundary, thirty-day terminal deletion boundary,
-- total-batch ordering, selected/evidence exclusions, and ledger minimization.
insert into public.animals (id, primary_alias, confirmed_photo_count)
values
  ('00000000-0000-4000-8000-000000009601', 'Task 4 Candidate One', 3),
  ('00000000-0000-4000-8000-000000009602', 'Task 4 Candidate Two', 3);

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, requested_at, attempt_count, lease_id, lease_expires_at,
  processing_at, completed_at, failed_at, cancelled_at, expires_at,
  selected_at, model_version, callback_contract_version, new_cat_recommended,
  failure_code
) values
  ('00000000-0000-4000-8000-000000009340',
    '00000000-0000-4000-8000-000000009140',
    '00000000-0000-4000-8000-000000009240',
    '00000000-0000-4000-8000-000000009100', 'succeeded', 'notice.v1',
    pg_catalog.md5('task4-hash-40') || pg_catalog.md5('task4-hash-40'),
    '2026-07-01 00:00:00+00', 1, null, null, null,
    '2026-07-10 00:00:00+00', null, null, '2026-07-20 00:00:00+00',
    null, 'identity.v1', 'identify-callback.v1', false, null),
  ('00000000-0000-4000-8000-000000009341',
    '00000000-0000-4000-8000-000000009141',
    '00000000-0000-4000-8000-000000009241',
    '00000000-0000-4000-8000-000000009100', 'failed', 'notice.v1',
    pg_catalog.md5('task4-hash-41') || pg_catalog.md5('task4-hash-41'),
    '2026-05-01 00:00:00+00', 1, null, null, null, null,
    '2026-06-01 00:00:00+00', null, null, null, null, null, null,
    'internal_error'),
  ('00000000-0000-4000-8000-000000009342',
    '00000000-0000-4000-8000-000000009142',
    '00000000-0000-4000-8000-000000009242',
    '00000000-0000-4000-8000-000000009100', 'cancelled', 'notice.v1',
    pg_catalog.md5('task4-hash-42') || pg_catalog.md5('task4-hash-42'),
    '2026-05-02 00:00:00+00', 0, null, null, null, null, null,
    '2026-06-02 00:00:00+00', null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000009343',
    '00000000-0000-4000-8000-000000009143', null, null,
    'expired', 'notice.v1', null, '2026-05-03 00:00:00+00', 1,
    null, null, null, null, null, null, '2026-06-03 00:00:00+00',
    null, null, null, null, null),
  ('00000000-0000-4000-8000-000000009344',
    '00000000-0000-4000-8000-000000009144',
    '00000000-0000-4000-8000-000000009244',
    '00000000-0000-4000-8000-000000009100', 'requested', 'notice.v1',
    pg_catalog.md5('task4-hash-44') || pg_catalog.md5('task4-hash-44'),
    '2026-05-04 00:00:00+00', 0, null, null, null, null, null,
    null, null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000009345',
    '00000000-0000-4000-8000-000000009145',
    '00000000-0000-4000-8000-000000009245',
    '00000000-0000-4000-8000-000000009100', 'processing', 'notice.v1',
    pg_catalog.md5('task4-hash-45') || pg_catalog.md5('task4-hash-45'),
    '2026-05-05 00:00:00+00', 1,
    '00000000-0000-4000-8000-000000009645',
    pg_catalog.clock_timestamp() + interval '1 day',
    pg_catalog.clock_timestamp(), null, null, null, null,
    null, null, null, null, null),
  ('00000000-0000-4000-8000-000000009346',
    '00000000-0000-4000-8000-000000009146',
    '00000000-0000-4000-8000-000000009246',
    '00000000-0000-4000-8000-000000009100', 'succeeded', 'notice.v1',
    pg_catalog.md5('task4-hash-46') || pg_catalog.md5('task4-hash-46'),
    '2026-07-29 00:00:00+00', 1, null, null, null,
    '2026-07-30 00:00:00+00', null, null, '2026-07-31 00:00:00+00',
    null, 'identity.v1', 'identify-callback.v1', true, null),
  ('00000000-0000-4000-8000-000000009347',
    '00000000-0000-4000-8000-000000009147',
    '00000000-0000-4000-8000-000000009247',
    '00000000-0000-4000-8000-000000009100', 'succeeded', 'notice.v1',
    pg_catalog.md5('task4-hash-47') || pg_catalog.md5('task4-hash-47'),
    '2026-05-07 00:00:00+00', 1, null, null, null,
    '2026-05-08 00:00:00+00', null, null, '2026-05-15 00:00:00+00',
    '2026-05-09 00:00:00+00', 'identity.v1', 'identify-callback.v1', false, null),
  ('00000000-0000-4000-8000-000000009348',
    '00000000-0000-4000-8000-000000009148',
    '00000000-0000-4000-8000-000000009248',
    '00000000-0000-4000-8000-000000009100', 'succeeded', 'notice.v1',
    pg_catalog.md5('task4-hash-48') || pg_catalog.md5('task4-hash-48'),
    '2026-05-08 00:00:00+00', 1, null, null, null,
    '2026-05-09 00:00:00+00', null, null, '2026-05-16 00:00:00+00',
    '2026-05-10 00:00:00+00', 'identity.v1', 'identify-callback.v1', false, null),
  ('00000000-0000-4000-8000-000000009349',
    '00000000-0000-4000-8000-000000009149',
    '00000000-0000-4000-8000-000000009249',
    '00000000-0000-4000-8000-000000009100', 'succeeded', 'notice.v1',
    pg_catalog.md5('task4-hash-49') || pg_catalog.md5('task4-hash-49'),
    '2026-05-09 00:00:00+00', 1, null, null, null,
    '2026-05-10 00:00:00+00', null, null, '2026-05-17 00:00:00+00',
    '2026-05-11 00:00:00+00', 'identity.v1', 'identify-callback.v1', false, null),
  ('00000000-0000-4000-8000-000000009350',
    '00000000-0000-4000-8000-000000009150',
    '00000000-0000-4000-8000-000000009250',
    '00000000-0000-4000-8000-000000009100', 'succeeded', 'notice.v1',
    pg_catalog.md5('task4-hash-50') || pg_catalog.md5('task4-hash-50'),
    '2026-07-02 00:00:00+00', 1, null, null, null,
    '2026-07-11 00:00:00+00', null, null, '2026-07-21 00:00:00+00',
    null, 'identity.v1', 'identify-callback.v1', true, null);

set local session_replication_role = replica;
insert into private.identity_assistance_candidates (
  job_id, rank, animal_id, confidence_band, reason_codes
) values
  ('00000000-0000-4000-8000-000000009340', 1,
    '00000000-0000-4000-8000-000000009601', 'likely',
    array['face_pattern_similar']::private.identity_assistance_reason_code[]),
  ('00000000-0000-4000-8000-000000009350', 1,
    '00000000-0000-4000-8000-000000009602', 'possible',
    array['coat_marking_similar']::private.identity_assistance_reason_code[]);
set local session_replication_role = origin;

insert into public.identity_proposals (
  id, sighting_id, proposed_animal_id, proposer_id, source, status,
  model_version, confidence_band, reasons, created_at, reviewed_at
) values
  ('00000000-0000-4000-8000-000000009548',
    '00000000-0000-4000-8000-000000009148',
    '00000000-0000-4000-8000-000000009601',
    '00000000-0000-4000-8000-000000009100', 'ai_candidate', 'tentative',
    'identity.v1', 'likely', '["face_pattern_similar"]',
    '2026-05-10 00:00:00+00', null),
  ('00000000-0000-4000-8000-000000009549',
    '00000000-0000-4000-8000-000000009149',
    '00000000-0000-4000-8000-000000009602',
    '00000000-0000-4000-8000-000000009100', 'ai_candidate', 'confirmed',
    'identity.v1', 'possible', '["coat_marking_similar"]',
    '2026-05-11 00:00:00+00', '2026-05-12 00:00:00+00');
insert into public.match_reviews (
  id, proposal_id, reviewer_id, decision, rationale, created_at, request_id
) values (
  '00000000-0000-4000-8000-000000009649',
  '00000000-0000-4000-8000-000000009549',
  '00000000-0000-4000-8000-000000009100', 'confirm',
  'Task 4 terminal review evidence remains retained.',
  '2026-05-12 00:00:00+00', '00000000-0000-4000-8000-000000009749'
);
insert into private.identity_proposal_evidence (
  proposal_id, job_id, selected_candidate_rank, media_asset_id,
  recipe_version, crop_contract_version, embedding_contract_version,
  identify_contract_version, model_version, callback_contract_version,
  selector_id, selected_at
) values
  ('00000000-0000-4000-8000-000000009548',
    '00000000-0000-4000-8000-000000009348', 1,
    '00000000-0000-4000-8000-000000009248', 'jpeg-srgb-2048-q88.v1',
    'crop.v1', 'embedding.v1', 'identify.v1', 'identity.v1',
    'identify-callback.v1', '00000000-0000-4000-8000-000000009100',
    '2026-05-10 00:00:00+00'),
  ('00000000-0000-4000-8000-000000009549',
    '00000000-0000-4000-8000-000000009349', 1,
    '00000000-0000-4000-8000-000000009249', 'jpeg-srgb-2048-q88.v1',
    'crop.v1', 'embedding.v1', 'identify.v1', 'identity.v1',
    'identify-callback.v1', '00000000-0000-4000-8000-000000009100',
    '2026-05-11 00:00:00+00');

insert into private.identity_assistance_requests (
  actor_id, request_id, payload_sha256, operation, job_id
) values (
  '00000000-0000-4000-8000-000000009100',
  '00000000-0000-4000-8000-000000009741',
  pg_catalog.md5('task4-ledger') || pg_catalog.md5('task4-ledger'),
  'request', '00000000-0000-4000-8000-000000009341'
);
insert into private.identity_assistance_status_reads (
  actor_id, job_id, accessed_on, first_accessed_at, last_accessed_at,
  access_count
) values (
  '00000000-0000-4000-8000-000000009100',
  '00000000-0000-4000-8000-000000009341', pg_catalog.make_date(2026, 6, 5),
  '2026-06-05 00:00:00+00', '2026-06-05 00:01:00+00', 2
);
insert into private.identity_assistance_service_requests (
  request_id, payload_sha256, operation, job_id
) values (
  '00000000-0000-4000-8000-000000009742',
  pg_catalog.md5('task4-service-ledger') || pg_catalog.md5('task4-service-ledger'),
  'claim', '00000000-0000-4000-8000-000000009341'
);
insert into private.identity_assistance_claim_results (
  request_id, ordinal, job_id, lease_id, attempt, lease_expires_at, created_at
) values (
  '00000000-0000-4000-8000-000000009742', 1,
  '00000000-0000-4000-8000-000000009341',
  '00000000-0000-4000-8000-000000009642', 1,
  '2026-06-05 00:02:00+00', '2026-06-05 00:00:00+00'
);

select pg_catalog.set_config(
  'private.identity_assistance_job_writer', 'task4-outer-cleanup-writer', true
);
select pg_catalog.set_config(
  'private.identity_assistance_candidate_writer', 'task4-outer-candidate-writer', true
);
select pg_catalog.set_config(
  'private.identity_assistance_job_deleter', 'task4-outer-deleter', true
);
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.service_cleanup_identity_assistance(
      2, '2026-08-01 00:00:00+00',
      '00000000-0000-4000-8000-000000009440'
    )$$,
  'cleanup processes a deterministic total batch across retention actions'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs as jobs
    where jobs.id in (
      '00000000-0000-4000-8000-000000009341',
      '00000000-0000-4000-8000-000000009342'
    )),
  0::bigint,
  'the two oldest eligible terminal rows consume the entire batch'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009343'),
  1::bigint,
  'batch size is total rather than separately applied to deletion and expiration'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.request_id = '00000000-0000-4000-8000-000000009440'
      and events.event_type = 'cleaned'
      and events.job_id is null
      and events.reason_code = 'operational_retention_elapsed'),
  2::bigint,
  'minimized cleaned events survive deletion with null job links'
);
select lives_ok(
  $$select public.service_cleanup_identity_assistance(
      2, '2026-08-01 00:00:00+00',
      '00000000-0000-4000-8000-000000009440'
    )$$,
  'exact cleanup replay succeeds after its original jobs were deleted'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.request_id = '00000000-0000-4000-8000-000000009440'),
  2::bigint,
  'exact cleanup replay adds no event or second transition'
);
select throws_ok(
  $$select public.service_cleanup_identity_assistance(
      3, '2026-08-01 00:00:00+00',
      '00000000-0000-4000-8000-000000009440'
    )$$,
  'P0001', 'idempotency_conflict',
  'changed cleanup payload reuse conflicts before retained state'
);
select throws_ok(
  $$select * from public.service_claim_identity_assistance_jobs(
      'worker.cleanup-conflict', 1,
      '00000000-0000-4000-8000-000000009440'
    )$$,
  'P0001', 'idempotency_conflict',
  'cross-operation reuse of a cleanup request conflicts'
);

select lives_ok(
  $$select public.service_cleanup_identity_assistance(
      50, '2026-08-01 00:00:00+00',
      '00000000-0000-4000-8000-000000009441'
    )$$,
  'a later cleanup processes remaining unselected operational retention'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009343'),
  0::bigint,
  'remaining thirty-day terminal cleanup deletes the next eligible row'
);
select ok(
  (select jobs.status = 'expired'
      and jobs.media_asset_id is null
      and jobs.input_sha256 is null
      and jobs.requester_id is null
      and jobs.withdrawn_at is not null
      and jobs.completed_at = '2026-07-10 00:00:00+00'
      and jobs.model_version = 'identity.v1'
      and jobs.callback_contract_version = 'identify-callback.v1'
      and jobs.new_cat_recommended = false
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000009340'),
  'seven-day expiration clears source bindings but preserves completion facts'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_candidates as candidates
    where candidates.job_id in (
      '00000000-0000-4000-8000-000000009340',
      '00000000-0000-4000-8000-000000009350'
    )),
  0::bigint,
  'expiration purges each full unselected candidate set'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_events as events
    where events.request_id = '00000000-0000-4000-8000-000000009441'
      and events.event_type = 'expired'
      and events.reason_code = 'retention_window_elapsed'),
  2::bigint,
  'each newly expired result appends one bounded retention event'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000009741'),
  0::bigint,
  'physical cleanup purges tied contributor request ledgers'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_status_reads as reads
    where reads.job_id = '00000000-0000-4000-8000-000000009341'),
  0::bigint,
  'physical cleanup purges tied status-read ledgers'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000009742'),
  0::bigint,
  'physical cleanup purges tied service and cascading claim-result ledgers'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_service_requests as requests
    where requests.request_id in (
      '00000000-0000-4000-8000-000000009440',
      '00000000-0000-4000-8000-000000009441'
    )),
  2::bigint,
  'cleanup retains its current request and prior cleanup replay ledger'
);
select results_eq(
  $$select jobs.id
      from private.identity_assistance_jobs as jobs
     where jobs.id in (
       '00000000-0000-4000-8000-000000009344',
       '00000000-0000-4000-8000-000000009345',
       '00000000-0000-4000-8000-000000009346',
       '00000000-0000-4000-8000-000000009347',
       '00000000-0000-4000-8000-000000009348',
       '00000000-0000-4000-8000-000000009349'
     )
     order by jobs.id$$,
  $$values
      ('00000000-0000-4000-8000-000000009344'::uuid),
      ('00000000-0000-4000-8000-000000009345'::uuid),
      ('00000000-0000-4000-8000-000000009346'::uuid),
      ('00000000-0000-4000-8000-000000009347'::uuid),
      ('00000000-0000-4000-8000-000000009348'::uuid),
      ('00000000-0000-4000-8000-000000009349'::uuid)$$,
  'requested, processing, young, selected, open-review, and terminal-review rows survive'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_proposal_evidence as evidence
    where evidence.job_id in (
      '00000000-0000-4000-8000-000000009348',
      '00000000-0000-4000-8000-000000009349'
    )),
  2::bigint,
  'open and terminal proposal-review evidence remains outside this cleanup slice'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_job_writer', true),
  'task4-outer-cleanup-writer',
  'cleanup restores the caller job-writer context on success'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_candidate_writer', true),
  'task4-outer-candidate-writer',
  'cleanup restores the caller candidate-writer context on success'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_job_deleter', true),
  'task4-outer-deleter',
  'cleanup restores the caller job-deleter context on success'
);
reset role;

-- A forced write failure proves exception-path restoration without expanding
-- production exceptions. The failed service request is transactionally absent.
insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, requested_at, attempt_count, completed_at, expires_at,
  model_version, callback_contract_version, new_cat_recommended
) values (
  '00000000-0000-4000-8000-000000009351',
  '00000000-0000-4000-8000-000000009151',
  '00000000-0000-4000-8000-000000009251',
  '00000000-0000-4000-8000-000000009100', 'succeeded', 'notice.v1',
  pg_catalog.md5('task4-hash-51') || pg_catalog.md5('task4-hash-51'),
  '2026-07-01 00:00:00+00', 1, '2026-07-10 00:00:00+00',
  '2026-07-20 00:00:00+00', 'identity.v1', 'identify-callback.v1', false
);
create function pg_temp.task4_cleanup_fixture_failure()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.id = '00000000-0000-4000-8000-000000009351'::uuid then
    raise exception 'task4_cleanup_fixture_failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger task4_cleanup_fixture_failure
before update on private.identity_assistance_jobs
for each row execute function pg_temp.task4_cleanup_fixture_failure();
set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.service_cleanup_identity_assistance(
      1, '2026-08-01 00:00:00+00',
      '00000000-0000-4000-8000-000000009442'
    )$$,
  'P0001', 'task4_cleanup_fixture_failure',
  'cleanup restores scoped contexts when a guarded write raises'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_job_writer', true),
  'task4-outer-cleanup-writer',
  'exception restores the caller job-writer context'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_candidate_writer', true),
  'task4-outer-candidate-writer',
  'exception restores the caller candidate-writer context'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_job_deleter', true),
  'task4-outer-deleter',
  'exception restores the caller job-deleter context'
);
select is(
  (select pg_catalog.count(*)
     from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000009442'),
  0::bigint,
  'exception rollback leaves no cleanup idempotency row'
);
reset role;
drop trigger task4_cleanup_fixture_failure on private.identity_assistance_jobs;

select pg_catalog.set_config('private.identity_assistance_job_writer', '', true);
select pg_catalog.set_config('private.identity_assistance_candidate_writer', '', true);
select pg_catalog.set_config('private.identity_assistance_job_deleter', '', true);

select * from finish();
rollback;
