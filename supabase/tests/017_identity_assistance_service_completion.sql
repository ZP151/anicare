begin;
create extension if not exists dblink with schema extensions;
select no_plan();

-- Test 017 names every caller-visible completion boundary before migration 007
-- exists.  Dynamic execution keeps the tests-only RED a pgTAP assertion
-- failure (the missing completion surface), rather than a parser or fixture
-- failure.
select has_function(
  'public', 'service_complete_identity_assistance_job',
  array['uuid', 'uuid', 'integer', 'text', 'text', 'jsonb', 'boolean', 'uuid'],
  'completion RPC exists with the frozen eight-argument signature'
);
select is(
  (select procedures.proargnames
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_complete_identity_assistance_job(uuid,uuid,integer,text,text,jsonb,boolean,uuid)'
    )),
  array[
    'p_job_id', 'p_lease_id', 'p_attempt', 'p_callback_contract_version',
    'p_model_version', 'p_candidates', 'p_new_cat_recommended', 'p_request_id'
  ]::text[],
  'completion exposes only the approved parameter names and order'
);
select is(
  (select array(
     select pg_catalog.format_type(types.type_oid, null)
       from pg_catalog.unnest(procedures.proargtypes)
            with ordinality as types(type_oid, ordinal)
      order by types.ordinal
   )
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_complete_identity_assistance_job(uuid,uuid,integer,text,text,jsonb,boolean,uuid)'
    )),
  array['uuid', 'uuid', 'integer', 'text', 'text', 'jsonb', 'boolean', 'uuid']::text[],
  'completion exposes only the approved parameter types'
);
select ok(
  (select procedures.provolatile = 'v'
      and procedures.prosecdef
      and not procedures.proretset
      and procedures.prorettype = 'void'::pg_catalog.regtype
      and procedures.proconfig = array['search_path=pg_catalog']::text[]
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'public.service_complete_identity_assistance_job(uuid,uuid,integer,text,text,jsonb,boolean,uuid)'
    )),
  'completion is volatile security-definer void with a fixed search path'
);
with roles(role_name, expected) as (values
  ('public', false), ('anon', false), ('authenticated', false),
  ('service_role', true)
)
select is(
  case
    when pg_catalog.to_regprocedure(
      'public.service_complete_identity_assistance_job(uuid,uuid,integer,text,text,jsonb,boolean,uuid)'
    ) is null then false
    else pg_catalog.has_function_privilege(
      roles.role_name,
      pg_catalog.to_regprocedure(
        'public.service_complete_identity_assistance_job(uuid,uuid,integer,text,text,jsonb,boolean,uuid)'
      ),
      'execute'
    )
  end,
  roles.expected,
  roles.role_name || ' execute privilege is exact for completion'
)
from roles;
select ok(
  (select procedures.provolatile = 'i'
      and procedures.proconfig = array['search_path=pg_catalog']::text[]
     from pg_catalog.pg_proc as procedures
    where procedures.oid = pg_catalog.to_regprocedure(
      'private.is_valid_identity_assistance_candidate_payload(jsonb)'
    )),
  'the candidate JSON validator is immutable and uses a fixed search path'
);
with roles(role_name) as (values
  ('public'), ('anon'), ('authenticated'), ('service_role')
)
select is(
  case
    when pg_catalog.to_regprocedure(
      'private.is_valid_identity_assistance_candidate_payload(jsonb)'
    ) is null then true
    else not pg_catalog.has_function_privilege(
      roles.role_name,
      pg_catalog.to_regprocedure(
        'private.is_valid_identity_assistance_candidate_payload(jsonb)'
      ),
      'execute'
    )
  end,
  true,
  roles.role_name || ' has no direct execute privilege on the private JSON validator'
)
from roles;
with roles(role_name) as (values
  ('public'), ('anon'), ('authenticated'), ('service_role')
), tables(table_name) as (values
  ('identity_assistance_jobs'),
  ('identity_assistance_candidates'),
  ('identity_assistance_service_requests'),
  ('identity_assistance_events')
), privileges(privilege_name) as (values
  ('select'), ('insert'), ('update'), ('delete')
)
select ok(
  not pg_catalog.has_table_privilege(
    roles.role_name, 'private.' || tables.table_name, privileges.privilege_name
  ),
  roles.role_name || ' retains no direct ' || privileges.privilege_name
    || ' privilege on ' || tables.table_name
)
from roles cross join tables cross join privileges;

-- A tests-only database contains neither the helper nor the public RPC.  Keep
-- its RED to the catalog assertions above; all fixture/state assertions below
-- run only after migration 007 supplies the exact callable surface.
select pg_catalog.to_regprocedure(
  'public.service_complete_identity_assistance_job(uuid,uuid,integer,text,text,jsonb,boolean,uuid)'
) is not null as task5_completion_surface \gset
\if :task5_completion_surface
-- Authentication occurs before scalar validation or table-dependent work.
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      null, null, null, null, null, null, null, null
    )$$,
  '42501', 'service_role_required',
  'completion independently requires service role before input validation'
);
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      null, '00000000-0000-4000-8000-000000017601', 1,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017701'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects a null job id before source discovery'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301', null, 1,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017702'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects a null lease id before source discovery'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 0,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017703'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects attempt zero'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 4,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017704'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects attempts above three'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 1,
      'identify-callback.v2', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017705'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion freezes the callback contract version'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 1,
      'identify-callback.v1', '-model', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017706'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects a model version outside the bounded grammar'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 1,
      'identify-callback.v1', 'model.v1', null, false,
      '00000000-0000-4000-8000-000000017707'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects null candidate JSON before table work'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 1,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, null,
      '00000000-0000-4000-8000-000000017708'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects a null new-cat recommendation'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 1,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false, null
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects a null request id'
);

