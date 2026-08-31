begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000911', 'Recovery Reporter', now());
set local session_replication_role = origin;

select is(
  public.create_sighting_with_location(
    '00000000-0000-4000-8000-000000000911',
    '2026-08-27T00:00:00.000Z',
    '89652636d87ffff',
    'morning',
    'normal',
    'public',
    '2026-08-27T02:00:00.000Z',
    '{"coat":"tortoiseshell"}'::jsonb,
    'First payload wins.',
    'draft-12345678',
    decode('010203', 'hex'),
    decode('040506', 'hex'),
    '00000000-0000-4000-8000-000000000912'
  ),
  public.create_sighting_with_location(
    '00000000-0000-4000-8000-000000000911',
    '2026-08-27T00:00:00.000Z',
    '89652636d87ffff',
    'morning',
    'normal',
    'public',
    '2026-08-27T02:00:00.000Z',
    '{"coat":"tortoiseshell"}'::jsonb,
    'First payload wins.',
    'draft-12345678',
    decode('010203', 'hex'),
    decode('040506', 'hex'),
    '00000000-0000-4000-8000-000000000912'
  ),
  'identical RPC calls return the existing sighting ID'
);
select is(
  public.create_sighting_with_location(
    '00000000-0000-4000-8000-000000000911',
    '2026-08-27T23:59:59.000Z',
    '89652636d8fffff',
    'evening',
    'critical',
    'hidden',
    null,
    '{"coat":"different"}'::jsonb,
    'Conflicting retry must not mutate.',
    'draft-12345678',
    decode('111213', 'hex'),
    decode('141516', 'hex'),
    '00000000-0000-4000-8000-000000000913'
  ),
  (select id from public.sightings
   where reporter_id = '00000000-0000-4000-8000-000000000911'
     and client_dedupe_key = 'draft-12345678'),
  'a conflicting retry returns the existing sighting ID'
);
select is(
  (select traits from public.sightings
   where reporter_id = '00000000-0000-4000-8000-000000000911'
     and client_dedupe_key = 'draft-12345678'),
  '{"coat":"tortoiseshell"}'::jsonb,
  'a conflicting retry does not mutate the stored sighting'
);
select is(
  (select count(*) from public.sightings
   where reporter_id = '00000000-0000-4000-8000-000000000911'
     and client_dedupe_key = 'draft-12345678'),
  1::bigint,
  'stable dedupe creates exactly one sighting'
);
select is(
  (select count(*) from private.precise_locations where sighting_id = (
    select id from public.sightings
    where reporter_id = '00000000-0000-4000-8000-000000000911'
      and client_dedupe_key = 'draft-12345678'
  )),
  1::bigint,
  'stable dedupe creates exactly one precise location'
);
select is(
  (select count(*) from audit.access_audit where actor_id = '00000000-0000-4000-8000-000000000911'
    and action = 'create' and resource_type = 'sighting' and purpose = 'community_sighting'),
  1::bigint,
  'stable dedupe creates exactly one create audit row'
);

select * from finish();
rollback;
