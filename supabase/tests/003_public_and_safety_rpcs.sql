begin;

create extension if not exists pgtap with schema extensions;
select plan(65);

select has_function(
  'public', 'list_public_sighting_feed', array['uuid', 'integer'],
  'narrow public sighting feed RPC exists'
);
select has_function(
  'public', 'create_moderation_report', array['text', 'uuid', 'text', 'text', 'uuid'],
  'moderation reports accept only caller-selectable fields'
);
select has_function(
  'public', 'block_user', array['uuid', 'uuid'],
  'block RPC accepts only target and request identifiers'
);
select has_function(
  'public', 'unblock_user', array['uuid', 'uuid'],
  'unblock RPC accepts only target and request identifiers'
);
select hasnt_view('public', 'public_animal_feed', 'legacy timestamp and storage-path feed view is removed');

select is(
  (select count(*)::integer
   from (values
     ('animals'), ('animal_aliases'), ('animal_events'), ('sightings'),
     ('care_events'), ('media_assets'), ('moderation_reports'), ('user_blocks')
   ) as protected(table_name)
   where has_table_privilege('authenticated', 'public.' || protected.table_name, 'select')
      or has_table_privilege('authenticated', 'public.' || protected.table_name, 'insert')
      or has_table_privilege('authenticated', 'public.' || protected.table_name, 'update')
      or has_table_privilege('authenticated', 'public.' || protected.table_name, 'delete')),
  0,
  'authenticated callers have no raw read or write privilege on feed and safety UGC tables'
);
select is(
  (select count(*)::integer
   from (values
     ('animals'), ('animal_aliases'), ('animal_events'), ('sightings'),
     ('care_events'), ('media_assets'), ('moderation_reports'), ('user_blocks')
   ) as protected(table_name)
   where has_table_privilege('anon', 'public.' || protected.table_name, 'select')
      or has_table_privilege('anon', 'public.' || protected.table_name, 'insert')
      or has_table_privilege('anon', 'public.' || protected.table_name, 'update')
      or has_table_privilege('anon', 'public.' || protected.table_name, 'delete')),
  0,
  'anonymous callers have no raw read or write privilege on feed and safety UGC tables'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'audit', 'usage')
    and not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('anon', 'audit', 'usage'),
  'client roles cannot inspect private idempotency or audit schemas'
);
select ok(
  has_function_privilege('anon', 'public.list_public_sighting_feed(uuid,integer)', 'execute')
    and has_function_privilege('authenticated', 'public.list_public_sighting_feed(uuid,integer)', 'execute')
    and not has_function_privilege('anon', 'public.create_moderation_report(text,uuid,text,text,uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.create_moderation_report(text,uuid,text,text,uuid)', 'execute'),
  'feed and safety RPC execution grants match their intended audiences'
);
select is_empty(
  $$select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_moderation_report', 'block_user', 'unblock_user')
       and coalesce(p.proargnames, array[]::text[]) && array[
         'p_reporter_id', 'p_actor_id', 'p_author_id', 'p_target_user_id',
         'p_risk', 'p_status', 'p_due_at', 'p_reviewer_id'
       ]$$,
  'no safety RPC signature accepts forged actor or operational fields'
);

