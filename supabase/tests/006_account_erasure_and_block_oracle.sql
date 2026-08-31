begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

select has_function(
  'private', 'prepare_user_profile_account_erasure', array[]::text[],
  'trusted account-erasure trigger function exists'
);
select results_eq(
  $$select trigger_name::text collate "C"
      from information_schema.triggers
     where event_object_schema = 'public'
       and event_object_table = 'user_profiles'
       and event_manipulation = 'DELETE'
     order by trigger_name collate "C"$$,
  $$values
      ('user_profiles_account_erasure'::text collate "C"),
      ('user_profiles_legacy_media_deletion_outbox'::text collate "C")$$,
  'profile deletion retains exactly the two established non-internal erasure triggers'
);
with expected(role_name) as (
  values ('public'), ('anon'), ('authenticated'), ('service_role')
)
select ok(
  not has_function_privilege(
    role_name,
    'private.prepare_user_profile_account_erasure()',
    'execute'
  ),
  role_name || ' cannot invoke the trusted account-erasure function'
)
from expected;

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values ('00000000-0000-4000-8000-000000000701', 'Erasure Moderator', now());
set local session_replication_role = origin;

insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
) values (
  '00000000-0000-4000-8000-000000000702',
  '00000000-0000-4000-8000-000000000701',
  now(), '8928308280fffff', 'morning', 'normal', 'limited', 'account-erasure-sighting'
);
do $fixture$
begin
  perform public.reserve_media_upload_job(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000702',
    'final-701', repeat('7', 64), 42, 1, 1,
    'jpeg-srgb-2048-q88.v1',
    '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
    now()
  );
  perform public.finalize_media_upload_job(id, uploader_id, sighting_id, media_id, sha256)
  from private.media_upload_jobs
  where media_id = 'final-701';
  perform public.reserve_media_upload_job(
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000702',
    'reserve-701', repeat('8', 64), 42, 1, 1,
    'jpeg-srgb-2048-q88.v1',
    '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
    now()
  );
  update private.media_upload_jobs
  set upload_token_expires_at = now() + interval '1 hour'
  where media_id in ('final-701', 'reserve-701');
end;
$fixture$;

insert into public.moderation_reports (
  id, content_type, reason, risk, status, due_at
) values (
  '00000000-0000-4000-8000-000000000703',
  'sighting', 'spam', 'normal', 'resolved', now() + interval '1 day'
);
insert into public.moderation_actions (
  actor_id, report_id, action, rationale, request_id, resulting_visibility
) values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000703',
  'no_action', 'A durable moderation record for account erasure.',
  '00000000-0000-4000-8000-000000000704', 'limited'
);
insert into private.admin_moderation_requests (
  actor_id, request_id, operation, report_id
) values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000705', 'report_read',
  '00000000-0000-4000-8000-000000000703'
);
insert into audit.access_audit (
  actor_id, action, resource_type, resource_id, purpose, request_id
) values (
  '00000000-0000-4000-8000-000000000701',
  'admin_resolve_moderation_report', 'moderation_report',
  '00000000-0000-4000-8000-000000000703', 'moderation',
  '00000000-0000-4000-8000-000000000704'
);

select set_config('private.account_erasure_actor', 'outer-erasure-scope', true);
select lives_ok(
  $$delete from public.user_profiles where id = '00000000-0000-4000-8000-000000000701'$$,
  'deleting a moderator profile with retained media and history succeeds'
);
select is(
  current_setting('private.account_erasure_actor', true),
  'outer-erasure-scope',
  'successful account erasure restores the caller scoped erasure context'
);

select ok(
  exists (
    select 1 from public.media_assets
    where client_media_id = 'final-701'
      and uploader_id is null
      and deleted_at is not null
      and embedding is null
      and embedding_model_version is null
      and training_eligible = false
  ),
  'account erasure tombstones finalized uploader media and clears AI eligibility'
);
select ok(
  exists (
    select 1 from private.media_upload_jobs
    where media_id = 'final-701'
      and uploader_id is null
      and status = 'deletion_pending'
      and next_cleanup_at <= now()
      and cleanup_claimed_at is null
      and cleanup_claim_id is null
  ),
  'account erasure immediately schedules finalized media for deletion cleanup'
);
update private.media_upload_jobs
set next_cleanup_at = now() - interval '2 seconds'
where media_id = 'final-701';
update private.media_upload_jobs
set next_cleanup_at = now() - interval '1 second'
where media_id = 'reserve-701';
select is(
  (
    select cleanup_action
    from public.claim_expired_media_staging_jobs(1)
    where job_id = (select id from private.media_upload_jobs where media_id = 'final-701')
  ),
  'defer_delete',
  'finalized account-erasure cleanup waits through an active signed-token replay window'
);
select ok(
  exists (
    select 1 from private.media_upload_jobs job
    join public.media_assets asset on asset.id = job.media_asset_id
    where job.media_id = 'final-701'
      and job.object_path = 'jobs/' || job.id::text || '.jpg'
      and asset.storage_path = job.object_path
  ),
  'retained private object metadata remains available to cleanup after account erasure'
);
select ok(
  exists (
    select 1 from private.media_upload_jobs
    where media_id = 'reserve-701'
      and uploader_id is null
      and status = 'reserved'
      and next_cleanup_at <= now()
      and cleanup_claimed_at is null
      and cleanup_claim_id is null
  ),
  'an orphaned reserved job is immediately cleanup eligible'
);
select is(
  (
    select cleanup_action
    from public.claim_expired_media_staging_jobs(1)
    where job_id = (select id from private.media_upload_jobs where media_id = 'reserve-701')
  ),
  'remove_and_retry',
  'an orphaned reserved job is cleaned but retained through its signed-token replay window'
);
select is_empty(
  $$select 1 from private.admin_moderation_requests
      where actor_id = '00000000-0000-4000-8000-000000000701'$$,
  'ephemeral moderator idempotency rows are deleted before profile erasure'
);
select ok(
  exists (
    select 1 from public.moderation_actions
    where request_id = '00000000-0000-4000-8000-000000000704'
      and actor_id is null
      and actor_erasure_token is not null
      and action = 'no_action'
  ),
  'retained moderation actions preserve the action while pseudonymizing the actor'
);
select ok(
  exists (
    select 1 from audit.access_audit
    where request_id = '00000000-0000-4000-8000-000000000704'
      and actor_id is null
      and actor_erasure_token is not null
      and action = 'admin_resolve_moderation_report'
  ),
  'retained audit rows preserve the action while pseudonymizing the actor'
);
select is(
  (
    select actor_erasure_token from public.moderation_actions
    where request_id = '00000000-0000-4000-8000-000000000704'
  ),
  (
    select actor_erasure_token from audit.access_audit
    where request_id = '00000000-0000-4000-8000-000000000704'
  ),
  'the retained audit and moderation records share one non-identifying trace token'
);
select is_empty(
  $$select 1 from public.moderation_actions
      where actor_id = '00000000-0000-4000-8000-000000000701'$$,
  'retained moderation history exposes no exact erased actor UUID'
);
select is_empty(
  $$select 1 from audit.access_audit
      where actor_id = '00000000-0000-4000-8000-000000000701'$$,
  'retained audit history exposes no exact erased actor UUID'
);

select * from finish();
rollback;