-- Canonical processing sources.  Each fixture is self-contained so a failure
-- is attributable to completion behavior rather than a malformed source.
set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values (
  '00000000-0000-4000-8000-000000017100',
  'Task 5 Completion Owner', pg_catalog.now()
);
set local session_replication_role = origin;

insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk,
  visibility, client_dedupe_key
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1710 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000017100', pg_catalog.now(),
       '8928308280fffff', 'morning', 'normal', 'limited',
       'task5-completion-source-' || fixture::text
  from pg_catalog.generate_series(1, 20) as fixtures(fixture);

insert into public.media_assets (
  id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
  redaction_confirmed_at, training_eligible, client_media_id, byte_length,
  width, height, recipe_version, detector_versions, status, reviewed_at
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1720 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1710 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000017100'::uuid, 'media-staging',
       'jobs/' || pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1730 + fixture)::text, 12, '0')
       ) || '.jpg',
       pg_catalog.md5('task5-hash-' || fixture::text)
         || pg_catalog.md5('task5-hash-' || fixture::text),
       pg_catalog.now(), false, 'task5-media-' || pg_catalog.lpad(fixture::text, 2, '0'),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       'quarantined', pg_catalog.now()
  from pg_catalog.generate_series(1, 20) as fixtures(fixture);

insert into private.media_upload_jobs (
  id, uploader_id, sighting_id, media_id, sha256, byte_length, width, height,
  recipe_version, detector_versions, confirmed_at_local, object_path, status,
  reserved_at, reservation_expires_at, upload_token_expires_at,
  next_cleanup_at, finalized_at, media_asset_id
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1730 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000017100',
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1710 + fixture)::text, 12, '0')
       )::uuid,
       'task5-media-' || pg_catalog.lpad(fixture::text, 2, '0'),
       pg_catalog.md5('task5-hash-' || fixture::text)
         || pg_catalog.md5('task5-hash-' || fixture::text),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       pg_catalog.now(),
       'jobs/' || pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1730 + fixture)::text, 12, '0')
       ) || '.jpg',
       'finalized', pg_catalog.now(), pg_catalog.now() + interval '10 minutes',
       pg_catalog.now() + interval '1 hour', 'infinity'::timestamptz,
       pg_catalog.now(),
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1720 + fixture)::text, 12, '0')
       )::uuid
  from pg_catalog.generate_series(1, 20) as fixtures(fixture);

insert into public.animals (id, primary_alias, profile_created_by, visibility)
values
  ('00000000-0000-4000-8000-000000017501', 'Task 5 Candidate One',
    '00000000-0000-4000-8000-000000017100', 'limited'),
  ('00000000-0000-4000-8000-000000017502', 'Task 5 Candidate Two',
    '00000000-0000-4000-8000-000000017100', 'public'),
  ('00000000-0000-4000-8000-000000017503', 'Task 5 Candidate Three',
    '00000000-0000-4000-8000-000000017100', 'limited'),
  ('00000000-0000-4000-8000-000000017504', 'Task 5 Candidate Hidden',
    '00000000-0000-4000-8000-000000017100', 'hidden'),
  ('00000000-0000-4000-8000-000000017505', 'Task 5 Candidate Archived',
    '00000000-0000-4000-8000-000000017100', 'archived'),
  ('00000000-0000-4000-8000-000000017506', 'Task 5 Candidate Timestamp Archived',
    '00000000-0000-4000-8000-000000017100', 'limited');

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, lease_id, lease_expires_at, processing_at,
  requested_at
)
select pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((17300 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1710 + fixture)::text, 12, '0')
       )::uuid,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((1720 + fixture)::text, 12, '0')
       )::uuid,
       '00000000-0000-4000-8000-000000017100', 'processing', 'notice.v1',
       pg_catalog.md5('task5-hash-' || fixture::text)
         || pg_catalog.md5('task5-hash-' || fixture::text),
       case when fixture = 8 then 2 else 1 end,
       pg_catalog.format(
         '00000000-0000-4000-8000-%s', pg_catalog.lpad((17600 + fixture)::text, 12, '0')
       )::uuid,
       case when fixture = 7 then pg_catalog.clock_timestamp()
            else pg_catalog.clock_timestamp() + interval '10 minutes' end,
       pg_catalog.clock_timestamp(), pg_catalog.now()
  from pg_catalog.generate_series(1, 14) as fixtures(fixture);

-- Strict JSON helper semantics are directly visible to the database owner.
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload('[]'::jsonb)$$,
  $$values (true)$$,
  'the private helper accepts a zero-candidate no-match payload'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar","ear_shape_similar"]}]'::jsonb
    )$$,
  $$values (true)$$,
  'the private helper accepts an exact ordered candidate object'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]},{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"possible","reasonCodes":["ear_shape_similar"]}]'::jsonb
    )$$,
  $$values (false)$$,
  'the private helper rejects duplicate candidate animals'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar","face_pattern_similar"]}]'::jsonb
    )$$,
  $$values (false)$$,
  'the private helper rejects duplicate reason codes while preserving valid order'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar"],"rank":1}]'::jsonb
    )$$,
  $$values (false)$$,
  'the private helper rejects worker supplied rank and extra keys'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '[{"animalId":"invalid-uuid","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]}]'::jsonb
    )$$,
  $$values (false)$$,
  'the private helper rejects a malformed UUID string'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '{"animalId":"00000000-0000-4000-8000-000000017501"}'::jsonb
    )$$,
  $$values (false)$$,
  'the private helper rejects non-array top-level JSON'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload('[null]'::jsonb)$$,
  $$values (false)$$,
  'the private helper rejects JSON null entries'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely"}]'::jsonb
    )$$,
  $$values (false)$$,
  'the private helper rejects missing exact object keys'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '[{"animalId":null,"confidenceBand":"likely","reasonCodes":["face_pattern_similar"]}]'::jsonb
    )$$,
  $$values (false)$$,
  'the private helper rejects null exact object values'
);
select results_eq(
  $$select private.is_valid_identity_assistance_candidate_payload(
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":"face_pattern_similar"}]'::jsonb
    )$$,
  $$values (false)$$,
  'the private helper rejects flat reason text instead of an exact reason array'
);

