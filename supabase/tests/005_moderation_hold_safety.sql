begin;
select plan(28);

select has_function('public', 'set_sighting_restore_hold', array['uuid', 'text', 'boolean', 'uuid'], 'service-only hold management RPC exists');
select has_table('private', 'service_sighting_hold_requests', 'service hold request idempotency ledger exists');
select ok(
  position('for update' in lower(pg_get_functiondef('public.admin_resolve_moderation_report(uuid,text,text,uuid)'::regprocedure))) > 0,
  'resolution locks the report, target, and hold state for serial decisions'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'moderation_report_auto_hide_hold'),
  'auto-hidden reports create a durable source-owned hold'
);
select ok(not has_function_privilege('authenticated', 'public.set_sighting_restore_hold(uuid,text,boolean,uuid)', 'execute'), 'authenticated users cannot manage legal or safety holds');
select ok(has_function_privilege('service_role', 'public.set_sighting_restore_hold(uuid,text,boolean,uuid)', 'execute'), 'service role can manage legal or safety holds');

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000510', 'Hold Admin', now()),
  ('00000000-0000-4000-8000-000000000511', 'Hold Author', now()),
  ('00000000-0000-4000-8000-000000000512', 'Hold Reporter', now());
set local session_replication_role = origin;
insert into public.role_grants (user_id, role) values ('00000000-0000-4000-8000-000000000510', 'platform_admin');
insert into public.sightings (id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key) values
  ('00000000-0000-4000-8000-000000000520', '00000000-0000-4000-8000-000000000511', now(), '8928308280fffff', 'morning', 'normal', 'hidden', 'hold-sighting-a'),
  ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000511', now(), '8928308280fffff', 'morning', 'normal', 'archived', 'hold-sighting-b'),
  ('00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-000000000511', now(), '8928308280fffff', 'morning', 'normal', 'hidden', 'hold-sighting-c'),
  ('00000000-0000-4000-8000-000000000523', '00000000-0000-4000-8000-000000000511', now(), '8928308280fffff', 'morning', 'normal', 'public', 'hold-sighting-d'),
  ('00000000-0000-4000-8000-000000000524', '00000000-0000-4000-8000-000000000511', now(), '8928308280fffff', 'morning', 'normal', 'hidden', 'hold-sighting-e');
insert into public.moderation_reports (id, reporter_id, content_type, content_id, content_author_id, reason, risk, status, due_at) values
  ('00000000-0000-4000-8000-000000000530', '00000000-0000-4000-8000-000000000512', 'sighting', '00000000-0000-4000-8000-000000000520', '00000000-0000-4000-8000-000000000511', 'spam', 'normal', 'open', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000531', '00000000-0000-4000-8000-000000000512', 'sighting', '00000000-0000-4000-8000-000000000520', '00000000-0000-4000-8000-000000000511', 'animal_welfare', 'sensitive', 'auto_hidden', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000532', '00000000-0000-4000-8000-000000000512', 'sighting', '00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000511', 'animal_welfare', 'sensitive', 'auto_hidden', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000533', '00000000-0000-4000-8000-000000000512', 'sighting', '00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-000000000511', 'animal_welfare', 'sensitive', 'auto_hidden', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000534', '00000000-0000-4000-8000-000000000512', 'sighting', '00000000-0000-4000-8000-000000000523', '00000000-0000-4000-8000-000000000511', 'animal_welfare', 'sensitive', 'auto_hidden', now() + interval '1 day');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000510', true);
