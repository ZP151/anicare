begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

select has_function(
  'public', 'list_my_sighting_summaries',
  array['integer', 'timestamp with time zone', 'uuid'],
  'owner-only report projection exists'
);
select ok(
  not has_function_privilege('anon', 'public.list_my_sighting_summaries(integer, timestamptz, uuid)', 'execute'),
  'anonymous execute remains revoked'
);
select ok(
  has_function_privilege('authenticated', 'public.list_my_sighting_summaries(integer, timestamptz, uuid)', 'execute'),
  'authenticated execute is granted'
);
select ok(
  not has_table_privilege('authenticated', 'public.sightings', 'select'),
  'raw sightings grant remains revoked'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_assets', 'select'),
  'raw media grant remains revoked'
);
select ok(
  not has_table_privilege('authenticated', 'public.identity_proposals', 'insert')
    and not has_table_privilege('authenticated', 'public.identity_proposals', 'update')
    and not has_table_privilege('authenticated', 'public.identity_proposals', 'delete'),
  'My Reports adds no raw identity-proposal mutations; existing RLS-scoped SELECT is preserved for identity review'
);
select ok(
  not has_table_privilege('authenticated', 'private.media_upload_jobs', 'select'),
  'raw media-upload-job grant remains revoked'
);
select ok(
  exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'sightings_reporter_created_idx'),
  'sighting keyset index exists'
);
select ok(
  exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'media_assets_sighting_status_idx'),
  'media projection index exists'
);
select ok(
  exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'identity_proposals_sighting_status_idx'),
  'identity projection index exists'
);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000002001', 'Report owner', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000002002', 'Other reporter', pg_catalog.now());
insert into public.animals (id, primary_alias) values
  ('00000000-0000-4000-8000-000000002010', 'Linked cat');
insert into public.sightings (
  id, animal_id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, traits, notes, client_dedupe_key, created_at
) values
  ('00000000-0000-4000-8000-000000002101', null, '00000000-0000-4000-8000-000000002001', '2026-08-31T01:00:00Z', '89652636d87ffff', 'morning', 'normal', 'hidden', '{"coat":"tabby"}', 'private note', 'my-report-2101', '2026-08-31T09:00:00Z'),
  ('00000000-0000-4000-8000-000000002102', null, '00000000-0000-4000-8000-000000002001', '2026-08-31T02:00:00Z', '89652636d87ffff', 'morning', 'normal', 'limited', '{}', null, 'my-report-2102', '2026-08-31T09:00:00Z'),
  ('00000000-0000-4000-8000-000000002103', null, '00000000-0000-4000-8000-000000002001', '2026-08-31T03:00:00Z', '89652636d87ffff', 'morning', 'normal', 'public', '{}', null, 'my-report-2103', '2026-08-31T08:00:00Z'),
  ('00000000-0000-4000-8000-000000002104', null, '00000000-0000-4000-8000-000000002001', '2026-08-31T04:00:00Z', '89652636d87ffff', 'morning', 'normal', 'archived', '{}', null, 'my-report-2104', '2026-08-31T07:00:00Z'),
  ('00000000-0000-4000-8000-000000002105', '00000000-0000-4000-8000-000000002010', '00000000-0000-4000-8000-000000002001', '2026-08-31T05:00:00Z', '89652636d87ffff', 'morning', 'normal', 'limited', '{}', null, 'my-report-2105', '2026-08-31T06:00:00Z'),
  ('00000000-0000-4000-8000-000000002106', null, '00000000-0000-4000-8000-000000002001', '2026-08-31T06:00:00Z', '89652636d87ffff', 'morning', 'normal', 'limited', '{}', null, 'my-report-2106', '2026-08-31T05:00:00Z'),
  ('00000000-0000-4000-8000-000000002199', null, '00000000-0000-4000-8000-000000002002', '2026-08-31T06:00:00Z', '89652636d87ffff', 'morning', 'normal', 'public', '{}', 'other note', 'other-report-2199', '2026-08-31T10:00:00Z');
