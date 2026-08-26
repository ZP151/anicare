create or replace function private.apply_location_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update private.precise_locations
  set
    ciphertext = ''::bytea,
    nonce = ''::bytea,
    key_version = 0,
    coarsened_at = now()
  where coarsened_at is null
    and coarsen_after <= now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.apply_location_retention() from public, anon, authenticated;
grant execute on function private.apply_location_retention() to service_role;

create or replace function private.purge_expired_location_grants()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  delete from private.location_access_grants
  where expires_at < now() - interval '30 days';

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.purge_expired_location_grants() from public, anon, authenticated;
grant execute on function private.purge_expired_location_grants() to service_role;

create or replace function public.request_media_deletion(requested_media_id uuid)
returns table (storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  return query
  update public.media_assets m
  set
    deleted_at = coalesce(m.deleted_at, now()),
    embedding = null,
    embedding_model_version = null,
    training_eligible = false
  where m.id = requested_media_id
    and (
      m.uploader_id = auth.uid()
      or public.has_active_role(array['platform_admin']::public.trust_role[])
    )
  returning m.storage_bucket, m.storage_path;

  if not found then
    raise exception 'media_not_found_or_forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.request_media_deletion(uuid) from public, anon;
grant execute on function public.request_media_deletion(uuid) to authenticated;

comment on function private.apply_location_retention() is
  'Irreversibly destroys encrypted precise-location material after 12 months. Invoke daily from a trusted scheduler.';
comment on function public.request_media_deletion(uuid) is
  'Authorizes owner/admin deletion, tombstones metadata, and clears the AI embedding before object removal.';
