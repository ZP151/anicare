create or replace function public.create_sighting_in_public_cell(
  p_reporter_id uuid,
  p_occurred_at timestamptz,
  p_public_cell_id text,
  p_time_bucket text,
  p_risk public.risk_tier,
  p_visibility public.record_visibility,
  p_visible_at timestamptz,
  p_traits jsonb,
  p_notes text,
  p_client_dedupe_key text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  new_sighting_id uuid;
begin
  if not exists (
    select 1
    from public.user_profiles profile
    where profile.id = p_reporter_id
      and profile.adult_confirmed_at is not null
  ) then
    raise exception 'adult contributor confirmation required';
  end if;

  if p_risk = 'critical' and p_visibility <> 'hidden' then
    raise exception 'critical sightings must remain hidden';
  end if;

  insert into public.sightings (
    reporter_id,
    occurred_at,
    public_cell_id,
    time_bucket,
    risk,
    visibility,
    visible_at,
    traits,
    notes,
    client_dedupe_key
  ) values (
    p_reporter_id,
    p_occurred_at,
    p_public_cell_id,
    p_time_bucket,
    p_risk,
    p_visibility,
    p_visible_at,
    coalesce(p_traits, '{}'::jsonb),
    p_notes,
    p_client_dedupe_key
  ) on conflict (reporter_id, client_dedupe_key) do nothing
  returning id into new_sighting_id;

  if new_sighting_id is null then
    select sighting.id into new_sighting_id
    from public.sightings sighting
    where sighting.reporter_id = p_reporter_id
      and sighting.client_dedupe_key = p_client_dedupe_key;
    return new_sighting_id;
  end if;

  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, request_id
  ) values (
    p_reporter_id, 'create', 'sighting', new_sighting_id, 'community_sighting', p_request_id
  );

  return new_sighting_id;
end;
$$;

revoke all on function public.create_sighting_in_public_cell(
  uuid, timestamptz, text, text, public.risk_tier, public.record_visibility,
  timestamptz, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_sighting_in_public_cell(
  uuid, timestamptz, text, text, public.risk_tier, public.record_visibility,
  timestamptz, jsonb, text, text, text
) to service_role;

comment on function public.create_sighting_in_public_cell(
  uuid, timestamptz, text, text, public.risk_tier, public.record_visibility,
  timestamptz, jsonb, text, text, text
) is 'Service-role-only coarse manual-area sighting creation. It never writes private.precise_locations.';
