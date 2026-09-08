begin;
create extension if not exists dblink with schema extensions;
select plan(33);

select has_function(
  'public', 'confirm_new_animal_identity', array['uuid', 'text', 'text', 'uuid'],
  'M1.2 exposes the atomic new-animal confirmation RPC'
);
select function_privs_are(
  'public', 'confirm_new_animal_identity', array['uuid', 'text', 'text', 'uuid'],
  'anon', array[]::text[], 'anonymous callers cannot confirm a new animal'
);
select function_privs_are(
  'private', 'lock_and_validate_identity_proposal', array['uuid', 'uuid', 'boolean'],
  'authenticated', array[]::text[], 'the locked review guard is private by default'
);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000002601', 'M12 Reporter', now()),
  ('00000000-0000-4000-8000-000000002602', 'M12 Reviewer', now()),
  ('00000000-0000-4000-8000-000000002603', 'M12 Second Reviewer', now()),
  ('00000000-0000-4000-8000-000000002604', 'M12 Untrusted', now());
set local session_replication_role = origin;
insert into public.role_grants (
  id, user_id, role, granted_by, verification_method, verification_completed_at
) values
  ('00000000-0000-4000-8000-000000002611', '00000000-0000-4000-8000-000000002602',
    'trusted_contributor', '00000000-0000-4000-8000-000000002603', 'm12', now()),
  ('00000000-0000-4000-8000-000000002612', '00000000-0000-4000-8000-000000002603',
    'platform_admin', '00000000-0000-4000-8000-000000002602', 'm12', now()),
  ('00000000-0000-4000-8000-000000002613', '00000000-0000-4000-8000-000000002601',
    'trusted_contributor', '00000000-0000-4000-8000-000000002602', 'm12', now());
insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
) values
  ('00000000-0000-4000-8000-000000002621', '00000000-0000-4000-8000-000000002601',
    now(), '8928308280fffff', 'morning', 'normal', 'limited', 'm12-happy'),
  ('00000000-0000-4000-8000-000000002622', '00000000-0000-4000-8000-000000002601',
    now(), '8928308280fffff', 'morning', 'sensitive', 'hidden', 'm12-hidden'),
  ('00000000-0000-4000-8000-000000002623', '00000000-0000-4000-8000-000000002601',
    now(), '8928308280fffff', 'morning', 'normal', 'limited', 'm12-rollback'),
  ('00000000-0000-4000-8000-000000002624', '00000000-0000-4000-8000-000000002601',
    now(), '8928308280fffff', 'morning', 'normal', 'limited', 'm12-backfill'),
  ('00000000-0000-4000-8000-000000002625', '00000000-0000-4000-8000-000000002601',
    now(), '8928308280fffff', 'morning', 'normal', 'limited', 'm12-invalidated'),
  ('00000000-0000-4000-8000-000000002626', '00000000-0000-4000-8000-000000002601',
    now(), '8928308280fffff', 'morning', 'normal', 'limited', 'm12-invalidated-evidence');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002601', true);
select is(
  (select status from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000002621', null, 'new_animal',
    '00000000-0000-4000-8000-000000002631'
  )),
  'tentative', 'a non-preexisting-cat report creates a tentative new-animal proposal'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002602', true);