select lives_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000530', 'hide_sighting', 'A sufficiently specific first-report rationale.', '00000000-0000-4000-8000-000000000540')$$, 'hide creates a durable first-report hold');
select lives_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000531', 'restore_sighting', 'A sufficiently specific second-report rationale.', '00000000-0000-4000-8000-000000000541')$$, 'an eligible auto-hide report can release only its own hold');
reset role;
select is((select visibility::text from public.sightings where id = '00000000-0000-4000-8000-000000000520'), 'hidden', 'hide A then restore B remains hidden');
select is((select count(*) from private.sighting_restore_holds where sighting_id = '00000000-0000-4000-8000-000000000520' and source_report_id = '00000000-0000-4000-8000-000000000530' and released_at is null), 1::bigint, 'first report hold remains active after second report restore');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000510', true);
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000532', 'restore_sighting', 'A sufficiently specific archived rationale.', '00000000-0000-4000-8000-000000000542')$$, 'P0001', 'sighting_restore_not_applicable', 'restore never overwrites archived visibility');
reset role;
select is((select visibility::text from public.sightings where id = '00000000-0000-4000-8000-000000000521'), 'archived', 'archived visibility remains unchanged');
set local role service_role;
select lives_ok($$select public.set_sighting_restore_hold('00000000-0000-4000-8000-000000000520', 'legal', true, '00000000-0000-4000-8000-000000000543')$$, 'service role can create a legal hold');
select lives_ok($$select public.set_sighting_restore_hold('00000000-0000-4000-8000-000000000520', 'legal', true, '00000000-0000-4000-8000-000000000543')$$, 'matching service hold retry returns the original outcome');
select throws_ok($$select public.set_sighting_restore_hold('00000000-0000-4000-8000-000000000520', 'safety', true, '00000000-0000-4000-8000-000000000543')$$, 'P0001', 'idempotency_conflict', 'conflicting service hold request reuse fails closed');
reset role;
select is((select count(*) from audit.access_audit where action = 'set_sighting_restore_hold' and request_id = '00000000-0000-4000-8000-000000000543'), 1::bigint, 'service hold retry is audited exactly once');
set local role service_role;
select lives_ok($$select public.set_sighting_restore_hold('00000000-0000-4000-8000-000000000520', 'legal', false, '00000000-0000-4000-8000-000000000545')$$, 'service role can release its legal hold');
reset role;
select is((select count(*) from private.sighting_restore_holds where sighting_id = '00000000-0000-4000-8000-000000000520' and source_type = 'legal' and released_at is null), 0::bigint, 'released holds are not active');
select lives_ok($$insert into private.sighting_restore_holds (sighting_id, hold_type, source_type, created_at, expires_at) values ('00000000-0000-4000-8000-000000000522', 'safety', 'safety', now() - interval '2 minutes', now() - interval '1 minute')$$, 'expired safety hold fixture has a valid historical lifetime');
select is((select count(*) from private.sighting_restore_holds where sighting_id = '00000000-0000-4000-8000-000000000522' and released_at is null and expires_at > now()), 0::bigint, 'expired holds are not active');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000510', true);
select lives_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000533', 'restore_sighting', 'A sufficiently specific expired-hold rationale.', '00000000-0000-4000-8000-000000000544')$$, 'expired holds do not prevent an eligible limited restore');
reset role;
select is((select visibility::text from public.sightings where id = '00000000-0000-4000-8000-000000000522'), 'limited', 'eligible restore changes hidden only to limited after active holds are gone');
select lives_ok($$insert into private.sighting_restore_holds (sighting_id, hold_type, source_type, created_at, expires_at) values ('00000000-0000-4000-8000-000000000524', 'legal', 'legal', now() - interval '2 minutes', now() - interval '1 minute')$$, 'expired legal hold fixture has a valid historical lifetime');
set local role service_role;
select lives_ok($$select public.set_sighting_restore_hold('00000000-0000-4000-8000-000000000524', 'legal', true, '00000000-0000-4000-8000-000000000546')$$, 'service activation replaces an expired legal hold with an effective hold');
select lives_ok($$select public.set_sighting_restore_hold('00000000-0000-4000-8000-000000000524', 'legal', true, '00000000-0000-4000-8000-000000000547')$$, 'newer activation retains the effective legal hold after stale expiry cleanup');
reset role;
select is((select count(*) from private.sighting_restore_holds where sighting_id = '00000000-0000-4000-8000-000000000524' and source_type = 'legal' and released_at is null and (expires_at is null or expires_at > now())), 1::bigint, 'older expired data cannot bypass or replace the newer effective hold');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000510', true);
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000534', 'restore_sighting', 'A sufficiently specific public-visibility rationale.', '00000000-0000-4000-8000-000000000548')$$, 'P0001', 'sighting_restore_not_applicable', 'restore never overwrites public visibility');
reset role;
select is((select visibility::text from public.sightings where id = '00000000-0000-4000-8000-000000000523'), 'public', 'public visibility remains unchanged');

select * from finish();
rollback;
