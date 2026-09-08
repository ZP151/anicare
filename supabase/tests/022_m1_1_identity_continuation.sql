begin;
select plan(14);

select has_function(
  'public', 'get_my_sighting_summary', array['uuid'],
  'M1.1 exposes a narrow owner receipt lookup'
);
select function_privs_are(
  'public', 'get_my_sighting_summary', array['uuid'],
  'anon', array[]::text[], 'anonymous callers cannot invoke owner receipt lookup'
);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000002501', 'M1 Owner', now()),
  ('00000000-0000-4000-8000-000000002502', 'M1 Other', now());
set local session_replication_role = origin;

insert into public.animals (id, primary_alias, profile_created_by, visibility) values
  ('00000000-0000-4000-8000-000000002511', 'Visible candidate', '00000000-0000-4000-8000-000000002501', 'public'),
  ('00000000-0000-4000-8000-000000002512', 'Hidden candidate', '00000000-0000-4000-8000-000000002501', 'hidden');
insert into public.sightings (
  id, animal_id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, visible_at, client_dedupe_key
) values
  ('00000000-0000-4000-8000-000000002521', null, '00000000-0000-4000-8000-000000002501', now(), '8928308280fffff', 'morning', 'normal', 'limited', null, 'm1-owner'),
  ('00000000-0000-4000-8000-000000002522', null, '00000000-0000-4000-8000-000000002502', now(), '8928308280fffff', 'morning', 'normal', 'limited', null, 'm1-other'),
  ('00000000-0000-4000-8000-000000002525', null, '00000000-0000-4000-8000-000000002501', now(), '8928308280fffff', 'morning', 'normal', 'limited', null, 'm1-hidden-target'),
  ('00000000-0000-4000-8000-000000002523', '00000000-0000-4000-8000-000000002511', '00000000-0000-4000-8000-000000002502', now(), '8928308280fffff', 'morning', 'normal', 'public', now() - interval '1 hour', 'm1-visible'),
  ('00000000-0000-4000-8000-000000002524', '00000000-0000-4000-8000-000000002512', '00000000-0000-4000-8000-000000002502', now(), '8928308280fffff', 'morning', 'normal', 'public', now() - interval '1 hour', 'm1-hidden');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002501', true);
select is(
  (select "sightingId"::text || '|' || "identityState" from public.get_my_sighting_summary('00000000-0000-4000-8000-000000002521')),
  '00000000-0000-4000-8000-000000002521|not_requested', 'owner receives only their narrow summary'
);
select is(
  (select count(*) from public.get_my_sighting_summary('00000000-0000-4000-8000-000000002522')),
  0::bigint, 'another owner is indistinguishable from an unavailable receipt'
);
select is(
  (select count(*) from public.get_my_sighting_summary('00000000-0000-4000-8000-000000002599')),
  0::bigint, 'a missing report is indistinguishable from an unavailable receipt'
);
select lives_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000002521', '00000000-0000-4000-8000-000000002511',
    'manual_search', '00000000-0000-4000-8000-000000002531')$$,
  'a visible feed candidate can receive a tentative proposal'
);
select is(
  (select "identityState" from public.get_my_sighting_summary('00000000-0000-4000-8000-000000002521')),
  'pending_review', 'owner receipt observes a pending proposal without proposal details'
);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000002525', '00000000-0000-4000-8000-000000002512',
    'manual_search', '00000000-0000-4000-8000-000000002532')$$,
  'P0001', 'identity_animal_not_available', 'hidden candidates cannot be proposed even with a raw UUID'
);
reset role;

update public.sightings set visible_at = now() + interval '1 day'
where id = '00000000-0000-4000-8000-000000002523';
set local role authenticated;
select throws_ok(
  $$select * from public.submit_identity_proposal('00000000-0000-4000-8000-000000002525',
    '00000000-0000-4000-8000-000000002511', 'manual_search', '00000000-0000-4000-8000-000000002533')$$,
  'P0001', 'identity_animal_not_available', 'a known target cannot bypass its public delay'
);
reset role;
update public.sightings set visible_at = now() - interval '1 hour'
where id = '00000000-0000-4000-8000-000000002523';
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-000000002501', '00000000-0000-4000-8000-000000002502');
set local role authenticated;
select throws_ok(
  $$select * from public.submit_identity_proposal('00000000-0000-4000-8000-000000002525',
    '00000000-0000-4000-8000-000000002511', 'manual_search', '00000000-0000-4000-8000-000000002534')$$,
  'P0001', 'identity_animal_not_available', 'blocking the only public reporter removes candidate eligibility'
);
reset role;
delete from public.user_blocks;
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-4000-8000-000000002502', '00000000-0000-4000-8000-000000002501');
set local role authenticated;
select throws_ok(
  $$select * from public.submit_identity_proposal('00000000-0000-4000-8000-000000002525',
    '00000000-0000-4000-8000-000000002511', 'manual_search', '00000000-0000-4000-8000-000000002535')$$,
  'P0001', 'identity_animal_not_available', 'reverse blocking also removes candidate eligibility'
);
reset role;
select is((select count(*) from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002525'),
  0::bigint, 'ineligible attempts never create a proposal');
update public.identity_proposals set status = 'rejected', reviewed_at = now()
where sighting_id = '00000000-0000-4000-8000-000000002521';
set local role authenticated;
select is((select status from public.submit_identity_proposal(
  '00000000-0000-4000-8000-000000002521', '00000000-0000-4000-8000-000000002511',
  'manual_search', '00000000-0000-4000-8000-000000002531')), 'rejected',
  'lost-response replay returns the existing reviewed result even after candidate eligibility changes');
select is((select "identityState" from public.get_my_sighting_summary('00000000-0000-4000-8000-000000002521')),
  'closed', 'owner receipt recognizes a reviewed proposal');
reset role;

select * from finish();
rollback;