-- All malformed callback shapes use a real active source and must leave it
-- untouched.  These exercise validation before lease/source work.
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017304',
      '00000000-0000-4000-8000-000000017604', 1,
      'identify-callback.v1', 'model.v1', '{}'::jsonb, false,
      '00000000-0000-4000-8000-000000017720'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects object candidates before source work'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017304',
      '00000000-0000-4000-8000-000000017604', 1,
      'identify-callback.v1', 'model.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"invalid","reasonCodes":["face_pattern_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017721'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects a non-allowlisted confidence band'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017304',
      '00000000-0000-4000-8000-000000017604', 1,
      'identify-callback.v1', 'model.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["free_text"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017722'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects free-text reason codes'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017304',
      '00000000-0000-4000-8000-000000017604', 1,
      'identify-callback.v1', 'model.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]},{"animalId":"00000000-0000-4000-8000-000000017502","confidenceBand":"possible","reasonCodes":["ear_shape_similar"]},{"animalId":"00000000-0000-4000-8000-000000017503","confidenceBand":"weak","reasonCodes":["coat_marking_similar"]},{"animalId":"00000000-0000-4000-8000-000000017504","confidenceBand":"weak","reasonCodes":["view_angle_limited"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017723'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects a fourth candidate before source work'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017304',
      '00000000-0000-4000-8000-000000017604', 1,
      'identify-callback.v1', 'model.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar"],"score":0.9}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017724'
    )$$,
  '22023', 'invalid_identity_assistance_completion',
  'completion rejects score, display, vector, path, URL, and location-shaped extras'
);
select is(
  (select jobs.status::text from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000017304'),
  'processing',
  'malformed callback attempts do not change the active job'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_service_requests as requests
    where requests.request_id between '00000000-0000-4000-8000-000000017720'::uuid
      and '00000000-0000-4000-8000-000000017724'::uuid),
  0::bigint,
  'malformed callbacks create no completion ledger rows'
);

-- Happy paths: zero, one, and three candidates.  Ranks must derive solely
-- from array ordinality and reason order must survive unchanged.
select lives_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 1,
      'identify-callback.v1', 'model.zero.v1', '[]'::jsonb, true,
      '00000000-0000-4000-8000-000000017731'
    )$$,
  'zero candidates complete successfully and preserve true new-cat recommendation'
);
select lives_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017602', 1,
      'identify-callback.v1', 'model.one.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar","ear_shape_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017732'
    )$$,
  'one ordered candidate completes successfully'
);
select lives_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017303',
      '00000000-0000-4000-8000-000000017603', 1,
      'identify-callback.v1', 'model.three.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017503","confidenceBand":"weak","reasonCodes":["view_angle_limited","image_quality_limited"]},{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]},{"animalId":"00000000-0000-4000-8000-000000017502","confidenceBand":"possible","reasonCodes":["ear_shape_similar","coat_marking_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017733'
    )$$,
  'three candidates complete successfully in callback order'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_candidates as candidates
    where candidates.job_id = '00000000-0000-4000-8000-000000017301'),
  0::bigint,
  'zero-candidate completion persists no candidate rows'
);
select results_eq(
  $$select candidates.rank, candidates.animal_id, candidates.confidence_band::text,
           candidates.reason_codes::text
      from private.identity_assistance_candidates as candidates
     where candidates.job_id = '00000000-0000-4000-8000-000000017303'
     order by candidates.rank$$,
  $$values
      (1, '00000000-0000-4000-8000-000000017503'::uuid, 'weak',
       '{view_angle_limited,image_quality_limited}'),
      (2, '00000000-0000-4000-8000-000000017501'::uuid, 'likely',
       '{face_pattern_similar}'),
      (3, '00000000-0000-4000-8000-000000017502'::uuid, 'possible',
       '{ear_shape_similar,coat_marking_similar}')$$,
  'candidate ranks, exact bands, and ordered reasons persist from callback array ordinality'
);
select ok(
  not exists (
    select 1 from private.identity_assistance_jobs as jobs
     where jobs.id in (
       '00000000-0000-4000-8000-000000017301',
       '00000000-0000-4000-8000-000000017302',
       '00000000-0000-4000-8000-000000017303'
     )
       and (jobs.status <> 'succeeded'::private.identity_assistance_job_status
         or jobs.lease_id is not null or jobs.lease_expires_at is not null
         or jobs.completed_at is null or jobs.expires_at <> jobs.completed_at + interval '7 days'
         or jobs.callback_contract_version <> 'identify-callback.v1')
  ),
  'successful completion clears the lease and freezes bounded seven-day provenance'
);
select is(
  (select jobs.new_cat_recommended from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000017301'),
  true,
  'zero-candidate completion persists true exactly'
);
select is(
  (select jobs.new_cat_recommended from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000017302'),
  false,
  'candidate completion persists false exactly'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_events as events
    where events.job_id in (
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017303'
    ) and events.event_type = 'completed'),
  3::bigint,
  'each successful completion writes exactly one bounded completed event'
);

-- Idempotency is canonical over the complete broker translation and happens
-- before lease/source state work.
select lives_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017602', 1,
      'identify-callback.v1', 'model.one.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar","ear_shape_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017732'
    )$$,
  'an exact completion replay succeeds after the lease was cleared'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_candidates as candidates
    where candidates.job_id = '00000000-0000-4000-8000-000000017302'),
  1::bigint,
  'an exact completion replay does not duplicate candidates'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_events as events
    where events.job_id = '00000000-0000-4000-8000-000000017302'
      and events.event_type = 'completed'),
  1::bigint,
  'an exact completion replay does not append a second event'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017602', 1,
      'identify-callback.v1', 'model.changed.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar","ear_shape_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017732'
    )$$,
  'P0001', 'idempotency_conflict',
  'changed model under a reused completion request conflicts before active-state work'
);
select throws_ok(
  $$select public.service_fail_identity_assistance_job(
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017602', 1,
      'provider_unavailable', true,
      '00000000-0000-4000-8000-000000017732'
    )$$,
  'P0001', 'idempotency_conflict',
  'cross-operation reuse of a completion request id conflicts'
);

