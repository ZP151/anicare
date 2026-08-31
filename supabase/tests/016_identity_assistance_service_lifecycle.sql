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

select * from finish();
rollback;
