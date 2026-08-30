begin;
select no_plan();

select has_table('private', 'identity_assistance_claim_results',
  'bounded claim replay metadata exists');
select is(
  (select array_agg(a.attname::text order by key_columns.ordinality)
     from pg_constraint c
     join pg_class r on r.oid = c.conrelid
     join pg_namespace n on n.oid = r.relnamespace
     cross join lateral unnest(c.conkey) with ordinality as key_columns(attnum, ordinality)
     join pg_attribute a on a.attrelid = r.oid and a.attnum = key_columns.attnum
    where n.nspname = 'private'
      and r.relname = 'identity_assistance_claim_results'
      and c.contype = 'p'),
  array['request_id', 'ordinal']::text[],
  'claim replay metadata is ordered by request ordinal'
);
select ok(
  exists (
    select 1
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
     where n.nspname = 'private'
       and r.relname = 'identity_assistance_claim_results'
       and c.contype = 'u'
       and (select array_agg(a.attname::text order by key_columns.ordinality)
              from unnest(c.conkey) with ordinality as key_columns(attnum, ordinality)
              join pg_attribute a on a.attrelid = r.oid and a.attnum = key_columns.attnum)
           = array['request_id', 'job_id']::text[]
  ),
  'claim replay metadata stores each claimed job once per request'
);
select is(
  (select pg_catalog.format_type(a.atttypid, a.atttypmod)
     from pg_attribute a
     join pg_class r on r.oid = a.attrelid
     join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'private'
      and r.relname = 'identity_assistance_claim_results'
      and a.attname = 'lease_id' and not a.attisdropped),
  'uuid',
  'claim replay leases use opaque UUIDs'
);
select ok(
  exists (
    select 1
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      join pg_class parent on parent.oid = c.confrelid
      join pg_namespace parent_n on parent_n.oid = parent.relnamespace
     where n.nspname = 'private'
       and r.relname = 'identity_assistance_claim_results'
       and c.contype = 'f'
       and parent_n.nspname = 'private'
       and parent.relname = 'identity_assistance_service_requests'
       and c.confdeltype = 'c'
       and (select array_agg(a.attname::text order by key_columns.ordinality)
              from unnest(c.conkey) with ordinality as key_columns(attnum, ordinality)
              join pg_attribute a on a.attrelid = r.oid and a.attnum = key_columns.attnum)
           = array['request_id']::text[]
  ),
  'claim replay metadata cascades with its service request'
);
select is(
  (select r.relrowsecurity
     from pg_class r
     join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'private' and r.relname = 'identity_assistance_claim_results'),
  true,
  'claim replay metadata has RLS enabled'
);
with roles(role_name) as (values ('public'), ('anon'), ('authenticated'), ('service_role')),
privileges(privilege_name) as (values ('select'), ('insert'), ('update'), ('delete'))
select ok(
  case
    when pg_catalog.to_regclass('private.identity_assistance_claim_results') is null then false
    else not has_table_privilege(
      roles.role_name,
      'private.identity_assistance_claim_results',
      privileges.privilege_name
    )
  end,
  roles.role_name || ' has no ' || privileges.privilege_name || ' on private.identity_assistance_claim_results'
)
from roles cross join privileges;

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values ('00000000-0000-4000-8000-000000001800', 'Identity Guard Owner', pg_catalog.now());
set local session_replication_role = origin;

insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
)
select pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1800 + fixture)::text, 12, '0'))::uuid,
       '00000000-0000-4000-8000-000000001800', pg_catalog.now(),
       '8928308280fffff', 'morning', 'normal', 'limited',
       'identity-guard-' || fixture::text
  from generate_series(1, 30) as fixtures(fixture);

insert into public.media_assets (
  id, sighting_id, uploader_id, storage_bucket, storage_path, sha256,
  redaction_confirmed_at, training_eligible, client_media_id, byte_length,
  width, height, recipe_version, detector_versions, status, reviewed_at
)
select pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1900 + fixture)::text, 12, '0'))::uuid,
       pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1800 + fixture)::text, 12, '0'))::uuid,
       '00000000-0000-4000-8000-000000001800',
       'media-staging',
       'jobs/' || pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1950 + fixture)::text, 12, '0')) || '.jpg',
       repeat(substr('abcdef0123456789', (fixture % 16) + 1, 1), 64),
       pg_catalog.now(), false, 'guard-media-' || lpad(fixture::text, 2, '0'),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       'quarantined', pg_catalog.now()
  from generate_series(1, 30) as fixtures(fixture);

