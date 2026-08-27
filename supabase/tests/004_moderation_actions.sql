begin;
select plan(43);

-- This file intentionally precedes the migration: these are the required security
-- contracts for the operations console, not a record of the implementation.
select has_table('public', 'moderation_actions', 'append-only moderation action log exists');
select has_function('public', 'admin_has_active_platform_admin', array[]::text[], 'narrow active-admin capability check exists');
select has_function('public', 'admin_list_moderation_queue', array['uuid'], 'narrow moderation queue RPC exists');
select has_function('public', 'admin_get_moderation_report', array['uuid', 'uuid'], 'narrow moderation report RPC exists');
select has_function('public', 'admin_resolve_moderation_report', array['uuid', 'text', 'text', 'uuid'], 'atomic moderation resolution RPC exists');
select ok(not has_table_privilege('authenticated', 'public.moderation_actions', 'select'), 'authenticated callers cannot read raw moderation actions');
select ok(not has_table_privilege('authenticated', 'public.moderation_actions', 'insert'), 'authenticated callers cannot append raw moderation actions');
select ok(not has_table_privilege('authenticated', 'public.moderation_actions', 'update'), 'authenticated callers cannot update moderation actions');
select ok(not has_table_privilege('authenticated', 'public.moderation_actions', 'delete'), 'authenticated callers cannot delete moderation actions');
select ok(not has_table_privilege('authenticated', 'audit.access_audit', 'select'), 'authenticated callers cannot read raw audit rows');
select ok(not has_schema_privilege('authenticated', 'audit', 'usage'), 'authenticated callers cannot use the audit schema');

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000110', 'Platform Admin', now()),
  ('00000000-0000-4000-8000-000000000111', 'Regular User', now()),
  ('00000000-0000-4000-8000-000000000112', 'Expired Admin', now()),
  ('00000000-0000-4000-8000-000000000113', 'Revoked Admin', now()),
  ('00000000-0000-4000-8000-000000000114', 'Provisional Admin', now()),
  ('00000000-0000-4000-8000-000000000115', 'Area Steward', now()),
  ('00000000-0000-4000-8000-000000000116', 'Report Author', now()),
  ('00000000-0000-4000-8000-000000000117', 'Report Reporter', now()),
  ('00000000-0000-4000-8000-000000000118', 'Report Target', now());
set local session_replication_role = origin;
insert into public.role_grants (user_id, role, provisional_until, revoked_at) values
  ('00000000-0000-4000-8000-000000000110', 'platform_admin', null, null),
  ('00000000-0000-4000-8000-000000000112', 'platform_admin', now() - interval '1 hour', null),
  ('00000000-0000-4000-8000-000000000113', 'platform_admin', null, now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000114', 'platform_admin', now() + interval '1 hour', null),
  ('00000000-0000-4000-8000-000000000115', 'area_steward', null, null),
  ('00000000-0000-4000-8000-000000000116', 'platform_admin', null, null),
  ('00000000-0000-4000-8000-000000000117', 'platform_admin', null, null),
  ('00000000-0000-4000-8000-000000000118', 'platform_admin', null, null);
insert into public.sightings (id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000116', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'moderation-action-201'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000116', now(), '8928308280fffff', 'morning', 'normal', 'hidden', 'moderation-action-202'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000116', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'moderation-action-203'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000116', now(), '8928308280fffff', 'morning', 'normal', 'hidden', 'moderation-action-204');
insert into public.moderation_reports (id, reporter_id, content_type, content_id, content_author_id, target_user_id, reason, risk, status, due_at) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000117', 'sighting', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000116', '00000000-0000-4000-8000-000000000118', 'animal_welfare', 'sensitive', 'open', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000117', 'sighting', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000116', null, 'spam', 'normal', 'auto_hidden', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000117', 'sighting', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000116', null, 'spam', 'normal', 'open', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000117', 'sighting', '00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000116', null, 'spam', 'normal', 'auto_hidden', now() + interval '1 day');
insert into private.sighting_restore_holds (sighting_id, hold_type, source_type)
values ('00000000-0000-4000-8000-000000000204', 'legal', 'legal');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$select * from public.admin_list_moderation_queue('00000000-0000-4000-8000-000000000401')$$, '42501', null, 'anon cannot read the moderation queue');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000111', true);
select is(public.admin_has_active_platform_admin(), false, 'regular authenticated user is not an admin');
select throws_ok($$select * from public.admin_get_moderation_report('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000402')$$, '42501', null, 'regular authenticated user cannot read a moderation report');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000112', true);
select is(public.admin_has_active_platform_admin(), false, 'expired grant is denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000113', true);
select is(public.admin_has_active_platform_admin(), false, 'revoked grant is denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000114', true);
select is(public.admin_has_active_platform_admin(), false, 'provisional grant is denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000115', true);
select is(public.admin_has_active_platform_admin(), false, 'area steward is not a platform admin');
select throws_ok($$select * from public.admin_list_moderation_queue('00000000-0000-4000-8000-000000000403')$$, '42501', null, 'area steward cannot use the admin queue');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000117', true);
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000301', 'no_action', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000451')$$, '42501', 'moderation_reviewer_recusal_required', 'reporter cannot resolve their own report');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000116', true);
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000301', 'no_action', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000452')$$, '42501', 'moderation_reviewer_recusal_required', 'content author cannot resolve their own content report');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000118', true);
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000301', 'no_action', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000453')$$, '42501', 'moderation_reviewer_recusal_required', 'target user cannot resolve their own report');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select is(public.admin_has_active_platform_admin(), true, 'active platform admin is accepted');
select lives_ok($$select * from public.admin_list_moderation_queue('00000000-0000-4000-8000-000000000404')$$, 'platform admin can read narrow queue');
select lives_ok($$select * from public.admin_list_moderation_queue('00000000-0000-4000-8000-000000000404')$$, 'matching queue read retry succeeds');
reset role;
select is(
  (select count(*) from audit.access_audit where action = 'admin_read_moderation_queue' and request_id = '00000000-0000-4000-8000-000000000404'),
  1::bigint, 'queue retry token creates one audit event'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select lives_ok($$select * from public.admin_get_moderation_report('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000405')$$, 'platform admin can read a narrow report projection');
reset role;
select is(
  (select count(*) from audit.access_audit where action = 'admin_read_moderation_report' and request_id = '00000000-0000-4000-8000-000000000405'),
  1::bigint, 'report read appends one audit event'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select lives_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000301', 'hide_sighting', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000406')$$, 'hide resolves a sighting report');
