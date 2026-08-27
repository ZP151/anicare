begin;

create type private.legacy_media_deletion_status as enum ('pending', 'completed', 'terminal_failure');

create or replace function private.is_safe_legacy_media_storage_path(value text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select value is not null
    and char_length(value) between 1 and 512
    and position(chr(92) in value) = 0
    and not exists (
      select 1
      from unnest(string_to_array(value, '/')) as segment(value)
      where segment.value in ('', '.', '..')
    );
$$;

create or replace function private.is_safe_legacy_media_storage_target(
  p_expected_owner_id uuid,
  p_storage_path text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_expected_owner_id is not null
    and private.is_safe_legacy_media_storage_path(p_storage_path)
    and p_storage_path like p_expected_owner_id::text || '/%';
$$;

create table private.legacy_media_deletion_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  media_id uuid not null unique,
  storage_bucket text not null check (storage_bucket in ('public-media', 'private-evidence')),
  -- Preserve unsafe historical metadata for manual review; only the trigger,
  -- claim RPC and Edge worker may classify a path as safe to delete.
  storage_path text not null,
  expected_owner_id uuid not null,
  status private.legacy_media_deletion_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default pg_catalog.now(),
  cleanup_claimed_at timestamptz,
  cleanup_claim_id uuid,
  completed_at timestamptz,
  terminal_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (storage_bucket, storage_path),
  check (
    (status = 'pending' and completed_at is null and terminal_reason is null)
    or (status = 'completed' and completed_at is not null and terminal_reason is null)
    or (status = 'terminal_failure' and completed_at is not null and terminal_reason in ('retry_limit_exhausted', 'unsafe_legacy_storage_target'))
  )
);

create index legacy_media_deletion_jobs_claim_idx
  on private.legacy_media_deletion_jobs (next_attempt_at, id)
  where status = 'pending';

alter table private.legacy_media_deletion_jobs enable row level security;
revoke all on table private.legacy_media_deletion_jobs from public, anon, authenticated;
grant select, insert, update, delete on table private.legacy_media_deletion_jobs to service_role;

create or replace function private.reject_legacy_media_deletion_target_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.media_id is distinct from old.media_id
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_path is distinct from old.storage_path
      or new.expected_owner_id is distinct from old.expected_owner_id then
    raise exception 'legacy_media_deletion_target_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger legacy_media_deletion_target_immutable
before update on private.legacy_media_deletion_jobs
for each row execute function private.reject_legacy_media_deletion_target_mutation();

create or replace function private.queue_legacy_media_deletion_before_profile_erasure()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Only legacy buckets without a staging cleanup record enter this outbox.
  -- The immutable target is captured while uploader ownership still exists.
  insert into private.legacy_media_deletion_jobs (
    media_id, storage_bucket, storage_path, expected_owner_id, status, completed_at, terminal_reason
  )
  select
    media.id,
    media.storage_bucket,
    media.storage_path,
    old.id,
    case when private.is_safe_legacy_media_storage_target(old.id, media.storage_path)
      then 'pending'::private.legacy_media_deletion_status
      else 'terminal_failure'::private.legacy_media_deletion_status
    end,
    case when private.is_safe_legacy_media_storage_target(old.id, media.storage_path)
      then null
      else pg_catalog.now()
    end,
    case when private.is_safe_legacy_media_storage_target(old.id, media.storage_path)
      then null
      else 'unsafe_legacy_storage_target'
    end
  from public.media_assets media
  where media.uploader_id = old.id
    and media.storage_bucket in ('public-media', 'private-evidence')
    and not exists (
      select 1 from private.media_upload_jobs upload_job
      where upload_job.media_asset_id = media.id
    )
  on conflict (media_id) do nothing;
  return old;
end;
$$;

drop trigger if exists user_profiles_legacy_media_deletion_outbox on public.user_profiles;
create trigger user_profiles_legacy_media_deletion_outbox
before delete on public.user_profiles
for each row execute function private.queue_legacy_media_deletion_before_profile_erasure();

create or replace function public.claim_legacy_media_deletion_jobs(p_limit integer default 25)
returns table (job_id uuid, media_id uuid, storage_bucket text, storage_path text, expected_owner_id uuid, cleanup_claim_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid_cleanup_limit' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select job.id
    from private.legacy_media_deletion_jobs job
    where job.status = 'pending'
      and job.next_attempt_at <= pg_catalog.now()
      and private.is_safe_legacy_media_storage_target(job.expected_owner_id, job.storage_path)
      and (job.cleanup_claimed_at is null or job.cleanup_claimed_at <= pg_catalog.now() - interval '5 minutes')
    order by job.next_attempt_at, job.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update private.legacy_media_deletion_jobs job
       set cleanup_claimed_at = pg_catalog.now(),
           cleanup_claim_id = extensions.gen_random_uuid(),
           updated_at = pg_catalog.now()
      from candidates
     where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.media_id, claimed.storage_bucket, claimed.storage_path, claimed.expected_owner_id, claimed.cleanup_claim_id
  from claimed;
end;
$$;

create or replace function public.complete_legacy_media_deletion_job(
  p_job_id uuid,
  p_media_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_cleanup_claim_id uuid,
  p_result text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job private.legacy_media_deletion_jobs%rowtype;
  next_attempt_count integer;
begin
  if p_job_id is null or p_media_id is null or p_storage_bucket is null or p_storage_bucket not in ('public-media', 'private-evidence')
      or p_storage_path is null or not private.is_safe_legacy_media_storage_path(p_storage_path)
      or p_result is null or p_result not in ('removed', 'missing', 'retry') then
    raise exception 'invalid_legacy_media_cleanup_completion' using errcode = '22023';
  end if;

  select * into job
  from private.legacy_media_deletion_jobs
  where id = p_job_id
  for update;
  if not found or job.media_id is distinct from p_media_id
      or job.storage_bucket is distinct from p_storage_bucket
      or job.storage_path is distinct from p_storage_path
      or not private.is_safe_legacy_media_storage_target(job.expected_owner_id, job.storage_path) then
    raise exception 'invalid_legacy_media_cleanup_claim' using errcode = 'P0001';
  end if;

  if job.status = 'completed' and p_result in ('removed', 'missing') then
    return 'completed';
  end if;
  if p_cleanup_claim_id is null or job.status <> 'pending' or job.cleanup_claim_id is distinct from p_cleanup_claim_id then
    raise exception 'invalid_legacy_media_cleanup_claim' using errcode = 'P0001';
  end if;

  if p_result in ('removed', 'missing') then
    update private.legacy_media_deletion_jobs
       set status = 'completed',
           completed_at = pg_catalog.now(),
           cleanup_claimed_at = null,
           cleanup_claim_id = null,
           updated_at = pg_catalog.now()
     where id = job.id;
    return 'completed';
  end if;

  next_attempt_count := job.attempt_count + 1;
  if next_attempt_count >= 5 then
    update private.legacy_media_deletion_jobs
       set status = 'terminal_failure',
           attempt_count = next_attempt_count,
           completed_at = pg_catalog.now(),
           terminal_reason = 'retry_limit_exhausted',
           cleanup_claimed_at = null,
           cleanup_claim_id = null,
           updated_at = pg_catalog.now()
     where id = job.id;
    return 'terminal_failure';
  end if;

  update private.legacy_media_deletion_jobs
     set attempt_count = next_attempt_count,
         next_attempt_at = pg_catalog.now() + interval '5 minutes',
         cleanup_claimed_at = null,
         cleanup_claim_id = null,
         updated_at = pg_catalog.now()
   where id = job.id;
  return 'pending';
end;
$$;

create or replace function private.reject_moderation_action_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- The actor-bound value exists only while the trusted erasure trigger is
  -- executing. It cannot authorize a later or unrelated row mutation.
  if tg_op = 'UPDATE'
      and old.actor_id is not null
      and new.actor_id is null
      and old.actor_erasure_token is null
      and new.actor_erasure_token is not null
      and pg_catalog.current_setting('private.account_erasure_actor', true) = old.actor_id::text
      and new.id is not distinct from old.id
      and new.report_id is not distinct from old.report_id
      and new.action is not distinct from old.action
      and new.rationale is not distinct from old.rationale
      and new.request_id is not distinct from old.request_id
      and new.resulting_visibility is not distinct from old.resulting_visibility
      and new.created_at is not distinct from old.created_at then
    return new;
  end if;
  raise exception 'moderation_actions_append_only' using errcode = '42501';
end;
$$;

create or replace function private.prepare_user_profile_account_erasure()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  erasure_token uuid := extensions.gen_random_uuid();
  prior_erasure_actor text := pg_catalog.current_setting('private.account_erasure_actor', true);
begin
  perform pg_catalog.set_config('private.account_erasure_actor', old.id::text, true);
  begin
    update public.media_assets
       set deleted_at = coalesce(deleted_at, pg_catalog.now()),
           embedding = null,
           embedding_model_version = null,
           training_eligible = false
     where uploader_id = old.id;

    update private.media_upload_jobs
       set uploader_id = null,
           status = case
             when status = 'finalized'::private.media_upload_job_status then 'deletion_pending'::private.media_upload_job_status
             else status
           end,
           next_cleanup_at = pg_catalog.now(),
           cleanup_claimed_at = null,
           cleanup_claim_id = null,
           updated_at = pg_catalog.now()
     where uploader_id = old.id;

    delete from private.admin_moderation_requests where actor_id = old.id;

    update public.moderation_actions
       set actor_id = null,
           actor_erasure_token = erasure_token
     where actor_id = old.id;

    update audit.access_audit
       set actor_erasure_token = erasure_token
     where actor_id = old.id;
  exception when others then
    perform pg_catalog.set_config('private.account_erasure_actor', coalesce(prior_erasure_actor, ''), true);
    raise;
  end;
  perform pg_catalog.set_config('private.account_erasure_actor', coalesce(prior_erasure_actor, ''), true);
  return old;
end;
$$;

create or replace function public.create_moderation_report(
  p_content_type text,
  p_content_id uuid,
  p_reason_code text,
  p_detail text,
  p_request_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  normalized_detail text;
  payload_hash text;
  prior private.safety_requests%rowtype;
  author_id uuid;
  target_user_id uuid;
  derived_risk public.risk_tier;
  derived_status public.moderation_status;
  derived_due_at timestamptz;
  report_id uuid;
  should_auto_hide boolean := false;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.user_profiles p where p.id = actor_id and p.adult_confirmed_at is not null and p.adult_confirmed_at <= pg_catalog.now()
  ) then raise exception 'adult_contributor_required' using errcode = '42501'; end if;
  if p_content_type is null or p_content_type not in ('sighting', 'user') or p_content_id is null
      or p_reason_code is null or p_reason_code not in ('spam', 'harassment', 'unsafe_location', 'animal_welfare', 'graphic_content', 'misinformation', 'precise_location_exposure', 'animal_in_immediate_danger')
      or p_request_id is null then raise exception 'invalid_report_request' using errcode = '22023'; end if;

  normalized_detail := nullif(pg_catalog.btrim(p_detail), '');
  if (p_detail is not null and normalized_detail is null) or pg_catalog.char_length(coalesce(normalized_detail, '')) > 1000 then
    raise exception 'invalid_report_request' using errcode = '22023';
  end if;
  payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'contentType', p_content_type, 'contentId', p_content_id, 'reasonCode', p_reason_code, 'detail', normalized_detail
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0));
  select * into prior from private.safety_requests r
  where r.actor_id = create_moderation_report.actor_id and r.request_id = p_request_id;
  if found then
    if prior.operation <> 'report' or prior.target_id <> p_content_id or prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return p_request_id;
  end if;

  if p_content_type = 'sighting' then
    select s.reporter_id into author_id
    from public.sightings s join public.animals a on a.id = s.animal_id
    where s.id = p_content_id and s.visibility = 'public' and s.visible_at is not null and s.visible_at <= pg_catalog.now()
      and s.risk <> 'critical' and a.visibility = 'public'
      and (s.reporter_id is null or not exists (select 1 from public.user_blocks b where (b.blocker_id = actor_id and b.blocked_id = s.reporter_id) or (b.blocker_id = s.reporter_id and b.blocked_id = actor_id)))
    for update of s;
    if not found then raise exception 'target_not_available' using errcode = 'P0001'; end if;
  else
    select p.id into target_user_id from public.user_profiles p where p.id = p_content_id and p.id <> actor_id;
    if not found then
      insert into private.safety_requests (actor_id, request_id, operation, target_id, payload_hash)
      values (actor_id, p_request_id, 'report', p_content_id, payload_hash);
      insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, request_id)
      values (actor_id, 'create_moderation_report', 'moderation_target', p_content_id, 'community_safety', p_request_id::text);
      return p_request_id;
    end if;
  end if;

  derived_risk := case when p_reason_code in ('precise_location_exposure', 'animal_in_immediate_danger') then 'critical'::public.risk_tier
    when p_reason_code in ('harassment', 'unsafe_location', 'animal_welfare', 'graphic_content') then 'sensitive'::public.risk_tier else 'normal'::public.risk_tier end;
  should_auto_hide := p_content_type = 'sighting' and derived_risk = 'critical';
  derived_status := case when should_auto_hide then 'auto_hidden'::public.moderation_status else 'open'::public.moderation_status end;
  derived_due_at := pg_catalog.now() + case derived_risk when 'critical'::public.risk_tier then interval '1 hour' when 'sensitive'::public.risk_tier then interval '24 hours' else interval '72 hours' end;
  insert into private.safety_requests (actor_id, request_id, operation, target_id, payload_hash)
  values (actor_id, p_request_id, 'report', p_content_id, payload_hash);
  insert into public.moderation_reports (reporter_id, content_type, content_id, content_author_id, target_user_id, reason, detail, risk, status, assigned_reviewer_id, due_at, request_id)
  values (actor_id, p_content_type, p_content_id, author_id, target_user_id, p_reason_code, normalized_detail, derived_risk, derived_status, null, derived_due_at, p_request_id)
  returning id into report_id;
  if should_auto_hide then
    update public.sightings set visibility = 'hidden' where id = p_content_id;
    insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, reason, request_id)
    values (actor_id, 'auto_hide_sighting', 'sighting', p_content_id, 'community_safety', null, p_request_id::text);
  end if;
  insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, reason, request_id)
  values (actor_id, 'create_moderation_report', 'moderation_report', report_id, 'community_safety', null, p_request_id::text);
  update private.safety_requests request_row
     set result_id = report_id
   where request_row.actor_id = create_moderation_report.actor_id
     and request_row.request_id = p_request_id;
  return p_request_id;
end;
$$;

revoke all on function private.queue_legacy_media_deletion_before_profile_erasure() from public, anon, authenticated, service_role;
revoke all on function public.claim_legacy_media_deletion_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_legacy_media_deletion_job(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.create_moderation_report(text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_legacy_media_deletion_jobs(integer) to service_role;
grant execute on function public.complete_legacy_media_deletion_job(uuid, uuid, text, text, uuid, text) to service_role;
grant execute on function public.create_moderation_report(text, uuid, text, text, uuid) to authenticated;

comment on table private.legacy_media_deletion_jobs is
  'Service-only durable outbox for physical deletion of legacy public-media and private-evidence objects after account erasure.';
comment on function public.complete_legacy_media_deletion_job(uuid, uuid, text, text, uuid, text) is
  'Service-only completion path. Missing Storage objects are terminal success; transient failures retry with a bounded terminal state.';
comment on function public.create_moderation_report(text, uuid, text, text, uuid) is
  'Returns the caller-provided opaque request UUID for both accepted reports and unknown-user no-ops; unknown users create no moderation item.';

commit;
