begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

select has_function(
  'public',
  'create_sighting_in_public_cell',
  array['uuid', 'timestamp with time zone', 'text', 'text', 'public.risk_tier', 'public.record_visibility', 'timestamp with time zone', 'jsonb', 'text', 'text', 'text'],
  'manual-area service RPC exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_sighting_in_public_cell(uuid, timestamptz, text, text, public.risk_tier, public.record_visibility, timestamptz, jsonb, text, text, text)',
    'execute'
  ),
  'ordinary callers cannot execute the manual-area RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_sighting_in_public_cell(uuid, timestamptz, text, text, public.risk_tier, public.record_visibility, timestamptz, jsonb, text, text, text)',
    'execute'
  ),
  'service role can execute the manual-area RPC'
);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000001901', 'Manual Area Adult', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001902', 'Manual Area Other Adult', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000001903', 'Manual Area Minor', null);
set local session_replication_role = origin;

set local role authenticated;
select throws_ok(
  $$select public.create_sighting_in_public_cell('00000000-0000-4000-8000-000000001901', pg_catalog.now(), '89652636d87ffff', 'afternoon', 'normal', 'public', pg_catalog.now(), '{}'::jsonb, null, 'manual-draft-12345678', 'manual-request-1')$$,
  '42501', null,
  'ordinary callers cannot invoke the service-only function'
);
reset role;

set local role service_role;
select throws_ok(
  $$select public.create_sighting_in_public_cell('00000000-0000-4000-8000-000000001903', pg_catalog.now(), '89652636d87ffff', 'afternoon', 'normal', 'public', pg_catalog.now(), '{}'::jsonb, null, 'minor-draft-12345678', 'manual-request-2')$$,
  'P0001', 'adult contributor confirmation required',
  'manual-area creation retains adult confirmation'
);
select throws_ok(
  $$select public.create_sighting_in_public_cell('00000000-0000-4000-8000-000000001901', pg_catalog.now(), '89652636d87ffff', 'afternoon', 'critical', 'public', pg_catalog.now(), '{}'::jsonb, null, 'critical-draft-12345678', 'manual-request-3')$$,
  'P0001', 'critical sightings must remain hidden',
  'manual-area creation retains the critical hidden invariant'
);

select lives_ok(
  $$select public.create_sighting_in_public_cell('00000000-0000-4000-8000-000000001901', '2026-08-31T08:00:00.000Z', '89652636d87ffff', 'afternoon', 'normal', 'public', '2026-08-31T10:00:00.000Z', '{"coat":"tabby"}'::jsonb, 'First manual payload wins.', 'manual-draft-12345678', 'manual-request-4')$$,
  'service role can create a manual-area sighting'
);
select is(
  public.create_sighting_in_public_cell('00000000-0000-4000-8000-000000001901', '2026-08-31T23:00:00.000Z', '89652636d8fffff', 'evening', 'critical', 'hidden', null, '{"coat":"other"}'::jsonb, 'Conflicting retry must not mutate.', 'manual-draft-12345678', 'manual-request-5'),
  (select id from public.sightings where reporter_id = '00000000-0000-4000-8000-000000001901' and client_dedupe_key = 'manual-draft-12345678'),
  'same actor recovers the original manual-area sighting by dedupe key'
);
select is(
  (select pg_catalog.count(*) from public.sightings where reporter_id = '00000000-0000-4000-8000-000000001901' and client_dedupe_key = 'manual-draft-12345678'),
  1::bigint,
  'manual-area retries create exactly one sighting'
);
reset role;
select is(
  (select pg_catalog.count(*) from private.precise_locations where sighting_id = (
    select id from public.sightings where reporter_id = '00000000-0000-4000-8000-000000001901' and client_dedupe_key = 'manual-draft-12345678'
  )),
  0::bigint,
  'manual-area creation stores no precise-location row'
);
select is(
  (select pg_catalog.count(*) from audit.access_audit where actor_id = '00000000-0000-4000-8000-000000001901' and action = 'create' and resource_type = 'sighting' and purpose = 'community_sighting' and request_id = 'manual-request-4'),
  1::bigint,
  'manual-area retries append one create audit record'
);
set local role service_role;
select isnt(
  public.create_sighting_in_public_cell('00000000-0000-4000-8000-000000001902', '2026-08-31T08:00:00.000Z', '89652636d87ffff', 'afternoon', 'normal', 'public', '2026-08-31T10:00:00.000Z', '{}'::jsonb, null, 'manual-draft-12345678', 'manual-request-6'),
  (select id from public.sightings where reporter_id = '00000000-0000-4000-8000-000000001901' and client_dedupe_key = 'manual-draft-12345678'),
  'a different actor cannot recover or overwrite the first actor manual-area sighting'
);
reset role;

select * from finish();
rollback;