reset role;
select is((select visibility::text from public.sightings where id = '00000000-0000-4000-8000-000000000201'), 'hidden', 'hide changes target visibility only to hidden');
select is((select count(*) from public.moderation_actions where request_id = '00000000-0000-4000-8000-000000000406'), 1::bigint, 'hide appends exactly one moderation action');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select lives_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000301', 'hide_sighting', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000406')$$, 'matching resolution retry returns the original outcome');
reset role;
select is((select count(*) from audit.access_audit where action = 'admin_resolve_moderation_report' and request_id = '00000000-0000-4000-8000-000000000406'), 1::bigint, 'matching resolution retry appends one audit event');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000301', 'no_action', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000406')$$, 'P0001', 'idempotency_conflict', 'conflicting request reuse fails closed');
select lives_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000302', 'restore_sighting', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000407')$$, 'restore resolves when no active hold exists');
reset role;
select is((select visibility::text from public.sightings where id = '00000000-0000-4000-8000-000000000202'), 'limited', 'restore stays limited and never directly republishes content');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select lives_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000304', 'restore_sighting', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000454')$$, 'restore releases only its own auto-hide hold when a legal hold remains');
reset role;
select is((select visibility::text from public.sightings where id = '00000000-0000-4000-8000-000000000204'), 'hidden', 'restore cannot override an active legal or safety hold');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select lives_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000303', 'no_action', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000408')$$, 'no-action resolves without a visibility change');
reset role;
select is((select visibility::text from public.sightings where id = '00000000-0000-4000-8000-000000000203'), 'limited', 'no-action cannot mutate visibility');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000303', 'delete_sighting', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000409')$$, '22023', 'invalid_moderation_resolution', 'unsupported resolution action is rejected');
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000303', 'hide_sighting', 'short', '00000000-0000-4000-8000-000000000410')$$, '22023', 'invalid_moderation_resolution', 'short rationale is rejected');
reset role;
update public.role_grants set revoked_at = now()
where user_id = '00000000-0000-4000-8000-000000000110' and role = 'platform_admin';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000110', true);
select throws_ok($$select * from public.admin_resolve_moderation_report('00000000-0000-4000-8000-000000000304', 'no_action', 'A sufficiently specific moderation rationale.', '00000000-0000-4000-8000-000000000411')$$, '42501', 'platform_admin_required', 'grant revocation between read and action is enforced');

select * from finish();
rollback;