insert into public.media_assets (id, sighting_id, uploader_id, storage_bucket, storage_path, sha256, redaction_confirmed_at, status, deleted_at) values
  ('00000000-0000-4000-8000-000000002301', '00000000-0000-4000-8000-000000002101', '00000000-0000-4000-8000-000000002001', 'private-evidence', 'my/removed.jpg', repeat('a', 64), pg_catalog.now(), 'quarantined', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000002302', '00000000-0000-4000-8000-000000002102', '00000000-0000-4000-8000-000000002001', 'private-evidence', 'my/cleanup.jpg', repeat('b', 64), pg_catalog.now(), 'quarantined', null),
  ('00000000-0000-4000-8000-000000002303', '00000000-0000-4000-8000-000000002103', '00000000-0000-4000-8000-000000002001', 'private-evidence', 'my/quarantined.jpg', repeat('c', 64), pg_catalog.now(), 'quarantined', null),
  ('00000000-0000-4000-8000-000000002304', '00000000-0000-4000-8000-000000002104', '00000000-0000-4000-8000-000000002001', 'private-evidence', 'my/pending.jpg', repeat('d', 64), pg_catalog.now(), 'quarantined', null);
insert into private.media_upload_jobs (
  id, uploader_id, sighting_id, media_id, sha256, byte_length, width, height, recipe_version, detector_versions,
  confirmed_at_local, object_path, status, reserved_at, reservation_expires_at, next_cleanup_at, finalized_at, media_asset_id
) values
  ('00000000-0000-4000-8000-000000002401', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002102', 'media-2401', repeat('b', 64), 100, 10, 10, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000002401.jpg', 'deletion_pending', pg_catalog.now(), pg_catalog.now() + interval '5 minutes', pg_catalog.now(), pg_catalog.now(), '00000000-0000-4000-8000-000000002302'),
  ('00000000-0000-4000-8000-000000002402', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002103', 'media-2402', repeat('c', 64), 100, 10, 10, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000002402.jpg', 'finalized', pg_catalog.now(), pg_catalog.now() + interval '5 minutes', pg_catalog.now(), pg_catalog.now(), '00000000-0000-4000-8000-000000002303'),
  ('00000000-0000-4000-8000-000000002400', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002101', 'media-2400', repeat('a', 64), 100, 10, 10, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000002400.jpg', 'deletion_pending', pg_catalog.now(), pg_catalog.now() + interval '5 minutes', pg_catalog.now(), pg_catalog.now(), '00000000-0000-4000-8000-000000002301'),
  ('00000000-0000-4000-8000-000000002403', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002104', 'media-2403', repeat('d', 64), 100, 10, 10, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000002403.jpg', 'reserved', pg_catalog.now(), pg_catalog.now() + interval '5 minutes', pg_catalog.now(), null, null),
  ('00000000-0000-4000-8000-000000002404', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002106', 'media-2404', repeat('e', 64), 100, 10, 10, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', pg_catalog.now(), 'jobs/00000000-0000-4000-8000-000000002404.jpg', 'reserved', pg_catalog.now(), pg_catalog.now() + interval '5 minutes', pg_catalog.now(), null, null);
insert into public.identity_proposals (id, sighting_id, proposer_id, source, status, reasons) values
  ('00000000-0000-4000-8000-000000002501', '00000000-0000-4000-8000-000000002102', '00000000-0000-4000-8000-000000002001', 'manual_search', 'tentative', '[]'),
  ('00000000-0000-4000-8000-000000002502', '00000000-0000-4000-8000-000000002103', '00000000-0000-4000-8000-000000002001', 'manual_search', 'rejected', '[]'),
  ('00000000-0000-4000-8000-000000002503', '00000000-0000-4000-8000-000000002104', '00000000-0000-4000-8000-000000002001', 'manual_search', 'superseded', '[]'),
  ('00000000-0000-4000-8000-000000002504', '00000000-0000-4000-8000-000000002105', '00000000-0000-4000-8000-000000002001', 'manual_search', 'tentative', '[]'),
  ('00000000-0000-4000-8000-000000002505', '00000000-0000-4000-8000-000000002105', '00000000-0000-4000-8000-000000002001', 'manual_search', 'rejected', '[]');
insert into public.sightings (
  reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, traits, client_dedupe_key, created_at
)
select
  '00000000-0000-4000-8000-000000002001'::uuid,
  '2026-08-30T00:00:00Z'::timestamptz,
  '89652636d87ffff', 'morning', 'normal'::public.risk_tier, 'limited'::public.record_visibility,
  '{}'::jsonb, 'my-report-extra-' || sequence,
  '2026-08-30T00:00:00Z'::timestamptz - sequence * interval '1 minute'
from pg_catalog.generate_series(1, 51) as generated(sequence);
set local session_replication_role = origin;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$select * from public.list_my_sighting_summaries(50, null, null)$$, '42501', null, 'anonymous callers are denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002001', true);
select results_eq(
  $$select "sightingId"::text, "reportState", "mediaState", "identityState" from public.list_my_sighting_summaries(6, null, null) order by "createdAt" desc, "sightingId" desc$$,
  $$values
    ('00000000-0000-4000-8000-000000002102', 'delayed', 'cleanup_pending', 'pending_review'),
    ('00000000-0000-4000-8000-000000002101', 'private_review', 'removed', 'not_requested'),
    ('00000000-0000-4000-8000-000000002103', 'published', 'quarantined', 'closed'),
    ('00000000-0000-4000-8000-000000002104', 'archived', 'quarantined', 'closed'),
    ('00000000-0000-4000-8000-000000002105', 'delayed', 'none', 'linked'),
    ('00000000-0000-4000-8000-000000002106', 'delayed', 'pending', 'not_requested')$$,
  'owner sees every coarse mapping and preserves media and linked-identity precedence in stable descending order'
);
select is(
  (select pg_catalog.count(*) from public.list_my_sighting_summaries(100, null, null)),
  50::bigint, 'limit clamps high requests to fifty'
);
select is(
  (select pg_catalog.count(*) from public.list_my_sighting_summaries(0, null, null)),
  1::bigint, 'limit clamps zero to one'
);
select is(
  (select "sightingId"::text from public.list_my_sighting_summaries(1, '2026-08-31T09:00:00Z', '00000000-0000-4000-8000-000000002102')),
  '00000000-0000-4000-8000-000000002101', 'keyset excludes the full tied cursor tuple'
);
select is(
  (select pg_catalog.count(*) from public.list_my_sighting_summaries(50, null, null) where "sightingId" = '00000000-0000-4000-8000-000000002199'),
  0::bigint, 'owner cannot see another reporters row'
);
select is(
  pg_catalog.pg_get_function_result('public.list_my_sighting_summaries(integer, timestamptz, uuid)'::regprocedure),
  'TABLE("sightingId" uuid, "occurredAt" timestamp with time zone, "createdAt" timestamp with time zone, "reportState" text, "mediaState" text, "identityState" text)',
  'projection returns exactly the seven approved camelCase columns'
);
select is(
  (select pg_catalog.array_to_string(proc.proargnames, ',') || '|' || pg_catalog.array_to_string(proc.proargmodes, ',') from pg_catalog.pg_proc as proc where proc.oid = 'public.list_my_sighting_summaries(integer, timestamptz, uuid)'::regprocedure),
  'p_limit,p_before_created_at,p_before_sighting_id,sightingId,occurredAt,createdAt,reportState,mediaState,identityState|i,i,i,t,t,t,t,t,t',
  'function metadata exposes only pagination inputs and the seven approved output columns'
);
select throws_ok(
  $$select * from public.list_my_sighting_summaries(50, '2026-08-31T09:00:00Z', null)$$,
  'P0001', 'invalid_my_reports_cursor', 'partial keyset cursors are rejected'
);
select is(
  (select pg_catalog.count(*) from public.list_my_sighting_summaries(null, null, null)),
  50::bigint, 'null limit defaults safely to fifty'
);
reset role;

select * from finish();
rollback;
