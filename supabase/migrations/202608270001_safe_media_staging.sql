begin;

create or replace function private.exact_unavailable_detectors(value jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(value) = 'object'
    and value = '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb;
$$;

create type private.media_upload_job_status as enum (
  'reserved',
  'finalized',
  'deletion_pending'
);

create table private.media_upload_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  uploader_id uuid not null references public.user_profiles(id) on delete cascade,
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  media_id text not null check (media_id ~ '^[A-Za-z0-9][A-Za-z0-9-]{7,63}$'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_length integer not null check (byte_length between 1 and 20971520),
  width integer not null check (width between 1 and 2048),
  height integer not null check (height between 1 and 2048),
  recipe_version text not null check (recipe_version = 'jpeg-srgb-2048-q88.v1'),
  detector_versions jsonb not null check (private.exact_unavailable_detectors(detector_versions)),
  confirmed_at_local timestamptz not null,
  object_path text not null unique check (object_path = 'jobs/' || id::text || '.jpg'),
  status private.media_upload_job_status not null default 'reserved',
  reserved_at timestamptz not null default now(),
  reservation_expires_at timestamptz not null,
  -- This is set conservatively on reservation and then overwritten with the
  -- server-derived time immediately after Storage mints a two-hour token.
  upload_token_expires_at timestamptz,
  next_cleanup_at timestamptz not null,
  cleanup_claimed_at timestamptz,
  cleanup_claim_id uuid,
  finalized_at timestamptz,
  media_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (uploader_id, media_id),
  constraint media_upload_job_reservation_expiry check (
    reservation_expires_at > reserved_at and reservation_expires_at <= reserved_at + interval '15 minutes'
  ),
  constraint media_upload_job_state check (
    (status = 'reserved' and media_asset_id is null and finalized_at is null)
    or (status in ('finalized', 'deletion_pending') and media_asset_id is not null and finalized_at is not null)
  )
);

create index media_upload_jobs_cleanup_idx
  on private.media_upload_jobs (next_cleanup_at, id);

alter table private.media_upload_jobs enable row level security;
revoke all on table private.media_upload_jobs from public, anon, authenticated;
grant select, insert, update, delete on table private.media_upload_jobs to service_role;

alter table public.media_assets
  drop constraint media_assets_storage_bucket_check;
alter table public.media_assets
  add constraint media_assets_storage_bucket_check
  check (storage_bucket in ('public-media', 'private-evidence', 'media-staging'));
alter table public.media_assets
  add column client_media_id text,
  add column byte_length integer,
  add column width integer,
  add column height integer,
  add column recipe_version text,
  add column detector_versions jsonb,
  add column status text not null default 'quarantined',
  add column reviewed_at timestamptz;
alter table public.media_assets
  add constraint media_assets_client_media_id_check
  check (client_media_id is null or client_media_id ~ '^[A-Za-z0-9][A-Za-z0-9-]{7,63}$'),
  add constraint media_assets_byte_length_check
  check (byte_length is null or byte_length between 1 and 20971520),
  add constraint media_assets_dimensions_check
  check ((width is null and height is null) or (width between 1 and 2048 and height between 1 and 2048)),
  add constraint media_assets_quarantine_status_check
  check (status = 'quarantined'),
  add constraint media_assets_reviewed_staging_check
  check (
    client_media_id is null or (
      storage_bucket = 'media-staging'
      and sha256 ~ '^[a-f0-9]{64}$'
      and byte_length is not null
      and width is not null
      and height is not null
      and recipe_version is not null
      and recipe_version = 'jpeg-srgb-2048-q88.v1'
      and detector_versions is not null
      and private.exact_unavailable_detectors(detector_versions)
      and reviewed_at is not null
    )
  ),
  add constraint media_assets_uploader_client_media_id_key unique (uploader_id, client_media_id);

alter table private.media_upload_jobs
  add constraint media_upload_jobs_asset_fk
  foreign key (media_asset_id) references public.media_assets(id) on delete restrict;

drop policy if exists "public redacted media metadata" on public.media_assets;
drop policy if exists "uploaders read own media metadata" on public.media_assets;
drop policy if exists "adult users submit redacted media metadata" on public.media_assets;
alter table public.media_assets enable row level security;
revoke all on table public.media_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.media_assets to service_role;

revoke all on public.public_animal_feed from public, anon, authenticated;

drop policy if exists "public redacted photos are readable" on storage.objects;
drop policy if exists "users upload into their public folder" on storage.objects;
update storage.buckets set public = false where id = 'public-media';
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media-staging', 'media-staging', false, 20971520, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.reserve_media_upload_job(
  p_uploader_id uuid,
  p_sighting_id uuid,
  p_media_id text,
  p_sha256 text,
  p_byte_length integer,
  p_width integer,
  p_height integer,
  p_recipe_version text,
  p_detector_versions jsonb,
  p_confirmed_at_local timestamptz
)
returns table (
  job_id uuid,
  object_path text,
  reservation_expires_at timestamptz,
  finalized_media_asset_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job private.media_upload_jobs%rowtype;
  fresh_job_id uuid := extensions.gen_random_uuid();
begin
  if p_uploader_id is null or p_sighting_id is null or p_media_id is null or p_sha256 is null or
      p_byte_length is null or p_width is null or p_height is null or p_media_id !~ '^[A-Za-z0-9][A-Za-z0-9-]{7,63}$' or
      p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_length not between 1 and 20971520 or
      p_width not between 1 and 2048 or p_height not between 1 and 2048 or
      p_recipe_version is distinct from 'jpeg-srgb-2048-q88.v1' or p_detector_versions is null or
      not private.exact_unavailable_detectors(p_detector_versions) or p_confirmed_at_local is null or
      p_confirmed_at_local > now() + interval '5 minutes' or p_confirmed_at_local < now() - interval '90 days' then
    raise exception 'invalid_media_reservation' using errcode = '22023';
  end if;

  insert into private.media_upload_jobs (
    id, uploader_id, sighting_id, media_id, sha256, byte_length, width, height,
    recipe_version, detector_versions, confirmed_at_local, object_path,
    reservation_expires_at, upload_token_expires_at, next_cleanup_at
  ) values (
    fresh_job_id, p_uploader_id, p_sighting_id, p_media_id, p_sha256, p_byte_length, p_width, p_height,
    p_recipe_version, p_detector_versions, p_confirmed_at_local,
    'jobs/' || fresh_job_id::text || '.jpg', now() + interval '10 minutes',
    now() + interval '2 hours', now() + interval '10 minutes'
  ) on conflict (uploader_id, media_id) do nothing;

  select * into job
  from private.media_upload_jobs
  where uploader_id = p_uploader_id and media_id = p_media_id
  for update;

  if not found then raise exception 'media_reservation_unavailable' using errcode = 'P0001'; end if;
  if job.sighting_id is distinct from p_sighting_id or job.sha256 is distinct from p_sha256 or
      job.byte_length is distinct from p_byte_length or job.width is distinct from p_width or
      job.height is distinct from p_height or job.recipe_version is distinct from p_recipe_version or
      job.detector_versions is distinct from p_detector_versions or job.confirmed_at_local is distinct from p_confirmed_at_local then
    raise exception 'idempotency_conflict' using errcode = 'P0001';
  end if;

  if job.status = 'finalized' then
    if exists (select 1 from public.media_assets m where m.id = job.media_asset_id and m.deleted_at is null) then
      return query select job.id, job.object_path, job.reservation_expires_at, job.media_asset_id;
      return;
    end if;
    raise exception 'media_deleted' using errcode = 'P0001';
  end if;
  if job.status = 'deletion_pending' then raise exception 'media_deleted' using errcode = 'P0001'; end if;
  if job.cleanup_claimed_at is not null and job.cleanup_claimed_at > now() - interval '5 minutes' then
    raise exception 'media_cleanup_pending' using errcode = 'P0001';
  end if;
  if job.reservation_expires_at <= now() then
    update private.media_upload_jobs
    set reserved_at = now(),
        reservation_expires_at = now() + interval '10 minutes',
        -- Conservatively cover a token that is about to be minted even if the
        -- subsequent recording RPC transiently fails.
        upload_token_expires_at = now() + interval '2 hours',
        next_cleanup_at = now() + interval '10 minutes',
        cleanup_claimed_at = null,
        cleanup_claim_id = null,
        updated_at = now()
    where id = job.id
    returning * into job;
  elsif job.cleanup_claimed_at is not null then
    update private.media_upload_jobs
    set cleanup_claimed_at = null, cleanup_claim_id = null, updated_at = now()
    where id = job.id
    returning * into job;
  end if;

  return query select job.id, job.object_path, job.reservation_expires_at, job.media_asset_id;
end;
$$;

create or replace function public.record_media_upload_token_expiry(
  p_job_id uuid,
  p_uploader_id uuid,
  p_upload_token_expires_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare recorded_expiry timestamptz;
begin
  if p_upload_token_expires_at is null or p_upload_token_expires_at < now() + interval '1 hour 55 minutes' or
      p_upload_token_expires_at > now() + interval '2 hours 5 minutes' then
    raise exception 'invalid_upload_token_expiry' using errcode = '22023';
  end if;
  update private.media_upload_jobs
  set upload_token_expires_at = greatest(coalesce(upload_token_expires_at, p_upload_token_expires_at), p_upload_token_expires_at),
      updated_at = now()
  where id = p_job_id and uploader_id = p_uploader_id and status = 'reserved'
  returning p_upload_token_expires_at into recorded_expiry;
  if not found then raise exception 'media_reservation_unavailable' using errcode = 'P0001'; end if;
  return recorded_expiry;
end;
$$;

create or replace function public.get_media_upload_job_for_finalization(
  p_uploader_id uuid,
  p_sighting_id uuid,
  p_media_id text,
  p_sha256 text
)
returns table (
  job_id uuid,
  object_path text,
  sha256 text,
  byte_length integer,
  width integer,
  height integer,
  recipe_version text,
  detector_versions jsonb,
  confirmed_at_local timestamptz,
  reservation_expires_at timestamptz,
  status text,
  media_asset_id uuid,
  media_deleted_at timestamptz
)
language sql
security definer
set search_path = pg_catalog
as $$
  select j.id, j.object_path, j.sha256, j.byte_length, j.width, j.height,
    j.recipe_version, j.detector_versions, j.confirmed_at_local, j.reservation_expires_at,
    j.status::text, j.media_asset_id, m.deleted_at
  from private.media_upload_jobs j
  left join public.media_assets m on m.id = j.media_asset_id
  where j.uploader_id = p_uploader_id and j.sighting_id = p_sighting_id
    and j.media_id = p_media_id and j.sha256 = p_sha256;
$$;

create or replace function public.finalize_media_upload_job(
  p_job_id uuid,
  p_uploader_id uuid,
  p_sighting_id uuid,
  p_media_id text,
  p_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job private.media_upload_jobs%rowtype;
  existing_asset public.media_assets%rowtype;
  asset_id uuid;
begin
  select * into job from private.media_upload_jobs where id = p_job_id for update;
  if not found or job.uploader_id is distinct from p_uploader_id or job.sighting_id is distinct from p_sighting_id or
      job.media_id is distinct from p_media_id or job.sha256 is distinct from p_sha256 then
    raise exception 'media_not_found_or_forbidden' using errcode = '42501';
  end if;
  if job.status = 'deletion_pending' then raise exception 'media_deleted' using errcode = 'P0001'; end if;
  if job.status = 'finalized' then
    if job.media_asset_id is null or exists (select 1 from public.media_assets m where m.id = job.media_asset_id and m.deleted_at is not null) then
      raise exception 'media_deleted' using errcode = 'P0001';
    end if;
    return job.media_asset_id;
  end if;
  if job.status <> 'reserved' or job.reservation_expires_at <= now() then
    raise exception 'media_reservation_expired' using errcode = 'P0001';
  end if;

  select * into existing_asset
  from public.media_assets
  where uploader_id = p_uploader_id and client_media_id = p_media_id
  for update;
  if found then
    if existing_asset.deleted_at is not null then raise exception 'media_deleted' using errcode = 'P0001'; end if;
    if existing_asset.sighting_id is distinct from p_sighting_id or existing_asset.sha256 is distinct from p_sha256 or
        existing_asset.storage_bucket <> 'media-staging' or existing_asset.storage_path <> job.object_path or
        existing_asset.byte_length is distinct from job.byte_length or existing_asset.width is distinct from job.width or
        existing_asset.height is distinct from job.height or existing_asset.recipe_version is distinct from job.recipe_version or
        existing_asset.detector_versions is distinct from job.detector_versions or existing_asset.status <> 'quarantined' or
        existing_asset.reviewed_at is null then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    asset_id := existing_asset.id;
  else
    insert into public.media_assets (
      sighting_id, uploader_id, storage_bucket, storage_path, sha256,
      redaction_confirmed_at, training_eligible, client_media_id, byte_length,
      width, height, recipe_version, detector_versions, status, reviewed_at
    ) values (
      p_sighting_id, p_uploader_id, 'media-staging', job.object_path, p_sha256,
      now(), false, p_media_id, job.byte_length, job.width, job.height,
      job.recipe_version, job.detector_versions, 'quarantined', now()
    ) returning id into asset_id;
  end if;

  update private.media_upload_jobs
  set status = 'finalized', media_asset_id = asset_id, finalized_at = now(),
      next_cleanup_at = coalesce(upload_token_expires_at, reservation_expires_at) + interval '5 minutes',
      cleanup_claimed_at = null, cleanup_claim_id = null, updated_at = now()
  where id = job.id;
  return asset_id;
end;
$$;

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
        (j.status = 'reserved' and j.reservation_expires_at <= now())
        or j.status = 'deletion_pending'
        or (j.status = 'finalized' and j.media_asset_id is not null)
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
      when c.status = 'finalized' then 'purge_bookkeeping'
      else 'invalid'
    end
  from claimed c;
end;
$$;

create or replace function public.complete_media_staging_cleanup(
  p_job_id uuid,
  p_object_path text,
  p_cleanup_claim_id uuid,
  p_cleanup_action text,
  p_object_removed boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job private.media_upload_jobs%rowtype;
  safe_purge_at timestamptz;
begin
  select * into job from private.media_upload_jobs where id = p_job_id for update;
  if not found or job.object_path is distinct from p_object_path or p_object_path <> 'jobs/' || p_job_id::text || '.jpg' or
      job.cleanup_claim_id is distinct from p_cleanup_claim_id then
    raise exception 'invalid_cleanup_claim' using errcode = 'P0001';
  end if;
  safe_purge_at := coalesce(job.upload_token_expires_at, job.reservation_expires_at) + interval '5 minutes';

  if job.status = 'reserved' then
    if p_cleanup_action = 'remove_and_retry' and p_object_removed and now() < safe_purge_at then
      update private.media_upload_jobs set cleanup_claimed_at = null, cleanup_claim_id = null,
        next_cleanup_at = least(safe_purge_at, now() + interval '5 minutes'), updated_at = now() where id = job.id;
      return;
    end if;
    if p_cleanup_action = 'remove_and_purge' and p_object_removed and now() >= safe_purge_at then
      delete from private.media_upload_jobs where id = job.id;
      return;
    end if;
  elsif job.status = 'deletion_pending' then
    if p_cleanup_action = 'defer_delete' and not p_object_removed and now() < safe_purge_at then
      update private.media_upload_jobs set cleanup_claimed_at = null, cleanup_claim_id = null,
        next_cleanup_at = safe_purge_at, updated_at = now() where id = job.id;
      return;
    end if;
    if p_cleanup_action = 'remove_and_purge' and p_object_removed and now() >= safe_purge_at then
      delete from private.media_upload_jobs where id = job.id;
      return;
    end if;
  elsif job.status = 'finalized' and p_cleanup_action = 'purge_bookkeeping' and not p_object_removed and now() >= safe_purge_at then
    delete from private.media_upload_jobs where id = job.id;
    return;
  end if;
  raise exception 'invalid_cleanup_action' using errcode = 'P0001';
end;
$$;

create or replace function public.server_request_media_deletion(
  p_actor_id uuid,
  p_media_id uuid
)
returns table (storage_bucket text, storage_path text, remove_immediately boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  asset public.media_assets%rowtype;
  job private.media_upload_jobs%rowtype;
begin
  if p_actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into asset
  from public.media_assets m
  where m.id = p_media_id
    and (m.uploader_id = p_actor_id or exists (
      select 1 from public.role_grants r
      where r.user_id = p_actor_id and r.role = 'platform_admin' and r.revoked_at is null
        and (r.provisional_until is null or r.provisional_until > now())
    ))
  for update;
  if not found then raise exception 'media_not_found_or_forbidden' using errcode = '42501'; end if;
  if asset.deleted_at is not null then raise exception 'media_deleted' using errcode = 'P0001'; end if;

  update public.media_assets
  set deleted_at = now(), embedding = null, embedding_model_version = null, training_eligible = false
  where id = asset.id;

  if asset.storage_bucket <> 'media-staging' then
    return query select asset.storage_bucket, asset.storage_path, true;
    return;
  end if;
  select * into job from private.media_upload_jobs
  where media_asset_id = asset.id and status = 'finalized'
  for update;
  if not found then raise exception 'media_deletion_unavailable' using errcode = 'P0001'; end if;
  update private.media_upload_jobs
  set status = 'deletion_pending', next_cleanup_at = greatest(now(), coalesce(upload_token_expires_at, reservation_expires_at) + interval '5 minutes'),
      cleanup_claimed_at = null, cleanup_claim_id = null, updated_at = now()
  where id = job.id;
  return query select asset.storage_bucket, asset.storage_path, false;
end;
$$;

revoke all on function public.request_media_deletion(uuid) from public, anon, authenticated;
revoke all on function public.reserve_media_upload_job(uuid, uuid, text, text, integer, integer, integer, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.record_media_upload_token_expiry(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_media_upload_job_for_finalization(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_media_upload_job(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_expired_media_staging_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_media_staging_cleanup(uuid, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.server_request_media_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_media_upload_job(uuid, uuid, text, text, integer, integer, integer, text, jsonb, timestamptz) to service_role;
grant execute on function public.record_media_upload_token_expiry(uuid, uuid, timestamptz) to service_role;
grant execute on function public.get_media_upload_job_for_finalization(uuid, uuid, text, text) to service_role;
grant execute on function public.finalize_media_upload_job(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.claim_expired_media_staging_jobs(integer) to service_role;
grant execute on function public.complete_media_staging_cleanup(uuid, text, uuid, text, boolean) to service_role;
grant execute on function public.server_request_media_deletion(uuid, uuid) to service_role;

comment on table private.media_upload_jobs is
  'Service-only idempotent staging jobs. Paths stay internal; cleanup retains objects until non-upsert upload tokens cannot replay.';
comment on function public.record_media_upload_token_expiry(uuid, uuid, timestamptz) is
  'Service-only recording of the fixed-duration Storage signed-upload credential lifetime.';

commit;
