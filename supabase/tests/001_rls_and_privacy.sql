begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

select has_table('public', 'animals', 'animals table exists');
select has_table('private', 'precise_locations', 'precise locations are separated');
select has_table('audit', 'access_audit', 'access audit exists');
select hasnt_view('public', 'public_animal_feed', 'legacy public feed view is removed');
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

select has_function(
  'public',
  'list_public_sighting_feed',
  array['uuid', 'integer'],
  'public feed is exposed through a narrow security-definer RPC'
);

select is_empty(
  $$select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'list_public_sighting_feed'
       and pg_get_function_result(p.oid) ~ '(latitude|longitude|ciphertext|nonce|visible_at|storage_path)'$$,
  'public feed return signature excludes precise location, exact time, and storage paths'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'private'),
  0,
  'private schema has no client-facing RLS policies'
);

select * from finish();
rollback;
