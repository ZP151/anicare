begin;

-- Retained moderation and audit history stays useful for chronology and
-- integrity checks, without keeping the erased account UUID as the actor.
alter table public.moderation_actions
  add column actor_erasure_token uuid;
alter table audit.access_audit
  add column actor_erasure_token uuid;

alter table public.moderation_actions
  drop constraint moderation_actions_actor_id_fkey;
alter table public.moderation_actions
  alter column actor_id drop not null;
alter table public.moderation_actions
  add constraint moderation_actions_actor_id_fkey
  foreign key (actor_id) references public.user_profiles(id) on delete set null;

create or replace function private.reject_moderation_action_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- Account erasure is the only mutation permitted after insertion. The
  -- profile-deletion trigger runs a security-definer function that sets this
  -- transaction-local guard before clearing the actor and retaining a random
  -- non-identifying trace token.
  if tg_op = 'UPDATE'
      and pg_catalog.current_setting('private.account_erasure_active', true) = 'on'
      and old.actor_id is not null
      and new.actor_id is null
      and old.actor_erasure_token is null
      and new.actor_erasure_token is not null
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
begin
  -- This trigger is intentionally the sole trusted account-erasure path. It
  -- executes before the auth.users -> user_profiles cascade removes the
  -- profile, so rows with RESTRICT constraints can be retained safely.
  perform pg_catalog.set_config('private.account_erasure_active', 'on', true);

  update public.media_assets
     set deleted_at = coalesce(deleted_at, pg_catalog.now()),
         embedding = null,
         embedding_model_version = null,
         training_eligible = false
   where uploader_id = old.id;

  -- Set every retained job due now. The cleanup claim function decides whether
  -- deletion must be deferred through an active signed-upload replay window.
  update private.media_upload_jobs
     set uploader_id = null,
         status = case
           when status = 'finalized'::private.media_upload_job_status
             then 'deletion_pending'::private.media_upload_job_status
           else status
         end,
         next_cleanup_at = pg_catalog.now(),
         cleanup_claimed_at = null,
         cleanup_claim_id = null,
         updated_at = pg_catalog.now()
   where uploader_id = old.id;

  delete from private.admin_moderation_requests
   where actor_id = old.id;

  update public.moderation_actions
     set actor_id = null,
         actor_erasure_token = erasure_token
   where actor_id = old.id;

  update audit.access_audit
     set actor_erasure_token = erasure_token
   where actor_id = old.id;

  return old;
end;
$$;

drop trigger if exists user_profiles_account_erasure on public.user_profiles;
create trigger user_profiles_account_erasure
before delete on public.user_profiles
for each row execute function private.prepare_user_profile_account_erasure();

