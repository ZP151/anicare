begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

select has_function(
  'public',
  'get_media_finalization_preflight',
  array['uuid', 'uuid', 'text', 'text'],
  'consolidated finalization preflight exists'
);
select function_privs_are(
  'public', 'get_media_finalization_preflight', array['uuid', 'uuid', 'text', 'text'],
  'service_role', array['EXECUTE'], 'service role can execute finalization preflight'
);
select function_privs_are(
  'public', 'get_media_finalization_preflight', array['uuid', 'uuid', 'text', 'text'],
  'authenticated', array[]::text[], 'authenticated callers cannot execute finalization preflight'
);
select function_privs_are(
  'public', 'get_media_finalization_preflight', array['uuid', 'uuid', 'text', 'text'],
  'anon', array[]::text[], 'anonymous callers cannot execute finalization preflight'
);
select is(
  (select proconfig from pg_proc
    where oid = 'public.get_media_finalization_preflight(uuid,uuid,text,text)'::regprocedure),
  array['search_path=pg_catalog'],
  'finalization preflight fixes a safe search path'
);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-0000-0000-000000000111', 'Preflight Adult', now()),
  ('00000000-0000-0000-0000-000000000333', 'Preflight Minor', null);
insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
) values
  ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000111',
    now(), '8928308280fffff', 'morning', 'normal', 'limited', 'preflight-adult'),
  ('00000000-0000-0000-0000-000000000444', '00000000-0000-0000-0000-000000000333',
    now(), '8928308280fffff', 'morning', 'normal', 'limited', 'preflight-minor');
set local session_replication_role = origin;

select public.reserve_media_upload_job(
  '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222',
  media_id, repeat(digest_character, 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1',
  '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb, now()
)
from (values
  ('preflight-reserved', 'a'),
  ('preflight-expired', 'b'),
  ('preflight-finalized', 'c'),
  ('preflight-deleted', 'd')
) as jobs(media_id, digest_character);
select public.reserve_media_upload_job(
  '00000000-0000-0000-0000-000000000333', '00000000-0000-0000-0000-000000000444',
  'preflight-minor', repeat('e', 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1',
  '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb, now()
);

update private.media_upload_jobs
set reserved_at = now() - interval '20 minutes',
    reservation_expires_at = now() - interval '10 minutes'
where media_id = 'preflight-expired';

select public.finalize_media_upload_job(
  id, uploader_id, sighting_id, media_id, sha256
)
from private.media_upload_jobs
where media_id in ('preflight-finalized', 'preflight-deleted')
order by media_id;
update public.media_assets
set deleted_at = now()
where client_media_id = 'preflight-deleted';

select is(
  (select count(*) from public.get_media_finalization_preflight(
    '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222',
    'preflight-reserved', repeat('a', 64)
  )),
  1::bigint,
  'adult owner receives the exact reserved job'
);
select is_empty(
  $$select * from public.get_media_finalization_preflight(
    '00000000-0000-0000-0000-000000000999', '00000000-0000-0000-0000-000000000222',
    'preflight-reserved', repeat('a', 64)
  )$$,
  'a hostile uploader identity receives no row'
);
select is_empty(
  $$select * from public.get_media_finalization_preflight(
    '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000999',
    'preflight-reserved', repeat('a', 64)
  )$$,
  'an unrelated sighting identity receives no row'
);
select is_empty(
  $$select * from public.get_media_finalization_preflight(
    '00000000-0000-0000-0000-000000000333', '00000000-0000-0000-0000-000000000444',
    'preflight-minor', repeat('e', 64)
  )$$,
  'a caller without adult confirmation receives no row'
);
select ok(
  (select reservation_expires_at <= now()
    from public.get_media_finalization_preflight(
      '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222',
      'preflight-expired', repeat('b', 64)
    )),
  'an expired reservation remains explicitly classifiable'
);
select ok(
  (select status = 'finalized' and media_asset_id is not null and media_deleted_at is null
    from public.get_media_finalization_preflight(
      '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222',
      'preflight-finalized', repeat('c', 64)
    )),
  'an active finalized replay returns its existing asset context'
);
select ok(
  (select status = 'finalized' and media_asset_id is not null and media_deleted_at is not null
    from public.get_media_finalization_preflight(
      '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222',
      'preflight-deleted', repeat('d', 64)
    )),
  'a deleted finalized replay remains explicitly classifiable'
);

select * from finish();
rollback;