insert into private.media_upload_jobs (
  id, uploader_id, sighting_id, media_id, sha256, byte_length, width, height,
  recipe_version, detector_versions, confirmed_at_local, object_path, status,
  reserved_at, reservation_expires_at, upload_token_expires_at, next_cleanup_at,
  finalized_at, media_asset_id
)
select pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1950 + fixture)::text, 12, '0'))::uuid,
       '00000000-0000-4000-8000-000000001800',
       pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1800 + fixture)::text, 12, '0'))::uuid,
       'guard-media-' || lpad(fixture::text, 2, '0'),
       repeat(substr('abcdef0123456789', (fixture % 16) + 1, 1), 64),
       4096, 512, 512, 'jpeg-srgb-2048-q88.v1',
       '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
       pg_catalog.now(),
       'jobs/' || pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1950 + fixture)::text, 12, '0')) || '.jpg',
       'finalized', pg_catalog.now(), pg_catalog.now() + interval '10 minutes',
       pg_catalog.now() + interval '2 hours', 'infinity'::timestamptz,
       pg_catalog.now(),
       pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1900 + fixture)::text, 12, '0'))::uuid
  from generate_series(1, 30) as fixtures(fixture);

insert into public.animals (id, primary_alias, profile_created_by, visibility)
select pg_catalog.format('00000000-0000-4000-8000-%s', lpad((1800 + fixture)::text, 12, '0'))::uuid,
       'Guard Candidate ' || fixture::text,
       '00000000-0000-4000-8000-000000001800', 'limited'
  from generate_series(20, 40) as fixtures(fixture);

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, notice_version, input_sha256
) values
  ('00000000-0000-4000-8000-000000001810', '00000000-0000-4000-8000-000000001801', '00000000-0000-4000-8000-000000001901', '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('a', 64)),
  ('00000000-0000-4000-8000-000000001811', '00000000-0000-4000-8000-000000001802', null, null, 'notice.v1', repeat('b', 64)),
  ('00000000-0000-4000-8000-000000001813', '00000000-0000-4000-8000-000000001803', '00000000-0000-4000-8000-000000001903', '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('c', 64)),
  ('00000000-0000-4000-8000-000000001821', '00000000-0000-4000-8000-000000001811', '00000000-0000-4000-8000-000000001911', '00000000-0000-4000-8000-000000001800', 'notice.v1', repeat('d', 64));

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, lease_id, lease_expires_at, processing_at
) values
  ('00000000-0000-4000-8000-000000001812', '00000000-0000-4000-8000-000000001804', '00000000-0000-4000-8000-000000001904', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('e', 64), 2, '00000000-0000-4000-8000-000000001984', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001814', '00000000-0000-4000-8000-000000001805', '00000000-0000-4000-8000-000000001905', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('f', 64), 1, '00000000-0000-4000-8000-000000001985', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001815', '00000000-0000-4000-8000-000000001806', '00000000-0000-4000-8000-000000001906', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('1', 64), 1, '00000000-0000-4000-8000-000000001986', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001816', '00000000-0000-4000-8000-000000001807', '00000000-0000-4000-8000-000000001907', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('2', 64), 1, '00000000-0000-4000-8000-000000001987', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001817', '00000000-0000-4000-8000-000000001808', '00000000-0000-4000-8000-000000001908', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('3', 64), 1, '00000000-0000-4000-8000-000000001988', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001823', '00000000-0000-4000-8000-000000001813', '00000000-0000-4000-8000-000000001913', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('4', 64), 1, '00000000-0000-4000-8000-000000001993', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001825', '00000000-0000-4000-8000-000000001815', '00000000-0000-4000-8000-000000001915', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('5', 64), 1, '00000000-0000-4000-8000-000000001995', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001826', '00000000-0000-4000-8000-000000001816', '00000000-0000-4000-8000-000000001916', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('6', 64), 1, '00000000-0000-4000-8000-000000001996', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001827', '00000000-0000-4000-8000-000000001817', '00000000-0000-4000-8000-000000001917', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('7', 64), 1, '00000000-0000-4000-8000-000000001997', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001828', '00000000-0000-4000-8000-000000001818', '00000000-0000-4000-8000-000000001918', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('8', 64), 1, '00000000-0000-4000-8000-000000001998', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001829', '00000000-0000-4000-8000-000000001819', '00000000-0000-4000-8000-000000001919', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('9', 64), 1, '00000000-0000-4000-8000-000000001999', pg_catalog.now() + interval '2 minutes', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001830', '00000000-0000-4000-8000-000000001820', '00000000-0000-4000-8000-000000001920', '00000000-0000-4000-8000-000000001800', 'processing', 'notice.v1', repeat('0', 64), 1, '00000000-0000-4000-8000-000000002000', pg_catalog.now() + interval '2 minutes', pg_catalog.now());

insert into private.identity_assistance_jobs (
  id, sighting_id, media_asset_id, requester_id, status, notice_version,
  input_sha256, attempt_count, model_version, callback_contract_version,
  new_cat_recommended, completed_at, selected_at
) values
  ('00000000-0000-4000-8000-000000001818', '00000000-0000-4000-8000-000000001809', '00000000-0000-4000-8000-000000001909', '00000000-0000-4000-8000-000000001800', 'succeeded', 'notice.v1', repeat('a', 64), 1, 'model.v1', 'identify-callback.v1', false, pg_catalog.now(), null),
  ('00000000-0000-4000-8000-000000001819', '00000000-0000-4000-8000-000000001810', '00000000-0000-4000-8000-000000001910', '00000000-0000-4000-8000-000000001800', 'succeeded', 'notice.v1', repeat('b', 64), 1, 'model.v1', 'identify-callback.v1', false, pg_catalog.now(), null),
  ('00000000-0000-4000-8000-000000001820', '00000000-0000-4000-8000-000000001812', '00000000-0000-4000-8000-000000001912', '00000000-0000-4000-8000-000000001800', 'succeeded', 'notice.v1', repeat('c', 64), 1, 'model.v1', 'identify-callback.v1', false, pg_catalog.now(), pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001824', '00000000-0000-4000-8000-000000001814', '00000000-0000-4000-8000-000000001914', '00000000-0000-4000-8000-000000001800', 'succeeded', 'notice.v1', repeat('d', 64), 1, 'model.v1', 'identify-callback.v1', true, pg_catalog.now(), null);

insert into private.identity_assistance_jobs (
  id, sighting_id, status, notice_version, input_sha256, failed_at, failure_code
) values (
  '00000000-0000-4000-8000-000000001822', '00000000-0000-4000-8000-000000001822',
  'failed', 'notice.v1', null, pg_catalog.now(), 'source_invalidated'
);

select lives_ok(
  $$insert into private.identity_assistance_jobs
      (id, sighting_id, notice_version, input_sha256)
    values ('00000000-0000-4000-8000-000000001831',
      '00000000-0000-4000-8000-000000001821', 'notice.v1', repeat('e', 64))$$,
  'requested jobs may remain dormant without requester or media binding'
);
select lives_ok(
  $$insert into private.identity_assistance_jobs
      (id, sighting_id, status, notice_version, input_sha256, failed_at, failure_code)
    values ('00000000-0000-4000-8000-000000001832',
      '00000000-0000-4000-8000-000000001823', 'failed', 'notice.v1', null,
      pg_catalog.now(), 'source_invalidated')$$,
  'terminal cleanup may retain neither requester, media, nor input hash'
);
select lives_ok(
  $$insert into private.identity_assistance_jobs
      (id, sighting_id, status, notice_version, input_sha256, model_version,
       callback_contract_version, new_cat_recommended, completed_at,
       withdrawn_at, result_invalidated_at)
    values ('00000000-0000-4000-8000-000000001833',
      '00000000-0000-4000-8000-000000001824', 'succeeded', 'notice.v1', null,
      'model.v1', 'identify-callback.v1', false, pg_catalog.now(),
      pg_catalog.now(), pg_catalog.now())$$,
  'invalidated cleanup may retain neither requester, media, nor input hash'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs
      (id, sighting_id, status, notice_version, input_sha256, attempt_count,
       lease_id, lease_expires_at, processing_at)
    values ('00000000-0000-4000-8000-000000001834',
      '00000000-0000-4000-8000-000000001825', 'processing', 'notice.v1',
      repeat('f', 64), 1, '00000000-0000-4000-8000-000000002004',
      pg_catalog.now() + interval '2 minutes', pg_catalog.now())$$,
  '42501', 'identity_assistance_job_binding_required',
  'processing jobs require requester and canonical media binding'
);
select throws_ok(
  $$insert into private.identity_assistance_jobs
      (id, sighting_id, status, notice_version, input_sha256, model_version,
       callback_contract_version, new_cat_recommended, completed_at)
    values ('00000000-0000-4000-8000-000000001835',
      '00000000-0000-4000-8000-000000001826', 'succeeded', 'notice.v1',
      repeat('1', 64), 'model.v1', 'identify-callback.v1', false, pg_catalog.now())$$,
  '42501', 'identity_assistance_job_binding_required',
  'actionable succeeded jobs require requester and canonical media binding'
);

select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001810', true);
select throws_ok(
  $$update private.identity_assistance_jobs
       set recipe_version = 'different.v1'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'request provenance cannot be rewritten');
select throws_ok(
  $$update private.identity_assistance_jobs set crop_contract_version = 'different.v1'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'crop contract provenance is immutable after insert'
);
select throws_ok(
  $$update private.identity_assistance_jobs set embedding_contract_version = 'different.v1'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'embedding contract provenance is immutable after insert'
);
select throws_ok(
  $$update private.identity_assistance_jobs set identify_contract_version = 'different.v1'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'identify contract provenance is immutable after insert'
);
select throws_ok(
  $$update private.identity_assistance_jobs set sighting_id = '00000000-0000-4000-8000-000000001802'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'sighting binding is immutable after insert'
);
select throws_ok(
  $$update private.identity_assistance_jobs set media_asset_id = '00000000-0000-4000-8000-000000001902'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'media binding cannot be swapped after insert'
);
select throws_ok(
  $$update private.identity_assistance_jobs set requester_id = null
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'requester binding cannot be cleared while requested'
);
select throws_ok(
  $$update private.identity_assistance_jobs set requested_at = requested_at - interval '1 second'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'requested time is immutable after insert'
);
select throws_ok(
  $$update private.identity_assistance_jobs set purpose = 'training'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'purpose is immutable after insert'
);
select throws_ok(
  $$update private.identity_assistance_jobs set notice_version = 'notice.v2'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'notice version is immutable after insert'
);
select throws_ok(
  $$update private.identity_assistance_jobs set input_sha256 = repeat('f', 64)
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'input fingerprint cannot be swapped after insert'
);
select set_config('private.identity_assistance_job_writer', '', true);
select throws_ok(
  $$update private.identity_assistance_jobs set updated_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_write_forbidden',
  'job updates require the exact scoped writer context'
);
select throws_ok(
  $$delete from private.identity_assistance_jobs
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_delete_forbidden',
  'job deletes require the exact scoped deleter context'
);

select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001812', true);
select throws_ok(
  $$update private.identity_assistance_jobs set attempt_count = 1
     where id = '00000000-0000-4000-8000-000000001812'$$,
  '42501', 'identity_assistance_job_attempt_decreased',
  'job attempts never decrease'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001813', true);
select lives_ok(
  $$update private.identity_assistance_jobs
       set status = 'processing', attempt_count = 1,
           lease_id = '00000000-0000-4000-8000-000000002013',
           lease_expires_at = pg_catalog.now() + interval '2 minutes',
           processing_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000001813'$$,
  'requested jobs may enter processing under the scoped writer'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001814', true);
select lives_ok(
  $$update private.identity_assistance_jobs
       set status = 'requested', lease_id = null, lease_expires_at = null,
           processing_at = null
     where id = '00000000-0000-4000-8000-000000001814'$$,
  'processing jobs may return to requested for retry'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001815', true);
select lives_ok(
  $$update private.identity_assistance_jobs
       set status = 'succeeded', lease_id = null, lease_expires_at = null,
           model_version = 'model.v1', callback_contract_version = 'identify-callback.v1',
           new_cat_recommended = false, completed_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000001815'$$,
  'processing jobs may complete successfully'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001816', true);
select lives_ok(
  $$update private.identity_assistance_jobs
       set status = 'failed', lease_id = null, lease_expires_at = null,
           failed_at = pg_catalog.now(), failure_code = 'internal_error'
     where id = '00000000-0000-4000-8000-000000001816'$$,
  'processing jobs may fail terminally'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001817', true);
select lives_ok(
  $$update private.identity_assistance_jobs
       set status = 'cancelled', lease_id = null, lease_expires_at = null,
           cancelled_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000001817'$$,
  'processing jobs may be cancelled'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001818', true);
select lives_ok(
  $$update private.identity_assistance_jobs
       set status = 'cancelled', input_sha256 = null, model_version = null,
           callback_contract_version = null, new_cat_recommended = null,
           completed_at = null, cancelled_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000001818'$$,
  'an actionable succeeded job may be cancelled with terminal cleanup'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001819', true);
select lives_ok(
  $$update private.identity_assistance_jobs
       set status = 'expired', input_sha256 = null, model_version = null,
           callback_contract_version = null, new_cat_recommended = null,
           completed_at = null, expires_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000001819'$$,
  'an actionable succeeded job may expire with terminal cleanup'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001820', true);
select throws_ok(
  $$update private.identity_assistance_jobs
       set status = 'expired', input_sha256 = null, model_version = null,
           callback_contract_version = null, new_cat_recommended = null,
           completed_at = null, expires_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000001820'$$,
  '42501', 'identity_assistance_job_transition_forbidden',
  'selected succeeded jobs cannot be expired as unselected results'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001821', true);
select throws_ok(
  $$update private.identity_assistance_jobs
       set status = 'failed', failed_at = pg_catalog.now(), failure_code = 'internal_error'
     where id = '00000000-0000-4000-8000-000000001821'$$,
  '42501', 'identity_assistance_job_transition_forbidden',
  'requested jobs cannot skip processing into failure'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001822', true);
select throws_ok(
  $$update private.identity_assistance_jobs
       set status = 'requested', failed_at = null, failure_code = null
     where id = '00000000-0000-4000-8000-000000001822'$$,
  '42501', 'identity_assistance_job_transition_forbidden',
  'terminal failed jobs cannot become requested again'
);
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001823', true);
select throws_ok(
  $$update private.identity_assistance_jobs set media_asset_id = null
     where id = '00000000-0000-4000-8000-000000001823'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'processing jobs retain their media binding'
);

select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001824', true);
select throws_ok(
  $$update private.identity_assistance_jobs set model_version = 'model.v2'
     where id = '00000000-0000-4000-8000-000000001824'$$,
  '42501', 'identity_assistance_job_completion_immutable',
  'successful model provenance is immutable'
);
select throws_ok(
  $$update private.identity_assistance_jobs set callback_contract_version = null
     where id = '00000000-0000-4000-8000-000000001824'$$,
  '42501', 'identity_assistance_job_completion_immutable',
  'successful callback provenance is immutable'
);
select throws_ok(
  $$update private.identity_assistance_jobs set new_cat_recommended = false
     where id = '00000000-0000-4000-8000-000000001824'$$,
  '42501', 'identity_assistance_job_completion_immutable',
  'successful recommendation provenance is immutable'
);
select throws_ok(
  $$update private.identity_assistance_jobs set completed_at = completed_at + interval '1 second'
     where id = '00000000-0000-4000-8000-000000001824'$$,
  '42501', 'identity_assistance_job_completion_immutable',
  'successful completion time is immutable'
);
select set_config('private.identity_assistance_job_writer', '', true);

select throws_ok(
  $$insert into private.identity_assistance_candidates
      (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001810', 1,
      '00000000-0000-4000-8000-000000001820', 'likely',
      array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  '42501', 'identity_assistance_candidate_write_forbidden',
  'candidate rows are writable only inside the completion boundary');
select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001810', true);
select throws_ok(
  $$insert into private.identity_assistance_candidates
      (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001810', 2,
      '00000000-0000-4000-8000-000000001835', 'possible',
      array['view_angle_limited']::private.identity_assistance_reason_code[])$$,
  '42501', 'identity_assistance_candidate_job_not_processing',
  'candidate insertion requires a processing job'
);
select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001824', true);
select throws_ok(
  $$insert into private.identity_assistance_candidates
      (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001825', 1,
      '00000000-0000-4000-8000-000000001834', 'likely',
      array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  '42501', 'identity_assistance_candidate_write_forbidden',
  'candidate insertion rejects a writer scoped to another job'
);
select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001825', true);
select lives_ok(
  $$insert into private.identity_assistance_candidates
      (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001825', 1,
      '00000000-0000-4000-8000-000000001834', 'likely',
      array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  'the scoped completion boundary may insert a processing candidate'
);
select throws_ok(
  $$update private.identity_assistance_candidates set confidence_band = 'weak'
     where job_id = '00000000-0000-4000-8000-000000001825' and rank = 1$$,
  '42501', 'identity_assistance_candidate_update_forbidden',
  'candidate content is immutable even inside a writer boundary'
);
select set_config('private.identity_assistance_candidate_writer', '', true);
select throws_ok(
  $$delete from private.identity_assistance_candidates
     where job_id = '00000000-0000-4000-8000-000000001825' and rank = 1$$,
  '42501', 'identity_assistance_candidate_write_forbidden',
  'candidate deletion requires scoped cleanup or invalidation'
);
select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001825', true);
select lives_ok(
  $$delete from private.identity_assistance_candidates
     where job_id = '00000000-0000-4000-8000-000000001825' and rank = 1$$,
  'scoped cleanup may delete an immutable candidate'
);
select set_config('private.identity_assistance_candidate_writer', '', true);

insert into private.identity_assistance_service_requests (request_id, payload_sha256, operation)
values
  ('00000000-0000-4000-8000-000000001840', repeat('a', 64), 'claim'),
  ('00000000-0000-4000-8000-000000001841', repeat('b', 64), 'claim');
select lives_ok(
  $$insert into private.identity_assistance_claim_results
      (request_id, ordinal, job_id, lease_id, attempt, lease_expires_at, created_at)
    values ('00000000-0000-4000-8000-000000001840', 1,
      '00000000-0000-4000-8000-000000001810',
      '00000000-0000-4000-8000-000000001842', 1,
      '2026-08-31 00:02:00+00', '2026-08-31 00:00:00+00')$$,
  'bounded claim replay metadata accepts a valid lease result'
);
select throws_ok(
  $$insert into private.identity_assistance_claim_results
      (request_id, ordinal, job_id, lease_id, attempt, lease_expires_at)
    values ('00000000-0000-4000-8000-000000001840', 0,
      '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001843', 1, pg_catalog.now() + interval '2 minutes')$$,
  '23514', null, 'claim replay ordinals start at one'
);
select throws_ok(
  $$insert into private.identity_assistance_claim_results
      (request_id, ordinal, job_id, lease_id, attempt, lease_expires_at)
    values ('00000000-0000-4000-8000-000000001840', 11,
      '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001844', 1, pg_catalog.now() + interval '2 minutes')$$,
  '23514', null, 'claim replay ordinals are bounded at ten'
);
select throws_ok(
  $$insert into private.identity_assistance_claim_results
      (request_id, ordinal, job_id, lease_id, attempt, lease_expires_at)
    values ('00000000-0000-4000-8000-000000001840', 2,
      '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001845', 0, pg_catalog.now() + interval '2 minutes')$$,
  '23514', null, 'claim replay attempts start at one'
);
select throws_ok(
  $$insert into private.identity_assistance_claim_results
      (request_id, ordinal, job_id, lease_id, attempt, lease_expires_at)
    values ('00000000-0000-4000-8000-000000001840', 2,
      '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001846', 4, pg_catalog.now() + interval '2 minutes')$$,
  '23514', null, 'claim replay attempts are bounded at three'
);
select throws_ok(
  $$insert into private.identity_assistance_claim_results
      (request_id, ordinal, job_id, lease_id, attempt, lease_expires_at, created_at)
    values ('00000000-0000-4000-8000-000000001840', 2,
      '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001847', 1,
      '2026-08-31 00:00:00+00', '2026-08-31 00:00:00+00')$$,
  '23514', null, 'claim replay leases expire after their result was created'
);
select throws_ok(
  $$insert into private.identity_assistance_claim_results
      (request_id, ordinal, job_id, lease_id, attempt, lease_expires_at)
    values ('00000000-0000-4000-8000-000000001840', 2,
      '00000000-0000-4000-8000-000000001810',
      '00000000-0000-4000-8000-000000001848', 1, pg_catalog.now() + interval '2 minutes')$$,
  '23505', null, 'claim replay rejects the same job twice in one request'
);
select lives_ok(
  $$insert into private.identity_assistance_claim_results
      (request_id, ordinal, job_id, lease_id, attempt, lease_expires_at)
    values ('00000000-0000-4000-8000-000000001841', 1,
      '00000000-0000-4000-8000-000000001811',
      '00000000-0000-4000-8000-000000001849', 1, pg_catalog.now() + interval '2 minutes')$$,
  'a second service request owns its own replay rows'
);
select lives_ok(
  $sql$
  do $body$
    begin
      delete from private.identity_assistance_service_requests
       where request_id = '00000000-0000-4000-8000-000000001841';
      if exists (
        select 1 from private.identity_assistance_claim_results
         where request_id = '00000000-0000-4000-8000-000000001841'
      ) then
        raise exception 'claim replay rows remain';
      end if;
    end
  $body$;
  $sql$,
  'deleting a service request cascades its claim replay rows'
);

select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001826', true);
insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes) values
  ('00000000-0000-4000-8000-000000001826', 1, '00000000-0000-4000-8000-000000001831', 'likely', array['face_pattern_similar']::private.identity_assistance_reason_code[]),
  ('00000000-0000-4000-8000-000000001826', 2, '00000000-0000-4000-8000-000000001834', 'possible', array['view_angle_limited']::private.identity_assistance_reason_code[]);
select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001827', true);
insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes) values
  ('00000000-0000-4000-8000-000000001827', 1, '00000000-0000-4000-8000-000000001831', 'likely', array['ear_shape_similar']::private.identity_assistance_reason_code[]),
  ('00000000-0000-4000-8000-000000001827', 2, '00000000-0000-4000-8000-000000001835', 'weak', array['image_quality_limited']::private.identity_assistance_reason_code[]);
select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001828', true);
insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes) values
  ('00000000-0000-4000-8000-000000001828', 1, '00000000-0000-4000-8000-000000001832', 'likely', array['coat_marking_similar']::private.identity_assistance_reason_code[]),
  ('00000000-0000-4000-8000-000000001828', 2, '00000000-0000-4000-8000-000000001834', 'possible', array['view_angle_limited']::private.identity_assistance_reason_code[]);
select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001829', true);
insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes) values
  ('00000000-0000-4000-8000-000000001829', 1, '00000000-0000-4000-8000-000000001833', 'likely', array['face_pattern_similar']::private.identity_assistance_reason_code[]),
  ('00000000-0000-4000-8000-000000001829', 2, '00000000-0000-4000-8000-000000001835', 'weak', array['image_quality_limited']::private.identity_assistance_reason_code[]);
select set_config('private.identity_assistance_candidate_writer', '00000000-0000-4000-8000-000000001830', true);
insert into private.identity_assistance_candidates (job_id, rank, animal_id, confidence_band, reason_codes) values
  ('00000000-0000-4000-8000-000000001830', 1, '00000000-0000-4000-8000-000000001836', 'likely', array['face_pattern_similar']::private.identity_assistance_reason_code[]);
select set_config('private.identity_assistance_candidate_writer', '', true);

select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001826', true);
update private.identity_assistance_jobs
   set status = 'succeeded', lease_id = null, lease_expires_at = null,
       model_version = 'model.v1', callback_contract_version = 'identify-callback.v1',
       new_cat_recommended = false, completed_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000001826';
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001827', true);
update private.identity_assistance_jobs
   set status = 'succeeded', lease_id = null, lease_expires_at = null,
       model_version = 'model.v1', callback_contract_version = 'identify-callback.v1',
       new_cat_recommended = false, completed_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000001827';
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001828', true);
update private.identity_assistance_jobs
   set status = 'succeeded', lease_id = null, lease_expires_at = null,
       model_version = 'model.v1', callback_contract_version = 'identify-callback.v1',
       new_cat_recommended = false, completed_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000001828';
select set_config('private.identity_assistance_job_writer', '00000000-0000-4000-8000-000000001829', true);
update private.identity_assistance_jobs
   set status = 'succeeded', lease_id = null, lease_expires_at = null,
       model_version = 'model.v1', callback_contract_version = 'identify-callback.v1',
       new_cat_recommended = false, completed_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000001829';
select set_config('private.identity_assistance_job_writer', '', true);

select lives_ok(
  $$update public.animals set visibility = 'hidden'
     where id = '00000000-0000-4000-8000-000000001831'$$,
  'hiding a candidate invalidates every containing result set without blocking the animal'
);
select is(
  (select count(*) from private.identity_assistance_candidates
    where job_id in ('00000000-0000-4000-8000-000000001826', '00000000-0000-4000-8000-000000001827')),
  0::bigint,
  'hiding one animal purges each complete result set that contained it'
);
select is(
  (select count(*) from private.identity_assistance_jobs
    where id in ('00000000-0000-4000-8000-000000001826', '00000000-0000-4000-8000-000000001827')
      and input_sha256 is null and withdrawn_at is not null and result_invalidated_at is not null),
  2::bigint,
  'hidden-animal invalidation clears every fingerprint and marks every result withdrawn'
);
select is(
  (select count(*) from private.identity_assistance_events
    where job_id in ('00000000-0000-4000-8000-000000001826', '00000000-0000-4000-8000-000000001827')
      and event_type = 'invalidated' and failure_code = 'source_invalidated'
      and reason_code = 'source_invalidated'),
  2::bigint,
  'hidden-animal invalidation appends one bounded event per affected job'
);
select is(
  (select visibility::text from public.animals where id = '00000000-0000-4000-8000-000000001831'),
  'hidden',
  'the animal hide itself still commits inside the test transaction'
);

select lives_ok(
  $$update public.animals set visibility = 'archived', archived_at = pg_catalog.now()
     where id = '00000000-0000-4000-8000-000000001832'$$,
  'archiving a candidate invalidates its complete result set without blocking the animal'
);
select is(
  (select count(*) from private.identity_assistance_candidates
    where job_id = '00000000-0000-4000-8000-000000001828'),
  0::bigint,
  'animal archive purges the whole containing candidate set'
);
select ok(
  (select input_sha256 is null and withdrawn_at is not null and result_invalidated_at is not null
     from private.identity_assistance_jobs where id = '00000000-0000-4000-8000-000000001828'),
  'animal archive clears the result fingerprint and marks invalidation'
);

select lives_ok(
  $$delete from public.animals where id = '00000000-0000-4000-8000-000000001833'$$,
  'deleting a candidate invalidates its complete result set before the restrictive foreign key'
);
select is(
  (select count(*) from private.identity_assistance_candidates
    where job_id = '00000000-0000-4000-8000-000000001829'),
  0::bigint,
  'animal deletion purges the whole containing candidate set'
);
select ok(
  not exists (select 1 from public.animals where id = '00000000-0000-4000-8000-000000001833'),
  'the candidate animal deletion is not blocked'
);
select ok(
  (select input_sha256 is null and withdrawn_at is not null and result_invalidated_at is not null
     from private.identity_assistance_jobs where id = '00000000-0000-4000-8000-000000001829'),
  'animal deletion clears the result fingerprint and marks invalidation'
);

select lives_ok(
  $$update public.animals set visibility = 'hidden'
     where id = '00000000-0000-4000-8000-000000001836'$$,
  'hiding a candidate cancels an in-flight result construction without blocking the animal'
);
select ok(
  (select status = 'cancelled' and input_sha256 is null
      and withdrawn_at is not null and result_invalidated_at is not null
     from private.identity_assistance_jobs where id = '00000000-0000-4000-8000-000000001830'),
  'processing result invalidation becomes terminal and clears its fingerprint'
);
select is(
  (select count(*) from private.identity_assistance_candidates
    where job_id = '00000000-0000-4000-8000-000000001830'),
  0::bigint,
  'processing result invalidation purges its partial candidate set'
);

select * from finish();
rollback;