select is(
  (select status
     from public.confirm_new_animal_identity(
       (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002621'),
       '  M1.2 Fresh Cat  ', 'Independent review confirms this is a previously unprofiled cat.',
       '00000000-0000-4000-8000-000000002632'
     )),
  'confirmed', 'independent confirmation returns a confirmed composite result'
);
reset role;
select is(
  (select count(*) from public.animals where primary_alias = 'M1.2 Fresh Cat'),
  1::bigint, 'one confirmed new-animal proposal creates exactly one animal'
);
select is(
  (select lifecycle::text || '|' || visibility::text from public.animals where primary_alias = 'M1.2 Fresh Cat'),
  'unknown|public', 'a normal unhidden source creates an unknown-lifecycle public profile without changing feed policy'
);
select is(
  (select animal_id from public.sightings where id = '00000000-0000-4000-8000-000000002621'),
  (select id from public.animals where primary_alias = 'M1.2 Fresh Cat'),
  'the source report has exactly the completed profile association'
);
select is(
  (select proposed_animal_id is null from public.identity_proposals
    where sighting_id = '00000000-0000-4000-8000-000000002621'),
  true, 'new-animal proposals retain the legacy null proposed-animal contract'
);
select is(
  (select count(*) from public.match_reviews
    where proposal_id = (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002621')
      and decision = 'confirm'),
  1::bigint, 'the composite action records one independent confirmation source'
);
select set_config('m12.fresh_animal_id',
  (select id::text from public.animals where primary_alias = 'M1.2 Fresh Cat'), true);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002602', true);
select is(
  (select "animalId" from public.confirm_new_animal_identity(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002621'),
    'M1.2 Fresh Cat', 'Independent review confirms this is a previously unprofiled cat.',
    '00000000-0000-4000-8000-000000002632'
  )),
  current_setting('m12.fresh_animal_id')::uuid,
  'same request replays the stable created profile result'
);
reset role;
select is(
  (select count(*) from public.animals where primary_alias = 'M1.2 Fresh Cat'),
  1::bigint, 'replay never creates a second profile'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002602', true);
select throws_ok(
  $$select * from public.confirm_new_animal_identity(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002621'),
    'Different Alias', 'Independent review confirms this is a previously unprofiled cat.',
    '00000000-0000-4000-8000-000000002632'
  )$$,
  'P0001', 'idempotency_conflict', 'a reused request id with a different completion payload is rejected'
);
select throws_ok(
  $$select * from public.confirm_new_animal_identity(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002622'),
    '   ', 'Independent review confirms this is a previously unprofiled cat.',
    '00000000-0000-4000-8000-000000002633'
  )$$,
  '22023', 'invalid_new_animal_profile', 'blank aliases are rejected after trimming'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002601', true);
select is(
  (select status::text from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000002622', null, 'new_animal',
    '00000000-0000-4000-8000-000000002634'
  )),
  'tentative', 'a sensitive hidden report can still be proposed for review'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002602', true);
select is(
  (select status from public.confirm_new_animal_identity(
      (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002622'),
      'Hidden M1.2 Cat', 'Independent review confirms this is a previously unprofiled cat.',
      '00000000-0000-4000-8000-000000002635'
    )),
  'confirmed', 'a hidden source can receive a reviewed profile completion'
);
reset role;
select is(
  (select visibility::text from public.animals where primary_alias = 'Hidden M1.2 Cat'),
  'hidden', 'confirmation never makes a hidden or sensitive source profile public'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002601', true);
select is((select status from public.submit_identity_proposal(
  '00000000-0000-4000-8000-000000002623', null, 'new_animal', '00000000-0000-4000-8000-000000002636'
)), 'tentative', 'rollback fixture has a real new-animal proposal');
reset role;
select set_config('m12.rollback_proposal_id',
  (select id::text from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002623'), true);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002604', true);
select throws_ok(
  $$select * from public.confirm_new_animal_identity(
    current_setting('m12.rollback_proposal_id')::uuid,
    'No Role Cat', 'Independent review confirms this is a previously unprofiled cat.',
    '00000000-0000-4000-8000-000000002637'
  )$$,
  '42501', 'trusted_identity_reviewer_required', 'non-reviewers cannot complete a profile'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002601', true);
select throws_ok(
  $$select * from public.confirm_new_animal_identity(
    current_setting('m12.rollback_proposal_id')::uuid,
    'Recused Cat', 'Independent review confirms this is a previously unprofiled cat.',
    '00000000-0000-4000-8000-000000002638'
  )$$,
  '42501', 'identity_reviewer_recusal_required', 'the proposer and reporter cannot self-confirm a profile'
);
reset role;

-- A legacy confirmation is deliberately inserted as the old public review
-- endpoint would have left it: confirmed, unlinked, and with no completion row.
set local session_replication_role = replica;
insert into public.identity_proposals (
  id, sighting_id, proposer_id, source, status, reasons, reviewed_at
) values (
  '00000000-0000-4000-8000-000000002641', '00000000-0000-4000-8000-000000002624',
  '00000000-0000-4000-8000-000000002601', 'new_animal', 'confirmed', '[]'::jsonb, now()
);
insert into public.match_reviews (proposal_id, reviewer_id, decision, rationale, request_id) values
  ('00000000-0000-4000-8000-000000002641', '00000000-0000-4000-8000-000000002602',
   'confirm', 'Legacy independent confirmation without profile completion.', '00000000-0000-4000-8000-000000002642');
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002603', true);
select lives_ok(
  $$select * from public.confirm_new_animal_identity(
    '00000000-0000-4000-8000-000000002641', 'Legacy Backfill Cat',
    'A trusted reviewer completes the independently confirmed legacy proposal.',
    '00000000-0000-4000-8000-000000002643'
  )$$,
  'a trusted reviewer can backfill a legacy confirmed and unlinked new-animal proposal'
);
reset role;
select is((select count(*) from public.match_reviews where proposal_id = '00000000-0000-4000-8000-000000002641'),
  1::bigint, 'legacy profile backfill does not manufacture a second review');
select is((select count(*) from private.identity_profile_completions where proposal_id = '00000000-0000-4000-8000-000000002641'),
  1::bigint, 'legacy profile backfill writes one durable resolved animal reference');

-- Two independent reviewer sessions race on one proposal. The implementation
-- must serialize their guarded confirmations and leave one profile/outcome.
select lives_ok(
  $concurrency$
  do $main$
  declare
    local_connection text :=
      'host=' || pg_catalog.host(pg_catalog.inet_server_addr())
      || ' port=' || pg_catalog.current_setting('port')
      || ' dbname=' || pg_catalog.current_database()
      || ' user=' || session_user
      || ' password=' || session_user;
    first_error text;
    second_error text;
    outcome_count bigint;
    animal_count bigint;
    linked_count bigint;
  begin
    perform extensions.dblink_connect('m12_concurrency_setup',
      local_connection || ' application_name=m12_concurrency_setup');
    perform extensions.dblink_exec('m12_concurrency_setup', 'set session_replication_role = replica');
    perform extensions.dblink_exec('m12_concurrency_setup', $remote$
      insert into public.user_profiles (id, public_name, adult_confirmed_at) values
        ('00000000-0000-4000-8000-000000002701', 'M12 Race Reporter', now()),
        ('00000000-0000-4000-8000-000000002702', 'M12 Race One', now()),
        ('00000000-0000-4000-8000-000000002703', 'M12 Race Two', now());
    $remote$);
    perform extensions.dblink_exec('m12_concurrency_setup', 'set session_replication_role = origin');
    perform extensions.dblink_exec('m12_concurrency_setup', $remote$
      insert into public.role_grants (
        id, user_id, role, granted_by, verification_method, verification_completed_at
      ) values
        ('00000000-0000-4000-8000-000000002711', '00000000-0000-4000-8000-000000002702',
          'platform_admin', '00000000-0000-4000-8000-000000002703', 'm12-race', now()),
        ('00000000-0000-4000-8000-000000002712', '00000000-0000-4000-8000-000000002703',
          'platform_admin', '00000000-0000-4000-8000-000000002702', 'm12-race', now());
      insert into public.sightings (
        id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
      ) values (
        '00000000-0000-4000-8000-000000002721', '00000000-0000-4000-8000-000000002701',
        now(), '8928308280fffff', 'morning', 'normal', 'limited', 'm12-race'
      );
      insert into public.identity_proposals (id, sighting_id, proposer_id, source, status, reasons) values (
        '00000000-0000-4000-8000-000000002722', '00000000-0000-4000-8000-000000002721',
        '00000000-0000-4000-8000-000000002701', 'new_animal', 'tentative', '[]'::jsonb
      );
    $remote$);
    perform extensions.dblink_connect('m12_concurrency_one',
      local_connection || ' application_name=m12_concurrency_one');
    perform extensions.dblink_connect('m12_concurrency_two',
      local_connection || ' application_name=m12_concurrency_two');
    perform extensions.dblink_exec('m12_concurrency_one', 'set statement_timeout = ''12s''');
    perform extensions.dblink_exec('m12_concurrency_two', 'set statement_timeout = ''12s''');
    perform extensions.dblink_exec('m12_concurrency_one', 'set role authenticated');
    perform extensions.dblink_exec('m12_concurrency_one',
      'set request.jwt.claim.role = ''authenticated''');
    perform extensions.dblink_exec('m12_concurrency_one',
      'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000002702''');
    perform extensions.dblink_exec('m12_concurrency_two', 'set role authenticated');
    perform extensions.dblink_exec('m12_concurrency_two',
      'set request.jwt.claim.role = ''authenticated''');
    perform extensions.dblink_exec('m12_concurrency_two',
      'set request.jwt.claim.sub = ''00000000-0000-4000-8000-000000002703''');
    perform extensions.dblink_send_query('m12_concurrency_one', $remote$
      select * from public.confirm_new_animal_identity(
        '00000000-0000-4000-8000-000000002722', 'M12 Concurrent Cat',
        'The first independent reviewer confirms the new animal.',
        '00000000-0000-4000-8000-000000002731'
      )
    $remote$);
    perform extensions.dblink_send_query('m12_concurrency_two', $remote$
      select * from public.confirm_new_animal_identity(
        '00000000-0000-4000-8000-000000002722', 'M12 Concurrent Cat',
        'The second independent reviewer observes the serialized completion.',
        '00000000-0000-4000-8000-000000002732'
      )
    $remote$);
    while extensions.dblink_is_busy('m12_concurrency_one') = 1
       or extensions.dblink_is_busy('m12_concurrency_two') = 1 loop
      perform pg_catalog.pg_sleep(0.01);
    end loop;
    perform * from extensions.dblink_get_result('m12_concurrency_one', false)
      as result("proposalId" uuid, status text, "animalId" uuid);
    perform * from extensions.dblink_get_result('m12_concurrency_two', false)
      as result("proposalId" uuid, status text, "animalId" uuid);
    first_error := extensions.dblink_error_message('m12_concurrency_one');
    second_error := extensions.dblink_error_message('m12_concurrency_two');
    if coalesce(first_error, 'OK') <> 'OK' or coalesce(second_error, 'OK') <> 'OK' then
      raise exception 'm12_concurrent_completion_failed:%:%', first_error, second_error;
    end if;
    select count(*) into outcome_count from private.identity_profile_completions
      where proposal_id = '00000000-0000-4000-8000-000000002722';
    select count(*) into animal_count from public.animals where primary_alias = 'M12 Concurrent Cat';
    select count(*) into linked_count from public.sightings
      where id = '00000000-0000-4000-8000-000000002721' and animal_id is not null;
    if outcome_count <> 1 or animal_count <> 1 or linked_count <> 1 then
      raise exception 'm12_concurrent_completion_not_unique:%:%:%', outcome_count, animal_count, linked_count;
    end if;
    perform extensions.dblink_disconnect('m12_concurrency_one');
    perform extensions.dblink_disconnect('m12_concurrency_two');
    perform extensions.dblink_exec('m12_concurrency_setup', 'set session_replication_role = replica');
    perform extensions.dblink_exec('m12_concurrency_setup', $remote$
      delete from private.identity_requests
       where proposal_id = '00000000-0000-4000-8000-000000002722';
      delete from audit.access_audit
       where resource_id = '00000000-0000-4000-8000-000000002722'
         and request_id in ('00000000-0000-4000-8000-000000002731', '00000000-0000-4000-8000-000000002732');
      delete from private.identity_profile_completion_requests
       where proposal_id = '00000000-0000-4000-8000-000000002722';
      delete from private.identity_profile_completions
       where proposal_id = '00000000-0000-4000-8000-000000002722';
      delete from public.match_reviews where proposal_id = '00000000-0000-4000-8000-000000002722';
      delete from public.identity_proposals where id = '00000000-0000-4000-8000-000000002722';
      delete from public.sightings where id = '00000000-0000-4000-8000-000000002721';
      delete from public.animals where primary_alias = 'M12 Concurrent Cat';
      delete from public.role_grants where id in (
        '00000000-0000-4000-8000-000000002711', '00000000-0000-4000-8000-000000002712'
      );
      delete from public.user_profiles where id in (
        '00000000-0000-4000-8000-000000002701', '00000000-0000-4000-8000-000000002702',
        '00000000-0000-4000-8000-000000002703'
      );
    $remote$);
    perform extensions.dblink_disconnect('m12_concurrency_setup');
  exception when others then
    if 'm12_concurrency_one' = any(coalesce(extensions.dblink_get_connections(), '{}'::text[])) then
      perform extensions.dblink_disconnect('m12_concurrency_one');
    end if;
    if 'm12_concurrency_two' = any(coalesce(extensions.dblink_get_connections(), '{}'::text[])) then
      perform extensions.dblink_disconnect('m12_concurrency_two');
    end if;
    if 'm12_concurrency_setup' = any(coalesce(extensions.dblink_get_connections(), '{}'::text[])) then
      perform extensions.dblink_disconnect('m12_concurrency_setup');
    end if;
    raise;
  end;
  $main$;
  $concurrency$,
  'two independent reviewer sessions leave exactly one completed profile and association'
);

-- Deleting the resolved animal preserves a proposal tombstone. A later
-- reviewer must never turn the same confirmed proposal into a replacement.
delete from public.animals where primary_alias = 'M1.2 Fresh Cat';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002603', true);
select throws_ok(
  $$select * from public.confirm_new_animal_identity(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000002621'),
    'Replacement Must Not Exist', 'A later reviewer must not replace an erased profile.',
    '00000000-0000-4000-8000-000000002654'
  )$$,
  'P0001', 'identity_profile_outcome_unavailable', 'a tombstoned resolved animal cannot be replaced'
);
reset role;
select is((select count(*) from public.animals where primary_alias = 'Replacement Must Not Exist'),
  0::bigint, 'tombstoned proposals never create a replacement animal');

-- A terminal legacy proposal with invalidated bound assistance evidence is
-- not a backfill shortcut: the locked post-validation must reject it.
set local session_replication_role = replica;
insert into private.identity_assistance_jobs (
  id, sighting_id, requester_id, status, notice_version, model_version,
  callback_contract_version, new_cat_recommended, completed_at, selected_at,
  result_invalidated_at
) values (
  '00000000-0000-4000-8000-000000002661', '00000000-0000-4000-8000-000000002626',
  '00000000-0000-4000-8000-000000002601', 'succeeded', 'notice.v1', 'model.v1',
  'identify-callback.v1', true, now(), now(), now()
);
insert into public.identity_proposals (id, sighting_id, proposer_id, source, status, reasons, reviewed_at) values
  ('00000000-0000-4000-8000-000000002662', '00000000-0000-4000-8000-000000002626',
   '00000000-0000-4000-8000-000000002601', 'new_animal', 'confirmed', '[]'::jsonb, now());
insert into private.identity_proposal_evidence (
  proposal_id, job_id, media_asset_id, recipe_version, crop_contract_version,
  embedding_contract_version, identify_contract_version, model_version,
  callback_contract_version, selector_id, selected_at
) values (
  '00000000-0000-4000-8000-000000002662', '00000000-0000-4000-8000-000000002661', null,
  'jpeg-srgb-2048-q88.v1', 'crop.v1', 'embedding.v1', 'identify.v1', 'model.v1',
  'identify-callback.v1', '00000000-0000-4000-8000-000000002601', now()
);
insert into public.match_reviews (proposal_id, reviewer_id, decision, rationale, request_id) values
  ('00000000-0000-4000-8000-000000002662', '00000000-0000-4000-8000-000000002602',
   'confirm', 'Legacy review before assistance evidence invalidation.', '00000000-0000-4000-8000-000000002663');
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002603', true);
select throws_ok(
  $$select * from public.confirm_new_animal_identity(
    '00000000-0000-4000-8000-000000002662', 'Invalidated Evidence Cat',
    'Invalidated evidence cannot support profile completion.', '00000000-0000-4000-8000-000000002664'
  )$$,
  'P0001', 'identity_proposal_not_actionable', 'invalidated bound evidence blocks confirmed legacy backfill'
);
reset role;
select is((select count(*) from private.identity_profile_completions
  where proposal_id = '00000000-0000-4000-8000-000000002662'),
  0::bigint, 'invalidated evidence writes no profile outcome');

-- This DDL-backed failure fixture must run after dblink: PostgreSQL retains
-- the trigger's table lock until the enclosing pgTAP transaction rolls back.
create function pg_temp.fail_m12_profile_link()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.id = '00000000-0000-4000-8000-000000002623'::uuid then
    raise exception 'm12_forced_link_failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger m12_forced_profile_link_failure before update on public.sightings
for each row execute function pg_temp.fail_m12_profile_link();
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002602', true);
select throws_ok(
  $$select * from public.confirm_new_animal_identity(
    current_setting('m12.rollback_proposal_id')::uuid,
    'Rollback Cat', 'Independent review confirms this is a previously unprofiled cat.',
    '00000000-0000-4000-8000-000000002639'
  )$$,
  'P0001', 'm12_forced_link_failure', 'a failed association aborts the composite transaction'
);
reset role;
drop trigger m12_forced_profile_link_failure on public.sightings;
select is((select count(*) from public.animals where primary_alias = 'Rollback Cat'),
  0::bigint, 'a failed association leaves no orphaned profile');
select is((select count(*) from private.identity_profile_completions
  where proposal_id = current_setting('m12.rollback_proposal_id')::uuid),
  0::bigint, 'a failed association leaves no profile outcome');
select is((select status::text from public.identity_proposals
  where id = current_setting('m12.rollback_proposal_id')::uuid),
  'tentative', 'a failed association rolls the confirmation decision back too');

-- A confirmed legacy proposal cannot be backfilled after its source account
-- erasure has nullified the reporter/proposer provenance.
set local session_replication_role = replica;
insert into public.identity_proposals (id, sighting_id, proposer_id, source, status, reasons, reviewed_at) values
  ('00000000-0000-4000-8000-000000002651', '00000000-0000-4000-8000-000000002625',
   '00000000-0000-4000-8000-000000002601', 'new_animal', 'confirmed', '[]'::jsonb, now());
insert into public.match_reviews (proposal_id, reviewer_id, decision, rationale, request_id) values
  ('00000000-0000-4000-8000-000000002651', '00000000-0000-4000-8000-000000002602',
   'confirm', 'Independent legacy confirmation before source erasure.', '00000000-0000-4000-8000-000000002653');
set local session_replication_role = origin;
delete from public.user_profiles where id = '00000000-0000-4000-8000-000000002601';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000002603', true);
select throws_ok(
  $$select * from public.confirm_new_animal_identity(
    '00000000-0000-4000-8000-000000002651', 'Erased Source Cat',
    'The source no longer has valid evidence or provenance after erasure.',
    '00000000-0000-4000-8000-000000002652'
  )$$,
  'P0001', 'identity_proposal_not_actionable', 'a deleted source cannot backfill a confirmed legacy profile'
);
reset role;

select * from finish();
rollback;