select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017602', 1,
      'identify-callback.v1', 'model.one.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["ear_shape_similar","face_pattern_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017732'
    )$$,
  'P0001', 'idempotency_conflict',
  'changed callback reason order conflicts under an existing completion request'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017602', 2,
      'identify-callback.v1', 'model.one.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar","ear_shape_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017732'
    )$$,
  'P0001', 'idempotency_conflict',
  'changed attempt conflicts under an existing completion request before lease work'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017602', 1,
      'identify-callback.v1', 'model.one.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar","ear_shape_similar"]}]'::jsonb,
      true, '00000000-0000-4000-8000-000000017732'
    )$$,
  'P0001', 'idempotency_conflict',
  'changed new-cat recommendation conflicts under an existing completion request'
);

-- A completed request remains replayable even after governed source
-- invalidation.  The retained service-request row is a minimized tombstone,
-- not a way to resurrect an actionable candidate set.
select lives_ok(
  $$select * from public.server_request_media_deletion(
      '00000000-0000-4000-8000-000000017100',
      '00000000-0000-4000-8000-000000001721'
    )$$,
  'governed source deletion invalidates an already-completed no-match job'
);
select lives_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017301',
      '00000000-0000-4000-8000-000000017601', 1,
      'identify-callback.v1', 'model.zero.v1', '[]'::jsonb, true,
      '00000000-0000-4000-8000-000000017731'
    )$$,
  'an exact completion replay remains a no-op after source invalidation'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_events as events
    where events.job_id = '00000000-0000-4000-8000-000000017301'
      and events.request_id = '00000000-0000-4000-8000-000000017731'
      and events.event_type = 'completed'),
  1::bigint,
  'post-invalidation replay does not append a second completion event'
);

-- The cleanup path deletes only after its existing retention state transition.
-- Timestamps are test-fixture state, not a production clock override.
set local session_replication_role = replica;
update private.identity_assistance_jobs
   set completed_at = pg_catalog.clock_timestamp() - interval '8 days',
       expires_at = pg_catalog.clock_timestamp() - interval '7 days',
       updated_at = pg_catalog.clock_timestamp() - interval '7 days'
 where id = '00000000-0000-4000-8000-000000017302';
set local session_replication_role = origin;
select lives_ok(
  $$select public.service_cleanup_identity_assistance(
      1, pg_catalog.clock_timestamp(),
      '00000000-0000-4000-8000-000000017801'
    )$$,
  'governed cleanup expires a due unselected completion'
);
set local session_replication_role = replica;
update private.identity_assistance_jobs
   set expires_at = pg_catalog.clock_timestamp() - interval '31 days',
       updated_at = pg_catalog.clock_timestamp() - interval '31 days'
 where id = '00000000-0000-4000-8000-000000017302';
set local session_replication_role = origin;
select lives_ok(
  $$select public.service_cleanup_identity_assistance(
      1, pg_catalog.clock_timestamp(),
      '00000000-0000-4000-8000-000000017802'
    )$$,
  'governed cleanup physically removes an expired operational row after retention'
);
select is(
  (select requests.job_id from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000017732'),
  null::uuid,
  'physical cleanup preserves the completion request tombstone while clearing its job link'
);
select lives_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017302',
      '00000000-0000-4000-8000-000000017602', 1,
      'identify-callback.v1', 'model.one.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017501","confidenceBand":"likely","reasonCodes":["face_pattern_similar","ear_shape_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017732'
    )$$,
  'an exact completion replay remains a no-op after physical job cleanup'
);

-- Current lease, canonical source, availability, and partial-state failures
-- are all bounded and leave no partial completion result.
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017307',
      '00000000-0000-4000-8000-000000017607', 1,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017741'
    )$$,
  'P0001', 'identity_assistance_lease_not_current',
  'an equal-boundary lease is expired for completion'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017308',
      '00000000-0000-4000-8000-000000017608', 1,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017742'
    )$$,
  'P0001', 'identity_assistance_lease_not_current',
  'a stale lower attempt cannot complete a newer lease'
);
set local session_replication_role = replica;
update public.media_assets
   set sha256 = pg_catalog.repeat('f', 64)
 where id = '00000000-0000-4000-8000-000000001729';
