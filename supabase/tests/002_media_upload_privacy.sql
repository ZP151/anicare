begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('private', 'media_upload_jobs', 'upload jobs are private');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.media_assets'::regclass),
  'media assets retain RLS'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_assets' and column_name = 'status'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_assets' and column_name = 'reviewed_at'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_assets' and column_name = 'client_media_id'
  ),
  'media rows carry server-reviewed quarantine and idempotency fields'
);
select is(
  (select public from storage.buckets where id = 'media-staging'),
  false,
  'media staging bucket is private'
);
select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and qual like '%media-staging%'$$,
  'media staging has no direct client storage policy'
);
select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'media_assets'$$,
  'media assets have no direct client row policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_assets', 'select'),
  'authenticated clients cannot select raw media rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.public_animal_feed', 'select'),
  'legacy feed view exposing a storage path is not client-readable'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000111', true);

select throws_ok(
  $$insert into public.media_assets (
      sighting_id, uploader_id, storage_bucket, storage_path, sha256,
      redaction_confirmed_at, client_media_id, status, reviewed_at
    ) values (
      '00000000-0000-0000-0000-000000000222',
      '00000000-0000-0000-0000-000000000111',
      'public-media', 'forged.jpg', repeat('a', 64), now(),
      'media-123456', 'quarantined', now()
    )$$,
  '42501',
  '.*',
  'authenticated callers cannot insert public media rows or forge review fields'
);
select throws_ok(
  $$update public.media_assets set status = 'quarantined', reviewed_at = now()$$,
  '42501',
  '.*',
  'authenticated callers cannot forge a reviewed timestamp or status'
);
select throws_ok(
  $$delete from public.media_assets$$,
  '42501',
  '.*',
  'authenticated callers cannot directly delete media rows'
);
select throws_ok(
  $$select public.reserve_media_upload_job(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64), 42, 1, 1,
      'jpeg-srgb-2048-q88.v1',
      '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
      now()
    )$$,
  '42501',
  '.*',
  'authenticated callers cannot invoke the service-only reservation RPC'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('public-media', '00000000-0000-0000-0000-000000000111/forged.jpg')$$,
  '42501',
  '.*',
  'authenticated callers cannot directly write the former public media bucket'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('media-staging', 'arbitrary/not-derived.jpg')$$,
  '42501',
  '.*',
  'authenticated callers cannot write arbitrary private staging paths'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select * from public.media_assets$$,
  '42501',
  '.*',
  'anon callers cannot select raw media rows'
);
reset role;
set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values ('00000000-0000-0000-0000-000000000111', 'Media Test Contributor', now());
set local session_replication_role = origin;
insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
) values (
  '00000000-0000-0000-0000-000000000222',
  '00000000-0000-0000-0000-000000000111',
  now(), '8928308280fffff', 'morning', 'normal', 'limited', 'media-finalize-001'
);

select lives_ok(
  $$select public.reserve_media_upload_job(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64), 42, 1, 1,
      'jpeg-srgb-2048-q88.v1',
      '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
      now()
    )$$,
  'first matching reservation succeeds'
);
select lives_ok(
  $$select public.reserve_media_upload_job(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64), 42, 1, 1,
      'jpeg-srgb-2048-q88.v1',
      '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
      now()
    )$$,
  'matching reservation retry succeeds'
);
select is(
  (select count(*) from private.media_upload_jobs
    where uploader_id = '00000000-0000-0000-0000-000000000111' and media_id = 'media-123456'),
  1::bigint,
  'matching reservation retries create one upload job'
);
select throws_ok(
  $$select public.reserve_media_upload_job(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('b', 64), 42, 1, 1,
      'jpeg-srgb-2048-q88.v1',
      '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
      now()
    )$$,
  'P0001',
  'idempotency_conflict',
  'conflicting reuse of a stable media id fails closed'
);
select lives_ok(
  $$select public.finalize_media_upload_job(
      (select id from private.media_upload_jobs
        where uploader_id = '00000000-0000-0000-0000-000000000111' and media_id = 'media-123456'),
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64)
    )$$,
  'first finalized mapping succeeds'
);
select lives_ok(
  $$select public.finalize_media_upload_job(
      (select id from private.media_upload_jobs
        where uploader_id = '00000000-0000-0000-0000-000000000111' and media_id = 'media-123456'),
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64)
    )$$,
  'duplicate finalization is idempotent'
);
select is(
  (select count(*) from public.media_assets
    where uploader_id = '00000000-0000-0000-0000-000000000111' and client_media_id = 'media-123456'),
  1::bigint,
  'duplicate finalization maps to one quarantined media row'
);
select is_empty(
  $$select storage_path from public.media_assets where client_media_id = 'media-123456'
    and has_table_privilege('authenticated', 'public.media_assets', 'select')$$,
  'raw staging paths remain unavailable to authenticated callers'
);

select * from finish();
rollback;
