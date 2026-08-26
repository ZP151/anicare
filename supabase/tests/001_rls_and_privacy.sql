begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

select has_table('public', 'animals', 'animals table exists');
select has_table('private', 'precise_locations', 'precise locations are separated');
select has_table('audit', 'access_audit', 'access audit exists');
select has_view('public', 'public_animal_feed', 'public feed is a redacted view');
select has_function('private', 'apply_location_retention', array[]::text[], 'precise-location retention function exists');
select has_function('private', 'purge_expired_location_grants', array[]::text[], 'expired grant cleanup exists');
select has_function('public', 'request_media_deletion', array['uuid'], 'media deletion clears derived AI data');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.animals'::regclass),
  'animals has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sightings'::regclass),
  'sightings has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.animal_events'::regclass),
  'animal events has RLS enabled'
);

select columns_are(
  'public',
  'public_animal_feed',
  array['animal_id', 'primary_alias', 'verification', 'lifecycle', 'public_cell_id', 'time_bucket', 'last_visible_at', 'cover_media_path'],
  'public feed exposes only the approved redacted columns'
);

select is_empty(
  $$select column_name from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_animal_feed'
      and column_name in ('latitude', 'longitude', 'ciphertext', 'nonce')$$,
  'public feed never exposes precise location material'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'private'),
  0,
  'private schema has no client-facing RLS policies'
);

select * from finish();
rollback;