set local session_replication_role = origin;
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017309',
      '00000000-0000-4000-8000-000000017609', 1,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017748'
    )$$,
  'P0001', 'identity_assistance_lease_not_current',
  'a post-discovery media hash change rejects completion without a raw constraint leak'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017311',
      '00000000-0000-4000-8000-000000017611', 1,
      'identify-callback.v1', 'model.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017504","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017743'
    )$$,
  '42501', 'identity_assistance_candidate_unavailable',
  'a hidden candidate is rejected with the dedicated bounded error'
);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017312',
      '00000000-0000-4000-8000-000000017612', 1,
      'identify-callback.v1', 'model.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017505","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017744'
    )$$,
  '42501', 'identity_assistance_candidate_unavailable',
  'an archived candidate is rejected with the dedicated bounded error'
);
update public.animals
   set archived_at = pg_catalog.clock_timestamp()
 where id = '00000000-0000-4000-8000-000000017506';
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017313',
      '00000000-0000-4000-8000-000000017613', 1,
      'identify-callback.v1', 'model.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017506","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017749'
    )$$,
  '42501', 'identity_assistance_candidate_unavailable',
  'a candidate with archived_at set is rejected with the dedicated bounded error'
);
select pg_catalog.set_config(
  'private.identity_assistance_candidate_writer',
  '00000000-0000-4000-8000-000000017310', true
);
insert into private.identity_assistance_candidates (
  job_id, rank, animal_id, confidence_band, reason_codes
) values (
  '00000000-0000-4000-8000-000000017310', 1,
  '00000000-0000-4000-8000-000000017501', 'likely',
  array['face_pattern_similar']::private.identity_assistance_reason_code[]
);
select pg_catalog.set_config('private.identity_assistance_candidate_writer', '', true);
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017310',
      '00000000-0000-4000-8000-000000017610', 1,
      'identify-callback.v1', 'model.v1', '[]'::jsonb, false,
      '00000000-0000-4000-8000-000000017745'
    )$$,
  'P0001', 'identity_assistance_completion_state_invalid',
  'pre-existing candidates prevent completion rather than leaking a uniqueness failure'
);

-- Two distinct completion request IDs race on one lease.  A lower-class media
-- lock makes both competitors observable with pg_blocking_pids before either
-- is released; no sleep-only timing decides the result.
set local statement_timeout = '45s';
create temporary table pg_temp.task5_completion_race_result (
  lock_waited boolean not null,
  state_valid boolean not null
) on commit drop;
do $completion_race$
declare
  local_connection text :=
    'host=' || pg_catalog.host(pg_catalog.inet_server_addr())
    || ' port=' || pg_catalog.current_setting('port')
    || ' dbname=' || pg_catalog.current_database()
    || ' user=' || session_user || ' password=' || session_user
    || ' connect_timeout=5';
  locker_pid integer;
  first_pid integer;
  second_pid integer;
  wait_deadline timestamptz;
  cleanup_deadline timestamptz;
  first_waited boolean := false;
  setup_connected boolean := false;
  locker_connected boolean := false;
  one_connected boolean := false;
  two_connected boolean := false;
  locker_in_transaction boolean := false;
  one_async boolean := false;
  two_async boolean := false;
  first_error text;
  second_error text;
  completed_count bigint;
  candidate_count bigint;
  ledger_count bigint;