insert into auth.users (id, email, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000000111', 'adult-reporter@example.invalid', now(), now()),
  ('00000000-0000-4000-8000-000000000222', 'blocked-author@example.invalid', now(), now()),
  ('00000000-0000-4000-8000-000000000333', 'future-confirmation@example.invalid', now(), now()),
  ('00000000-0000-4000-8000-000000000444', 'other-author@example.invalid', now(), now());

insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000111', 'Adult Reporter', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000222', 'Blocked Author', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000333', 'Future Confirmation', now() + interval '1 day'),
  ('00000000-0000-4000-8000-000000000444', 'Other Author', null);

insert into public.role_grants (
  id, user_id, role, granted_by, provisional_until, revoked_at, verification_method, verification_completed_at
) values (
  '00000000-0000-4000-8000-000000000451',
  '00000000-0000-4000-8000-000000000333',
  'platform_admin',
  '00000000-0000-4000-8000-000000000111',
  now() - interval '1 minute',
  null,
  'test',
  now() - interval '1 day'
);

insert into public.animals (id, primary_alias, verification, visibility, profile_created_by) values
  ('00000000-0000-4000-8000-000000000501', 'Mochi', 'community_confirmed', 'public', '00000000-0000-4000-8000-000000000111'),
  ('00000000-0000-4000-8000-000000000502', 'Pepper', 'reported', 'public', '00000000-0000-4000-8000-000000000222'),
  ('00000000-0000-4000-8000-000000000503', 'Private Cat', 'reported', 'limited', '00000000-0000-4000-8000-000000000111');

insert into public.sightings (
  id, animal_id, reporter_id, occurred_at, recorded_at, public_cell_id,
  time_bucket, risk, visibility, visible_at, traits, notes, client_dedupe_key
) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000222', now() - interval '4 hours', now() - interval '4 hours', '8928308280fffff', 'morning', 'normal', 'public', now() - interval '2 hours', '{"coat":"black"}', 'exact loading-bay detail', 'feed-visible-blocked'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000444', now() - interval '5 hours', now() - interval '5 hours', '8928308280bffff', 'afternoon', 'normal', 'public', now() - interval '3 hours', '{"coat":"tabby"}', 'exact doorway detail', 'feed-visible-other'),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000222', now(), now(), '8928308280fffff', 'evening', 'normal', 'public', now() + interval '2 hours', '{}', null, 'feed-delayed'),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000222', now(), now(), '8928308280fffff', 'evening', 'critical', 'hidden', null, '{}', null, 'feed-critical'),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000222', now(), now(), '8928308280fffff', 'evening', 'normal', 'limited', null, '{}', null, 'feed-limited'),
  ('00000000-0000-4000-8000-000000000606', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000222', now() - interval '6 hours', now() - interval '6 hours', '8928308280fffff', 'morning', 'normal', 'public', now() - interval '4 hours', '{}', null, 'feed-limited-animal'),
  ('00000000-0000-4000-8000-000000000607', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000222', now() - interval '7 hours', now() - interval '7 hours', '8928308280fffff', 'morning', 'normal', 'public', now() - interval '5 hours', '{}', null, 'feed-auto-hide');

select is(
  (select array_agg(key order by key)
     from jsonb_object_keys((
       select to_jsonb(feed_row)
       from public.list_public_sighting_feed(null, 50) feed_row
       limit 1
     )) as keys(key)),
  array['animalId', 'coverMediaId', 'cursor', 'primaryAlias', 'publicCellId', 'sightingId', 'timeBucket', 'verification']::text[],
  'feed rows expose exactly the approved camel-case projection'
);
select is(
  (select count(*) from public.list_public_sighting_feed(null, 50)),
  3::bigint,
  'feed excludes delayed, hidden critical, limited, and non-public-animal sightings'
);
select is_empty(
  $$select 1 from public.list_public_sighting_feed(null, 50)
     where "timeBucket" not in ('today', 'this_week', 'earlier')
        or "timeBucket" ~ '[0-9]{2}:[0-9]{2}'$$,
  'server-derived time buckets do not disclose exact time values'
);
select is_empty(
  $$select 1 from public.list_public_sighting_feed(null, 50)
     where "coverMediaId" is not null$$,
  'feed fails closed on cover media while publication remains quarantined'
);
select is(
  (select count(*) from public.list_public_sighting_feed(null, 0)),
  1::bigint,
  'feed clamps a non-positive limit to one row'
);
select is(
  (select count(*) from public.list_public_sighting_feed(null, 999)),
  3::bigint,
  'feed clamps oversized limits without broadening the result'
);
select is(
  (select "sightingId" from public.list_public_sighting_feed('00000000-0000-4000-8000-000000000601', 1)),
  '00000000-0000-4000-8000-000000000602'::uuid,
  'UUID cursor applies stable visible-time and sighting-id keyset ordering'
);
select throws_ok(
  $$select * from public.list_public_sighting_feed('00000000-0000-4000-8000-000000009999', 20)$$,
  'P0001',
  'invalid_feed_cursor',
  'unknown UUID cursors fail closed without timestamp parsing'
);

insert into public.sightings (
  id, animal_id, reporter_id, occurred_at, recorded_at, public_cell_id,
  time_bucket, risk, visibility, visible_at, traits, notes, client_dedupe_key
) values
  ('00000000-0000-4000-8000-000000000608', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000444', '2024-12-31T23:00:00Z', '2025-01-01T00:00:00Z', '8928308280bffff', 'overnight', 'normal', 'public', '2025-01-01T00:00:00Z', '{}', null, 'feed-tie-lower-id'),
  ('00000000-0000-4000-8000-000000000609', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000444', '2024-12-31T23:00:00Z', '2025-01-01T00:00:00Z', '8928308280bffff', 'overnight', 'normal', 'public', '2025-01-01T00:00:00Z', '{}', null, 'feed-tie-higher-id');

select is(
  (select array_agg(feed."sightingId" order by feed.ordinality)
     from public.list_public_sighting_feed('00000000-0000-4000-8000-000000000607', 2)
       with ordinality as feed),
  array[
    '00000000-0000-4000-8000-000000000609'::uuid,
    '00000000-0000-4000-8000-000000000608'::uuid
  ],
  'identical visible times use deterministic sighting UUID descending order with limit two'
);
select is(
  array[
    (select "sightingId" from public.list_public_sighting_feed('00000000-0000-4000-8000-000000000607', 1)),
    (select "sightingId" from public.list_public_sighting_feed('00000000-0000-4000-8000-000000000609', 1))
  ],
  array[
    '00000000-0000-4000-8000-000000000609'::uuid,
    '00000000-0000-4000-8000-000000000608'::uuid
  ],
  'successive limit-one pages concatenate without gaps or duplicate tie rows'
);
select is_empty(
  $$select 1
      from public.list_public_sighting_feed('00000000-0000-4000-8000-000000000609', 2)
     where "sightingId" = '00000000-0000-4000-8000-000000000609'$$,
  'the cursor row is excluded from the next page when visible times tie'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select is(
  (select count(*) from public.list_public_sighting_feed(null, 50)),
  5::bigint,
  'anonymous JWT callers can read only the narrow delayed feed'
);
select is(
  (select "sightingId" from public.list_public_sighting_feed('00000000-0000-4000-8000-000000000601', 1)),
  '00000000-0000-4000-8000-000000000602'::uuid,
  'anonymous UUID cursor semantics remain unchanged by authenticated block filtering'
);
select throws_ok(
  $$select * from public.sightings$$,
  '42501', null,
  'anonymous JWT callers cannot read raw sightings'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000333', true);
select throws_ok(
  $$select public.create_moderation_report(
      'sighting', '00000000-0000-4000-8000-000000000602', 'spam', null,
      '00000000-0000-4000-8000-000000000901'
    )$$,
  '42501', 'adult_contributor_required',
  'future adult confirmation and an expired provisional role do not authorize reporting'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000111', true);
select throws_ok(
  $$select * from public.sightings$$,
  '42501', null,
  'authenticated JWT callers cannot read raw sightings'
);
select throws_ok(
  $$insert into public.moderation_reports (
      reporter_id, content_type, content_id, reason, risk, status, due_at
    ) values (
      '00000000-0000-4000-8000-000000000111', 'sighting',
      '00000000-0000-4000-8000-000000000602', 'spam', 'normal', 'open', now()
    )$$,
  '42501', null,
  'authenticated JWT callers cannot forge moderation operational fields through raw inserts'
);
select throws_ok(
  $$insert into public.user_blocks (blocker_id, blocked_id) values (
      '00000000-0000-4000-8000-000000000111',
      '00000000-0000-4000-8000-000000000222'
    )$$,
  '42501', null,
  'authenticated JWT callers can create blocks only through the actor-derived RPC'
);
select throws_ok(
  $$select * from private.safety_requests$$,
  '42501', null,
  'authenticated JWT callers cannot inspect private idempotency records'
);
select lives_ok($test$
do $body$
declare first_report uuid; retried_report uuid;
begin
  first_report := public.create_moderation_report(
    'sighting', '00000000-0000-4000-8000-000000000602', 'spam', null,
    '00000000-0000-4000-8000-000000000902'
  );
  retried_report := public.create_moderation_report(
    'sighting', '00000000-0000-4000-8000-000000000602', 'spam', null,
    '00000000-0000-4000-8000-000000000902'
  );
  if first_report is distinct from retried_report then
    raise exception 'matching request IDs returned different reports';
  end if;
end
$body$;
$test$, 'matching report retries return the original report');
select throws_ok(
  $$select public.create_moderation_report(
      'sighting', '00000000-0000-4000-8000-000000000602', 'harassment', null,
      '00000000-0000-4000-8000-000000000902'
    )$$,
  'P0001', 'idempotency_conflict',
  'conflicting report request reuse fails closed'
);
select throws_ok(
  $$select public.create_moderation_report(
      'sighting', '00000000-0000-4000-8000-000000000605', 'spam', null,
      '00000000-0000-4000-8000-000000000903'
    )$$,
  'P0001', 'target_not_available',
  'invisible report targets fail generically'
);
select throws_ok(
  $$select public.create_moderation_report(
      'animal', '00000000-0000-4000-8000-000000000602', 'spam', null,
      '00000000-0000-4000-8000-000000000912'
    )$$,
  '22023', 'invalid_report_request',
  'report content type is a strict server allow-list'
);
select throws_ok(
  $$select public.create_moderation_report(
      null, '00000000-0000-4000-8000-000000000602', null, null,
      '00000000-0000-4000-8000-000000000914'
    )$$,
  '22023', 'invalid_report_request',
  'null report policy fields fail closed as an invalid request'
);
select throws_ok(
  $$select public.create_moderation_report(
      'sighting', '00000000-0000-4000-8000-000000000602', 'make_admin', null,
      '00000000-0000-4000-8000-000000000913'
    )$$,
  '22023', 'invalid_report_request',
  'report reason is a strict server allow-list'
);
select throws_ok(
  $$select public.create_moderation_report(
      'sighting', '00000000-0000-4000-8000-000000009999', 'spam', null,
      '00000000-0000-4000-8000-000000000904'
    )$$,
  'P0001', 'target_not_available',
  'nonexistent report targets use the same generic failure'
);
select throws_ok(
  $$select public.create_moderation_report(
      'sighting', '00000000-0000-4000-8000-000000000602', 'spam', repeat('x', 1001),
      '00000000-0000-4000-8000-000000000905'
    )$$,
  '22023', 'invalid_report_request',
  'report detail is bounded server-side'
);
select lives_ok(
  $$select public.create_moderation_report(
      'sighting', '00000000-0000-4000-8000-000000000607', 'animal_in_immediate_danger',
      'Urgent welfare concern.', '00000000-0000-4000-8000-000000000906'
    )$$,
  'server high-risk policy can atomically auto-hide a sighting'
);
reset role;

select is(
  (select count(*) from public.moderation_reports
    where reporter_id = '00000000-0000-4000-8000-000000000111'
      and content_id = '00000000-0000-4000-8000-000000000602'),
  1::bigint,
  'matching report retries create one moderation report'
);
select is(
  (select count(*) from audit.access_audit
    where actor_id = '00000000-0000-4000-8000-000000000111'
      and action = 'create_moderation_report'
      and request_id = '00000000-0000-4000-8000-000000000902'),
  1::bigint,
  'matching report retries append one report audit event'
);
select ok(
  (select visibility = 'hidden' from public.sightings where id = '00000000-0000-4000-8000-000000000607')
    and (select status = 'auto_hidden' and risk = 'critical' and due_at <= now() + interval '1 hour'
         from public.moderation_reports where content_id = '00000000-0000-4000-8000-000000000607'),
  'high-risk policy derives critical risk, SLA, status, and hidden visibility server-side'
);
select is(
  (select count(*) from audit.access_audit
    where action = 'auto_hide_sighting'
      and request_id = '00000000-0000-4000-8000-000000000906'
      and reason is null),
  1::bigint,
  'auto-hide appends one audit event without sensitive detail metadata'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000111', true);
select lives_ok(
  $$select public.block_user(
      '00000000-0000-4000-8000-000000000222',
      '00000000-0000-4000-8000-000000000907'
    );
    select public.block_user(
      '00000000-0000-4000-8000-000000000222',
      '00000000-0000-4000-8000-000000000907'
    )$$,
  'matching block retries are idempotent'
);
select is_empty(
  $$select 1 from public.list_public_sighting_feed(null, 50)
     where "sightingId" = '00000000-0000-4000-8000-000000000601'$$,
  'authenticated feed excludes content authored by a blocked user'
);
select throws_ok(
  $$select *
      from public.list_public_sighting_feed('00000000-0000-4000-8000-000000000601', 50)$$,
  'P0001', 'invalid_feed_cursor',
  'a caller-blocked author sighting UUID is not a valid cursor oracle'
);
select throws_ok(
  $$select public.unblock_user(
      '00000000-0000-4000-8000-000000000222',
      '00000000-0000-4000-8000-000000000907'
    )$$,
  'P0001', 'idempotency_conflict',
  'a block request ID cannot be reused for another operation'
);
select throws_ok(
  $$select public.block_user(
      '00000000-0000-4000-8000-000000000111',
      '00000000-0000-4000-8000-000000000908'
    )$$,
  'P0001', 'target_not_available',
  'self-block fails with the generic unavailable-target response'
);
select is(
  public.block_user(
    '00000000-0000-4000-8000-000000009999',
    '00000000-0000-4000-8000-000000000909'
  ),
  true,
  'a nonexistent block target has the same successful no-op result'
);
select is(
  public.block_user(
    '00000000-0000-4000-8000-000000009999',
    '00000000-0000-4000-8000-000000000909'
  ),
  true,
  'a nonexistent block target retains idempotent retry semantics'
);
select is_empty(
  $$select 1 from public.user_blocks
      where blocker_id = '00000000-0000-4000-8000-000000000111'
        and blocked_id = '00000000-0000-4000-8000-000000009999'$$,
  'a nonexistent block target never reaches the foreign-key-backed block table'
);
select is(
  (select count(*) from private.safety_requests
    where actor_id = '00000000-0000-4000-8000-000000000111'
      and request_id = '00000000-0000-4000-8000-000000000909'
      and operation = 'block'),
  1::bigint,
  'a nonexistent block target records one idempotency outcome'
);
select is(
  (select count(*) from audit.access_audit
    where actor_id = '00000000-0000-4000-8000-000000000111'
      and action = 'block_user'
      and request_id = '00000000-0000-4000-8000-000000000909'),
  1::bigint,
  'a nonexistent block target appends one audit outcome'
);
select is(
  public.unblock_user(
    '00000000-0000-4000-8000-000000009999',
    '00000000-0000-4000-8000-000000000916'
  ),
  true,
  'a nonexistent unblock target has the same successful no-op result'
);
select is_empty(
  $$select 1 from public.user_blocks
      where blocker_id = '00000000-0000-4000-8000-000000000111'
        and blocked_id = '00000000-0000-4000-8000-000000009999'$$,
  'a nonexistent unblock target never reaches the foreign-key-backed block table'
);
select is(
  (select count(*) from private.safety_requests
    where actor_id = '00000000-0000-4000-8000-000000000111'
      and request_id = '00000000-0000-4000-8000-000000000916'
      and operation = 'unblock'),
  1::bigint,
  'a nonexistent unblock target records one idempotency outcome'
);
select is(
  (select count(*) from audit.access_audit
    where actor_id = '00000000-0000-4000-8000-000000000111'
      and action = 'unblock_user'
      and request_id = '00000000-0000-4000-8000-000000000916'),
  1::bigint,
  'a nonexistent unblock target appends one audit outcome'
);
select throws_ok(
  $$delete from public.user_blocks
     where blocker_id = '00000000-0000-4000-8000-000000000111'$$,
  '42501', null,
  'block ownership cannot be bypassed through raw deletion'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000444', true);
select lives_ok(
  $$select public.unblock_user(
      '00000000-0000-4000-8000-000000000222',
      '00000000-0000-4000-8000-000000000910'
    )$$,
  'another caller can only attempt to remove their own block relation'
);
reset role;
select ok(
  exists (select 1 from public.user_blocks
    where blocker_id = '00000000-0000-4000-8000-000000000111'
      and blocked_id = '00000000-0000-4000-8000-000000000222'),
  'another caller cannot remove the owner block'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000111', true);
select lives_ok(
  $$select public.unblock_user(
      '00000000-0000-4000-8000-000000000222',
      '00000000-0000-4000-8000-000000000911'
    );
    select public.unblock_user(
      '00000000-0000-4000-8000-000000000222',
      '00000000-0000-4000-8000-000000000911'
    )$$,
  'only the owner can unblock and matching retries remain idempotent'
);
reset role;

select is(
  (select count(*) from public.user_blocks
    where blocker_id = '00000000-0000-4000-8000-000000000111'
      and blocked_id = '00000000-0000-4000-8000-000000000222'),
  0::bigint,
  'owner unblock removes exactly the caller-owned relation'
);
select is(
  (select count(*) from audit.access_audit
    where actor_id = '00000000-0000-4000-8000-000000000111'
      and action = 'block_user'
      and request_id = '00000000-0000-4000-8000-000000000907'),
  1::bigint,
  'matching block retries append one audit event'
);
select is(
  (select count(*) from audit.access_audit
    where actor_id = '00000000-0000-4000-8000-000000000111'
      and action = 'unblock_user'
      and request_id = '00000000-0000-4000-8000-000000000911'),
  1::bigint,
  'matching unblock retries append one audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000222', true);
select lives_ok(
  $$select public.block_user(
      '00000000-0000-4000-8000-000000000111',
      '00000000-0000-4000-8000-000000000915'
    )$$,
  'the content author can create the reverse-direction block relation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000111', true);
select throws_ok(
  $$select *
      from public.list_public_sighting_feed('00000000-0000-4000-8000-000000000601', 50)$$,
  'P0001', 'invalid_feed_cursor',
  'an author-blocked caller cannot use the author sighting UUID as a cursor oracle'
);
reset role;

select * from finish();
rollback;
