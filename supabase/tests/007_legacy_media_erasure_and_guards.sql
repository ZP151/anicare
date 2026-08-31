begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

select has_table('private', 'legacy_media_deletion_jobs', 'legacy media deletion outbox exists');
select has_function('public', 'claim_legacy_media_deletion_jobs', array['integer'], 'service legacy-media claim RPC exists');
select has_function('public', 'complete_legacy_media_deletion_job', array['uuid', 'uuid', 'text', 'text', 'uuid', 'text'], 'service legacy-media completion RPC exists');
select ok(not has_function_privilege('authenticated', 'public.claim_legacy_media_deletion_jobs(integer)', 'execute'), 'clients cannot claim legacy media deletion jobs');
select ok(not has_function_privilege('authenticated', 'public.complete_legacy_media_deletion_job(uuid,uuid,text,text,uuid,text)', 'execute'), 'clients cannot complete legacy media deletion jobs');

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000811', 'Legacy Owner', now()),
  ('00000000-0000-4000-8000-000000000821', 'Bulk Erasure One', now()),
  ('00000000-0000-4000-8000-000000000822', 'Bulk Erasure Two', now()),
  ('00000000-0000-4000-8000-000000000831', 'Rollback Erasure', now()),
  ('00000000-0000-4000-8000-000000000841', 'Report Actor', now()),
  ('00000000-0000-4000-8000-000000000842', 'Present Report Target', now());
set local session_replication_role = origin;

insert into public.media_assets (id, uploader_id, storage_bucket, storage_path, sha256, redaction_confirmed_at) values
  ('00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000811', 'public-media', '00000000-0000-4000-8000-000000000811/public-812.jpg', repeat('a', 64), now()),
  ('00000000-0000-4000-8000-000000000813', '00000000-0000-4000-8000-000000000811', 'private-evidence', '00000000-0000-4000-8000-000000000811/private-813.jpg', repeat('b', 64), now());
select lives_ok(
  $$delete from public.user_profiles where id = '00000000-0000-4000-8000-000000000811'$$,
  'profile erasure queues owned legacy media before ownership is cleared'
);
select is(
  (select count(*) from private.legacy_media_deletion_jobs where media_id in (
    '00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000813'
  )),
  2::bigint,
  'legacy deletion outbox persists both owned legacy objects after profile deletion'
);
select is(
  (select array_agg(storage_bucket order by storage_bucket) from private.legacy_media_deletion_jobs
    where media_id in ('00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000813')),
  array['private-evidence', 'public-media']::text[],
  'outbox keeps immutable allowed bucket metadata for both legacy objects'
);
select is(
  (select count(*) from public.media_assets where id in (
    '00000000-0000-4000-8000-000000000812', '00000000-0000-4000-8000-000000000813'
  ) and uploader_id is null),
  2::bigint,
  'legacy media ownership is cleared only after durable outbox rows exist'
);
select is(
  (select count(*) from public.claim_legacy_media_deletion_jobs(2)),
  2::bigint,
  'scheduler can claim persisted legacy jobs after profile deletion'
);
select lives_ok($test$
  select public.complete_legacy_media_deletion_job(
    id, media_id, storage_bucket, storage_path, cleanup_claim_id, 'missing'
  ) from private.legacy_media_deletion_jobs where media_id = '00000000-0000-4000-8000-000000000812';
$test$, 'a missing public-media object completes idempotently');
select lives_ok($test$
  select public.complete_legacy_media_deletion_job(
    id, media_id, storage_bucket, storage_path, cleanup_claim_id, 'missing'
  ) from private.legacy_media_deletion_jobs where media_id = '00000000-0000-4000-8000-000000000812';
$test$, 'a repeated missing-object completion remains successful');
select is(
  (select status::text from private.legacy_media_deletion_jobs where media_id = '00000000-0000-4000-8000-000000000812'),
  'completed', 'missing object completion reaches the terminal success state'
);
select lives_ok($test$
  select public.complete_legacy_media_deletion_job(
    id, media_id, storage_bucket, storage_path, cleanup_claim_id, 'retry'
  ) from private.legacy_media_deletion_jobs where media_id = '00000000-0000-4000-8000-000000000813';
$test$, 'a transient private-evidence failure is recorded for retry');
select ok(
  exists (select 1 from private.legacy_media_deletion_jobs where media_id = '00000000-0000-4000-8000-000000000813'
    and status = 'pending' and attempt_count = 1 and next_attempt_at > now()),
  'transient failure remains pending with a bounded retry schedule'
);
update private.legacy_media_deletion_jobs set attempt_count = 4, next_attempt_at = now() - interval '1 second'
where media_id = '00000000-0000-4000-8000-000000000813';
select is((select count(*) from public.claim_legacy_media_deletion_jobs(1)), 1::bigint, 'retryable legacy job can be claimed again');
select lives_ok($test$
  select public.complete_legacy_media_deletion_job(
    id, media_id, storage_bucket, storage_path, cleanup_claim_id, 'retry'
  ) from private.legacy_media_deletion_jobs where media_id = '00000000-0000-4000-8000-000000000813';
$test$, 'the retry limit can record a terminal storage failure');
select is(
  (select status::text from private.legacy_media_deletion_jobs where media_id = '00000000-0000-4000-8000-000000000813'),
  'terminal_failure', 'repeated transient failures reach a durable terminal state'
);
select ok(
  not private.is_safe_legacy_media_storage_target('00000000-0000-4000-8000-000000000811', '../unsafe.jpg'),
  'traversal paths cannot become scheduler-eligible deletion targets'
);

