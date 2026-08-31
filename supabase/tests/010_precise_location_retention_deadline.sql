begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000001001', 'Retention Reporter', now());
insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket,
  risk, visibility, traits, client_dedupe_key
) values
  ('00000000-0000-4000-8000-000000001011', '00000000-0000-4000-8000-000000001001',
   '2024-02-29T12:00:00.000Z', '89652636d87ffff', 'afternoon',
   'normal', 'limited', '{}'::jsonb, 'retention-utc'),
  ('00000000-0000-4000-8000-000000001012', '00000000-0000-4000-8000-000000001001',
   '2024-02-29T12:00:00.000Z', '89652636d87ffff', 'afternoon',
   'normal', 'limited', '{}'::jsonb, 'retention-singapore'),
  ('00000000-0000-4000-8000-000000001013', '00000000-0000-4000-8000-000000001001',
   '2024-02-29T12:00:00.000Z', '89652636d87ffff', 'afternoon',
   'normal', 'limited', '{}'::jsonb, 'retention-override');
set local session_replication_role = origin;

set local time zone 'UTC';
insert into private.precise_locations (sighting_id, ciphertext, nonce, captured_at) values
  ('00000000-0000-4000-8000-000000001011', decode('0102', 'hex'), decode('0304', 'hex'),
   '2024-02-29T12:00:00.000Z');

set local time zone 'Asia/Singapore';
insert into private.precise_locations (sighting_id, ciphertext, nonce, captured_at) values
  ('00000000-0000-4000-8000-000000001012', decode('0506', 'hex'), decode('0708', 'hex'),
   '2024-02-29T12:00:00.000Z');

select is(
  (select is_generated from information_schema.columns
    where table_schema = 'private' and table_name = 'precise_locations'
      and column_name = 'coarsen_after'),
  'ALWAYS',
  'retention deadline remains a generated column'
);
select is(
  (select coarsen_after from private.precise_locations
    where sighting_id = '00000000-0000-4000-8000-000000001011'),
  '2025-02-28T12:00:00.000Z'::timestamptz,
  'leap-day input advances by twelve UTC calendar months'
);
select is(
  (select coarsen_after from private.precise_locations
    where sighting_id = '00000000-0000-4000-8000-000000001011'),
  (select coarsen_after from private.precise_locations
    where sighting_id = '00000000-0000-4000-8000-000000001012'),
  'session time zone cannot change the retention deadline'
);
select throws_ok(
  $$insert into private.precise_locations
      (sighting_id, ciphertext, nonce, captured_at, coarsen_after) values
      ('00000000-0000-4000-8000-000000001013', decode('090a', 'hex'), decode('0b0c', 'hex'),
       '2024-02-29T12:00:00.000Z', '2099-01-01T00:00:00.000Z')$$,
  '428C9', null,
  'callers cannot override the generated retention deadline'
);

select * from finish();
rollback;