begin
  if pg_catalog.to_regprocedure(
       'public.service_complete_identity_assistance_job(uuid,uuid,integer,text,text,jsonb,boolean,uuid)'
     ) is null then
    return;
  end if;

  perform extensions.dblink_connect(
    'task5_completion_setup', local_connection || ' application_name=task5_completion_setup'
  );
  setup_connected := true;
  perform extensions.dblink_exec('task5_completion_setup', 'set statement_timeout = ''12s''');
  perform extensions.dblink_exec('task5_completion_setup', 'set session_replication_role = replica');
  perform extensions.dblink_exec(
    'task5_completion_setup',
    $remote$
      insert into public.user_profiles (id, public_name, adult_confirmed_at)
      values ('00000000-0000-4000-8000-000000018100', 'Task 5 Race Owner', pg_catalog.now());
      insert into public.sightings (
        id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
      ) values (
        '00000000-0000-4000-8000-000000018110',
        '00000000-0000-4000-8000-000000018100', pg_catalog.now(),
        '8928308280fffff', 'morning', 'normal', 'limited', 'task5-completion-race'
      );
      insert into public.media_assets (
        id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
        redaction_confirmed_at, training_eligible, client_media_id, byte_length,
        width, height, recipe_version, detector_versions, status, reviewed_at
      ) values (
        '00000000-0000-4000-8000-000000018120',
        '00000000-0000-4000-8000-000000018110',
        '00000000-0000-4000-8000-000000018100', 'media-staging',
        'jobs/00000000-0000-4000-8000-000000018130.jpg', repeat('a', 64),
        pg_catalog.now(), false, 'task5-race-media', 4096, 512, 512,
        'jpeg-srgb-2048-q88.v1',
        '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
        'quarantined', pg_catalog.now()
      );
      insert into private.media_upload_jobs (
        id, uploader_id, sighting_id, media_id, sha256, byte_length, width, height,
        recipe_version, detector_versions, confirmed_at_local, object_path, status,
        reserved_at, reservation_expires_at, upload_token_expires_at,
        next_cleanup_at, finalized_at, media_asset_id
      ) values (
        '00000000-0000-4000-8000-000000018130',
        '00000000-0000-4000-8000-000000018100',
        '00000000-0000-4000-8000-000000018110', 'task5-race-media', repeat('a', 64),
        4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
        '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
        pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000018130.jpg',
        'finalized', pg_catalog.now(), pg_catalog.now() + interval '10 minutes',
        pg_catalog.now() + interval '1 hour', 'infinity'::timestamptz, pg_catalog.now(),
        '00000000-0000-4000-8000-000000018120'
      );
      insert into public.animals (id, primary_alias, profile_created_by, visibility)
      values (
        '00000000-0000-4000-8000-000000018150', 'Task 5 Race Candidate',
        '00000000-0000-4000-8000-000000018100', 'limited'
      );
      insert into private.identity_assistance_jobs (
        id, sighting_id, media_asset_id, requester_id, status, notice_version,
        input_sha256, attempt_count, lease_id, lease_expires_at, processing_at
      ) values (
        '00000000-0000-4000-8000-000000018140',
        '00000000-0000-4000-8000-000000018110',
        '00000000-0000-4000-8000-000000018120',
        '00000000-0000-4000-8000-000000018100', 'processing', 'notice.v1', repeat('a', 64),
        1, '00000000-0000-4000-8000-000000018160',
        pg_catalog.clock_timestamp() + interval '10 minutes', pg_catalog.clock_timestamp()
      );
    $remote$
  );
  perform extensions.dblink_exec('task5_completion_setup', 'set session_replication_role = origin');
  perform extensions.dblink_connect(
    'task5_completion_locker', local_connection || ' application_name=task5_completion_locker'
  );
  locker_connected := true;
  perform extensions.dblink_connect(
    'task5_completion_one', local_connection || ' application_name=task5_completion_one'
  );
  one_connected := true;
  perform extensions.dblink_connect(
    'task5_completion_two', local_connection || ' application_name=task5_completion_two'
  );
  two_connected := true;
  perform extensions.dblink_exec('task5_completion_locker', 'set statement_timeout = ''12s''');
  perform extensions.dblink_exec('task5_completion_one', 'set statement_timeout = ''12s''');
  perform extensions.dblink_exec('task5_completion_two', 'set statement_timeout = ''12s''');
  perform extensions.dblink_exec('task5_completion_locker', 'begin');
  locker_in_transaction := true;
  perform * from extensions.dblink(
    'task5_completion_locker',
    'select id from public.media_assets where id = ''00000000-0000-4000-8000-000000018120'' for update'
  ) as locked(id uuid);
  perform extensions.dblink_exec('task5_completion_one', 'set role service_role');
  perform extensions.dblink_exec('task5_completion_two', 'set role service_role');
  perform extensions.dblink_exec('task5_completion_one', 'set request.jwt.claim.role = ''service_role''');
  perform extensions.dblink_exec('task5_completion_two', 'set request.jwt.claim.role = ''service_role''');
  select remote_pid into locker_pid from extensions.dblink(
    'task5_completion_locker', 'select pg_catalog.pg_backend_pid()'
  ) as backend(remote_pid integer);
  select remote_pid into first_pid from extensions.dblink(
    'task5_completion_one', 'select pg_catalog.pg_backend_pid()'
  ) as backend(remote_pid integer);
  select remote_pid into second_pid from extensions.dblink(
    'task5_completion_two', 'select pg_catalog.pg_backend_pid()'
  ) as backend(remote_pid integer);
  if extensions.dblink_send_query(
       'task5_completion_one',
       $remote$
      select pg_catalog.count(*) from (
        select public.service_complete_identity_assistance_job(
          '00000000-0000-4000-8000-000000018140',
          '00000000-0000-4000-8000-000000018160', 1,
          'identify-callback.v1', 'model.race.v1',
          '[{"animalId":"00000000-0000-4000-8000-000000018150","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]}]'::jsonb,
          false, '00000000-0000-4000-8000-000000018171'
        )
      ) as completed
       $remote$
     ) <> 1 then
    raise exception 'task5_completion_race_first_send_failed';
  end if;
  one_async := true;
  wait_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
  loop
    if locker_pid = any(pg_catalog.pg_blocking_pids(first_pid)) then
      first_waited := true;
      exit;
    end if;
    exit when extensions.dblink_is_busy('task5_completion_one') = 0;
    if pg_catalog.clock_timestamp() >= wait_deadline then
      raise exception 'task5_completion_race_lock_observation_timeout';
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
  if extensions.dblink_send_query(
       'task5_completion_two',
       $remote$
      select pg_catalog.count(*) from (
        select public.service_complete_identity_assistance_job(
          '00000000-0000-4000-8000-000000018140',
          '00000000-0000-4000-8000-000000018160', 1,
          'identify-callback.v1', 'model.race.v1',
          '[{"animalId":"00000000-0000-4000-8000-000000018150","confidenceBand":"likely","reasonCodes":["face_pattern_similar"]}]'::jsonb,
          false, '00000000-0000-4000-8000-000000018172'
        )
      ) as completed
       $remote$
     ) <> 1 then
    raise exception 'task5_completion_race_second_send_failed';
  end if;
  two_async := true;
  perform extensions.dblink_exec('task5_completion_locker', 'commit');
  locker_in_transaction := false;
  wait_deadline := pg_catalog.clock_timestamp() + interval '10 seconds';
  while extensions.dblink_is_busy('task5_completion_one') = 1
     or extensions.dblink_is_busy('task5_completion_two') = 1 loop
    if pg_catalog.clock_timestamp() >= wait_deadline then
      raise exception 'task5_completion_race_result_timeout';
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
  perform * from extensions.dblink_get_result('task5_completion_one', false)
    as result(completion_count bigint);
  one_async := false;
  perform * from extensions.dblink_get_result('task5_completion_two', false)
    as result(completion_count bigint);
  two_async := false;
  first_error := extensions.dblink_error_message('task5_completion_one');
  second_error := extensions.dblink_error_message('task5_completion_two');
  select remote_count into completed_count from extensions.dblink(
    'task5_completion_setup',
    $remote$
      select pg_catalog.count(*) from private.identity_assistance_events
       where job_id = '00000000-0000-4000-8000-000000018140'
         and event_type = 'completed'
    $remote$
  ) as count_result(remote_count bigint);
  select remote_count into candidate_count from extensions.dblink(
    'task5_completion_setup',
    $remote$
      select pg_catalog.count(*) from private.identity_assistance_candidates
       where job_id = '00000000-0000-4000-8000-000000018140'
    $remote$
  ) as count_result(remote_count bigint);
  select remote_count into ledger_count from extensions.dblink(
    'task5_completion_setup',
    $remote$
      select pg_catalog.count(*) from private.identity_assistance_service_requests
       where request_id in (
         '00000000-0000-4000-8000-000000018171',
         '00000000-0000-4000-8000-000000018172'
       )
    $remote$
  ) as count_result(remote_count bigint);
  perform extensions.dblink_disconnect('task5_completion_locker');
  locker_connected := false;
  perform extensions.dblink_disconnect('task5_completion_one');
  one_connected := false;
  perform extensions.dblink_disconnect('task5_completion_two');
  two_connected := false;
  perform extensions.dblink_exec('task5_completion_setup', 'set session_replication_role = replica');
  perform extensions.dblink_exec(
    'task5_completion_setup',
    $remote$
      delete from private.identity_assistance_service_requests
       where request_id in ('00000000-0000-4000-8000-000000018171', '00000000-0000-4000-8000-000000018172');
      delete from private.identity_assistance_events where job_id = '00000000-0000-4000-8000-000000018140';
      delete from private.identity_assistance_candidates where job_id = '00000000-0000-4000-8000-000000018140';
      delete from private.identity_assistance_jobs where id = '00000000-0000-4000-8000-000000018140';
      delete from private.media_upload_jobs where id = '00000000-0000-4000-8000-000000018130';
      delete from public.media_assets where id = '00000000-0000-4000-8000-000000018120';
      delete from public.sightings where id = '00000000-0000-4000-8000-000000018110';
      delete from public.animals where id = '00000000-0000-4000-8000-000000018150';
      delete from public.user_profiles where id = '00000000-0000-4000-8000-000000018100';
    $remote$
  );
  perform extensions.dblink_disconnect('task5_completion_setup');
  setup_connected := false;
  insert into pg_temp.task5_completion_race_result (lock_waited, state_valid)
  values (
    first_waited,
    completed_count = 1 and candidate_count = 1 and ledger_count = 1
      and (first_error like '%identity_assistance_lease_not_current%'
        or second_error like '%identity_assistance_lease_not_current%')
  );