insert into public.moderation_reports (id, content_type, reason, risk, status, due_at) values
  ('00000000-0000-4000-8000-000000000823', 'sighting', 'spam', 'normal', 'resolved', now()),
  ('00000000-0000-4000-8000-000000000824', 'sighting', 'spam', 'normal', 'resolved', now()),
  ('00000000-0000-4000-8000-000000000832', 'sighting', 'spam', 'normal', 'resolved', now());
insert into public.moderation_actions (actor_id, report_id, action, rationale, request_id, resulting_visibility) values
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000823', 'no_action', 'Bulk erasure action one remains auditable.', '00000000-0000-4000-8000-000000000825', 'limited'),
  ('00000000-0000-4000-8000-000000000822', '00000000-0000-4000-8000-000000000824', 'no_action', 'Bulk erasure action two remains auditable.', '00000000-0000-4000-8000-000000000826', 'limited'),
  ('00000000-0000-4000-8000-000000000831', '00000000-0000-4000-8000-000000000832', 'no_action', 'Rollback erasure action remains auditable.', '00000000-0000-4000-8000-000000000833', 'limited');
select lives_ok(
  $$delete from public.user_profiles where id in ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000822')$$,
  'bulk profile erasure pseudonymizes each matching moderator action'
);
select ok(
  (select count(*) from public.moderation_actions where request_id in ('00000000-0000-4000-8000-000000000825', '00000000-0000-4000-8000-000000000826') and actor_id is null and actor_erasure_token is not null) = 2,
  'bulk erasure updates only the two erased action actors'
);
select throws_ok(
  $$update public.moderation_actions set rationale = 'Unrelated action mutation must still fail.'
      where request_id = '00000000-0000-4000-8000-000000000825'$$,
  '42501', 'moderation_actions_append_only', 'an unrelated action mutation fails after erasure in the same transaction'
);
select throws_ok($test$
  do $body$
  begin
    delete from public.user_profiles where id = '00000000-0000-4000-8000-000000000831';
    raise exception 'rollback_probe' using errcode = 'P0001';
  end
  $body$;
$test$, 'P0001', 'rollback_probe', 'erasure changes roll back atomically when the deleting transaction aborts');
select ok(
  exists (select 1 from public.user_profiles where id = '00000000-0000-4000-8000-000000000831')
    and exists (select 1 from public.moderation_actions where request_id = '00000000-0000-4000-8000-000000000833' and actor_id = '00000000-0000-4000-8000-000000000831'),
  'rollback leaves the profile and append-only actor reference intact'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000841', true);
select is(
  public.create_moderation_report('user', '00000000-0000-4000-8000-000000000842', 'spam', null, '00000000-0000-4000-8000-000000000843'),
  '00000000-0000-4000-8000-000000000843'::uuid,
  'an existing user report returns the opaque request outcome'
);
select is(
  public.create_moderation_report('user', '00000000-0000-4000-8000-000000009999', 'spam', null, '00000000-0000-4000-8000-000000000844'),
  '00000000-0000-4000-8000-000000000844'::uuid,
  'an unknown user report returns the same opaque request outcome'
);
reset role;
select is_empty(
  $$select 1 from public.moderation_reports where reporter_id = '00000000-0000-4000-8000-000000000841'
      and content_type = 'user' and content_id = '00000000-0000-4000-8000-000000009999'$$,
  'an unknown user report creates no fictitious moderation item'
);
select is(
  (select count(*) from audit.access_audit where actor_id = '00000000-0000-4000-8000-000000000841'
    and action = 'create_moderation_report' and request_id = '00000000-0000-4000-8000-000000000844'),
  1::bigint, 'unknown user report retains one audited idempotent no-op outcome'
);

select * from finish();
rollback;