create or replace function public.claim_expired_media_staging_jobs(p_limit integer default 25)
returns table (job_id uuid, object_path text, cleanup_claim_id uuid, cleanup_action text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'invalid_cleanup_limit' using errcode = '22023'; end if;
  return query
  with candidates as (
    select j.id
    from private.media_upload_jobs j
    where j.next_cleanup_at <= now()
      and (j.cleanup_claimed_at is null or j.cleanup_claimed_at <= now() - interval '5 minutes')
      and (
        (j.status = 'reserved' and (j.reservation_expires_at <= now() or j.uploader_id is null))
        or j.status = 'deletion_pending'
      )
    order by j.next_cleanup_at, j.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update private.media_upload_jobs j
    set cleanup_claimed_at = now(), cleanup_claim_id = extensions.gen_random_uuid(), updated_at = now()
    from candidates
    where j.id = candidates.id
    returning j.*
  )
  select c.id, c.object_path, c.cleanup_claim_id,
    case
      when c.status = 'reserved' and now() >= coalesce(c.upload_token_expires_at, c.reservation_expires_at) + interval '5 minutes' then 'remove_and_purge'
      when c.status = 'reserved' then 'remove_and_retry'
      when c.status = 'deletion_pending' and now() >= coalesce(c.upload_token_expires_at, c.reservation_expires_at) + interval '5 minutes' then 'remove_and_purge'
      when c.status = 'deletion_pending' then 'defer_delete'
      else 'invalid'
    end
  from claimed c;
end;
$$;

create or replace function public.block_user(
  p_blocked_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  payload_hash text;
  prior private.safety_requests%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_profiles p where p.id = actor_id) then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_blocked_id is null then
    raise exception 'invalid_block_request' using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'operation', 'block', 'targetId', p_blocked_id
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior
  from private.safety_requests r
  where r.actor_id = block_user.actor_id and r.request_id = p_request_id;
  if found then
    if prior.operation <> 'block'
        or prior.target_id <> p_blocked_id
        or prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return true;
  end if;

  if p_blocked_id = actor_id then
    raise exception 'target_not_available' using errcode = 'P0001';
  end if;

  insert into private.safety_requests (
    actor_id, request_id, operation, target_id, payload_hash
  ) values (
    actor_id, p_request_id, 'block', p_blocked_id, payload_hash
  );

  -- Lock an extant target until this transaction completes. If it is absent,
  -- return the same audited, idempotent success as any other no-op and never
  -- attempt the foreign-key-backed insert.
  perform 1
  from public.user_profiles p
  where p.id = p_blocked_id
  for key share;
  if found then
    insert into public.user_blocks (blocker_id, blocked_id)
    values (actor_id, p_blocked_id)
    on conflict (blocker_id, blocked_id) do nothing;
  end if;

  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, reason, request_id
  ) values (
    actor_id, 'block_user', 'user_block', p_blocked_id,
    'community_safety', null, p_request_id::text
  );
  return true;
end;
$$;

create or replace function public.unblock_user(
  p_blocked_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  payload_hash text;
  prior private.safety_requests%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_profiles p where p.id = actor_id) then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_blocked_id is null then
    raise exception 'invalid_block_request' using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'operation', 'unblock', 'targetId', p_blocked_id
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior
  from private.safety_requests r
  where r.actor_id = unblock_user.actor_id and r.request_id = p_request_id;
  if found then
    if prior.operation <> 'unblock'
        or prior.target_id <> p_blocked_id
        or prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return true;
  end if;

  if p_blocked_id = actor_id then
    raise exception 'target_not_available' using errcode = 'P0001';
  end if;

  insert into private.safety_requests (
    actor_id, request_id, operation, target_id, payload_hash
  ) values (
    actor_id, p_request_id, 'unblock', p_blocked_id, payload_hash
  );
  delete from public.user_blocks b
   where b.blocker_id = actor_id and b.blocked_id = p_blocked_id;
  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, reason, request_id
  ) values (
    actor_id, 'unblock_user', 'user_block', p_blocked_id,
    'community_safety', null, p_request_id::text
  );
  return true;
end;
$$;

revoke all on function private.prepare_user_profile_account_erasure() from public, anon, authenticated, service_role;
revoke all on function public.claim_expired_media_staging_jobs(integer) from public, anon, authenticated;
revoke all on function public.block_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.unblock_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_expired_media_staging_jobs(integer) to service_role;
grant execute on function public.block_user(uuid, uuid) to authenticated;
grant execute on function public.unblock_user(uuid, uuid) to authenticated;

comment on function private.prepare_user_profile_account_erasure() is
  'Trigger-only trusted account erasure path. It tombstones uploaded media, schedules replay-safe cleanup, removes ephemeral moderator request ledgers, and pseudonymizes retained actor history.';
comment on column public.moderation_actions.actor_erasure_token is
  'Random per-account-erasure token that links retained moderation history without retaining the erased actor UUID.';
comment on column audit.access_audit.actor_erasure_token is
  'Random per-account-erasure token that links retained audit history without retaining the erased actor UUID.';
comment on function public.block_user(uuid, uuid) is
  'Creates only the authenticated caller-owned block. Unknown UUID targets return the same audited idempotent no-op result without attempting a foreign-key insert.';
comment on function public.unblock_user(uuid, uuid) is
  'Removes only the authenticated caller-owned block. Unknown UUID targets return the same audited idempotent no-op result.';

commit;