exception
  when others then
    if locker_connected and locker_in_transaction then
      begin
        perform extensions.dblink_exec('task5_completion_locker', 'rollback');
        locker_in_transaction := false;
      exception
        when others then
          null;
      end;
    end if;

    if one_connected and one_async then
      begin
        if extensions.dblink_is_busy('task5_completion_one') = 1 then
          perform extensions.dblink_cancel_query('task5_completion_one');
        end if;
        cleanup_deadline := pg_catalog.clock_timestamp() + interval '5 seconds';
        while extensions.dblink_is_busy('task5_completion_one') = 1 loop
          exit when pg_catalog.clock_timestamp() >= cleanup_deadline;
          perform pg_catalog.pg_sleep(0.01);
        end loop;
        if extensions.dblink_is_busy('task5_completion_one') = 0 then
          perform * from extensions.dblink_get_result('task5_completion_one', false)
            as result(completion_count bigint);
          one_async := false;
        end if;
      exception
        when others then
          null;
      end;
    end if;

    if two_connected and two_async then
      begin
        if extensions.dblink_is_busy('task5_completion_two') = 1 then
          perform extensions.dblink_cancel_query('task5_completion_two');
        end if;
        cleanup_deadline := pg_catalog.clock_timestamp() + interval '5 seconds';
        while extensions.dblink_is_busy('task5_completion_two') = 1 loop
          exit when pg_catalog.clock_timestamp() >= cleanup_deadline;
          perform pg_catalog.pg_sleep(0.01);
        end loop;
        if extensions.dblink_is_busy('task5_completion_two') = 0 then
          perform * from extensions.dblink_get_result('task5_completion_two', false)
            as result(completion_count bigint);
          two_async := false;
        end if;
      exception
        when others then
          null;
      end;
    end if;

    if locker_connected then
      begin
        perform extensions.dblink_disconnect('task5_completion_locker');
        locker_connected := false;
      exception
        when others then
          null;
      end;
    end if;
    if one_connected then
      begin
        perform extensions.dblink_disconnect('task5_completion_one');
        one_connected := false;
      exception
        when others then
          null;
      end;
    end if;
    if two_connected then
      begin
        perform extensions.dblink_disconnect('task5_completion_two');
        two_connected := false;
      exception
        when others then
          null;
      end;
    end if;

    if setup_connected then
      begin
        perform extensions.dblink_exec('task5_completion_setup', 'set session_replication_role = replica');
        perform extensions.dblink_exec(
          'task5_completion_setup',
          $remote$
            delete from private.identity_assistance_service_requests
             where request_id in ('00000000-0000-4000-8000-000000018171', '00000000-0000-4000-8000-000000018172');
            delete from private.identity_assistance_events where job_id = '00000000-0000-4000-8000-000000018140';
            delete from private.identity_assistance_candidates where job_id = '00000000-0000-4000-8000-000000018140';
            delete from private.identity_assistance_jobs where id = '00000000-0000-4000-8000-000000018140';
            delete from private.media_upload_jobs where id = '00000000-0000-4000-8000-000000018130';
            delete from public.media_assets where id = '00000000-0000-4000-8000-000000018120';
            delete from public.sightings where id = '00000000-0000-4000-8000-000000018110';
            delete from public.animals where id = '00000000-0000-4000-8000-000000018150';
            delete from public.user_profiles where id = '00000000-0000-4000-8000-000000018100';
          $remote$
        );
      exception
        when others then
          null;
      end;
      begin
        perform extensions.dblink_disconnect('task5_completion_setup');
        setup_connected := false;
      exception
        when others then
          null;
      end;
    end if;
    raise;
