create or replace function public.get_media_finalization_preflight(
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
  select
    j.id,
    j.object_path,
    j.sha256,
    j.byte_length,
    j.width,
    j.height,
    j.recipe_version,
    j.detector_versions,
    j.confirmed_at_local,
    j.reservation_expires_at,
    j.status::text,
    j.media_asset_id,
    m.deleted_at
  from private.media_upload_jobs j
  join public.user_profiles p
    on p.id = p_uploader_id
    and p.adult_confirmed_at is not null
  join public.sightings s
    on s.id = p_sighting_id
    and s.reporter_id = p_uploader_id
  left join public.media_assets m
    on m.id = j.media_asset_id
  where p_uploader_id is not null
    and j.uploader_id = p_uploader_id
    and j.sighting_id = p_sighting_id
    and j.media_id = p_media_id
    and j.sha256 = p_sha256;
$$;

revoke all on function public.get_media_finalization_preflight(uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.get_media_finalization_preflight(uuid, uuid, text, text)
to service_role;