end;
$completion_race$;
select ok(
  coalesce((select results.lock_waited from pg_temp.task5_completion_race_result as results), false),
  'one racing completion visibly waits on the lower media lock'
);
select ok(
  coalesce((select results.state_valid from pg_temp.task5_completion_race_result as results), false),
  'two completion requests on one lease produce one immutable result and one bounded stale-lease loser'
);

-- Scoped guard contexts cannot be injected by a caller and must restore after
-- success as well as a later guarded-write failure.
select pg_catalog.set_config(
  'private.identity_assistance_job_writer', 'task5-outer-job-writer', true
);
select pg_catalog.set_config(
  'private.identity_assistance_candidate_writer', 'task5-outer-candidate-writer', true
);
select lives_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017305',
      '00000000-0000-4000-8000-000000017605', 1,
      'identify-callback.v1', 'model.guc.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017502","confidenceBand":"possible","reasonCodes":["ear_shape_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017746'
    )$$,
  'completion succeeds with caller-preseeded writer contexts'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_job_writer', true),
  'task5-outer-job-writer',
  'completion restores the caller job-writer context after success'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_candidate_writer', true),
  'task5-outer-candidate-writer',
  'completion restores the caller candidate-writer context after success'
);
create function pg_temp.task5_completion_fixture_failure()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id = '00000000-0000-4000-8000-000000017306'::uuid then
    raise exception 'task5_completion_fixture_failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger task5_completion_fixture_failure
before update on private.identity_assistance_jobs
for each row execute function pg_temp.task5_completion_fixture_failure();
select throws_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017306',
      '00000000-0000-4000-8000-000000017606', 1,
      'identify-callback.v1', 'model.fail.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017503","confidenceBand":"weak","reasonCodes":["image_quality_limited"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017747'
    )$$,
  'P0001', 'task5_completion_fixture_failure',
  'a post-candidate guarded-write failure aborts the entire completion'
);
drop trigger task5_completion_fixture_failure on private.identity_assistance_jobs;
select is(
  pg_catalog.current_setting('private.identity_assistance_job_writer', true),
  'task5-outer-job-writer',
  'completion restores the caller job-writer context after an exception'
);
select is(
  pg_catalog.current_setting('private.identity_assistance_candidate_writer', true),
  'task5-outer-candidate-writer',
  'completion restores the caller candidate-writer context after an exception'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_candidates as candidates
    where candidates.job_id = '00000000-0000-4000-8000-000000017306'),
  0::bigint,
  'a failing completion leaves no partial candidate rows'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_service_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000017747'),
  0::bigint,
  'a failing completion rolls back its idempotency ledger row'
);

-- When completion wins the per-animal serialization boundary, the later
-- governed mutation immediately invalidates/purges the just-written result.
select lives_ok(
  $$select public.service_complete_identity_assistance_job(
      '00000000-0000-4000-8000-000000017314',
      '00000000-0000-4000-8000-000000017614', 1,
      'identify-callback.v1', 'model.hide.v1',
      '[{"animalId":"00000000-0000-4000-8000-000000017502","confidenceBand":"possible","reasonCodes":["ear_shape_similar"]}]'::jsonb,
      false, '00000000-0000-4000-8000-000000017750'
    )$$,
  'completion can commit before a later candidate hide mutation'
);
update public.animals
   set visibility = 'hidden'::public.record_visibility
 where id = '00000000-0000-4000-8000-000000017502';
select is(
  (select pg_catalog.count(*) from private.identity_assistance_candidates as candidates
    where candidates.job_id = '00000000-0000-4000-8000-000000017314'),
  0::bigint,
  'a later governed animal hide purges the completed candidate set'
);
select ok(
  (select jobs.result_invalidated_at is not null
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000017314'),
  'a later governed animal hide invalidates the completed job'
);
delete from public.animals
 where id = '00000000-0000-4000-8000-000000017503';
select is(
  (select pg_catalog.count(*) from private.identity_assistance_candidates as candidates
    where candidates.job_id = '00000000-0000-4000-8000-000000017303'),
  0::bigint,
  'a later governed animal deletion purges a multi-candidate completed result atomically'
);
select ok(
  (select jobs.result_invalidated_at is not null
     from private.identity_assistance_jobs as jobs
    where jobs.id = '00000000-0000-4000-8000-000000017303'),
  'a later governed animal deletion invalidates the completed multi-candidate job'
);

select pg_catalog.set_config('private.identity_assistance_job_writer', '', true);
select pg_catalog.set_config('private.identity_assistance_candidate_writer', '', true);

\endif
select * from finish();
rollback;
