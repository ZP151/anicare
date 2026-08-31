create index if not exists sightings_reporter_created_idx
  on public.sightings (reporter_id, created_at desc, id desc);

create index if not exists media_assets_sighting_status_idx
  on public.media_assets (sighting_id, uploader_id, deleted_at);

create index if not exists identity_proposals_sighting_status_idx
  on public.identity_proposals (sighting_id, status);

revoke all on table public.identity_proposals from public, anon, authenticated;

create or replace function public.list_my_sighting_summaries(
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_sighting_id uuid default null
)
returns table(
  "sightingId" uuid,
  "occurredAt" timestamptz,
  "createdAt" timestamptz,
  "reportState" text,
  "mediaState" text,
  "identityState" text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  effective_limit integer;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if (p_before_created_at is null) <> (p_before_sighting_id is null) then
    raise exception 'invalid_my_reports_cursor' using errcode = 'P0001';
  end if;

  effective_limit := greatest(1, least(50, coalesce(p_limit, 50)));

  return query
  select
    sighting.id as "sightingId",
    sighting.occurred_at as "occurredAt",
    sighting.created_at as "createdAt",
    case sighting.visibility
      when 'hidden'::public.record_visibility then 'private_review'
      when 'limited'::public.record_visibility then 'delayed'
      when 'public'::public.record_visibility then 'published'
      when 'archived'::public.record_visibility then 'archived'
    end as "reportState",
    coalesce(media.media_state, 'none') as "mediaState",
    case
      when sighting.animal_id is not null then 'linked'
      else coalesce(identity.identity_state, 'not_requested')
    end as "identityState"
  from public.sightings as sighting
  left join lateral (
    select candidate.media_state
    from (
      select
        case
          when asset.deleted_at is not null then 'removed'
          when asset.status = 'quarantined' then 'quarantined'
        end as media_state,
        case
          when asset.deleted_at is not null then 1
          when asset.status = 'quarantined' then 3
        end as priority
      from public.media_assets as asset
      where asset.sighting_id = sighting.id
        and asset.uploader_id = actor_id

      union all

      select
        case upload.status
          when 'deletion_pending'::private.media_upload_job_status then 'cleanup_pending'
          when 'finalized'::private.media_upload_job_status then 'quarantined'
          when 'reserved'::private.media_upload_job_status then 'pending'
        end as media_state,
        case upload.status
          when 'deletion_pending'::private.media_upload_job_status then 2
          when 'finalized'::private.media_upload_job_status then 3
          when 'reserved'::private.media_upload_job_status then 4
        end as priority
      from private.media_upload_jobs as upload
      where upload.sighting_id = sighting.id
        and upload.uploader_id = actor_id
    ) as candidate
    order by candidate.priority
    limit 1
  ) as media on true
  left join lateral (
    select case proposal.status
      when 'tentative'::public.identity_proposal_status then 'pending_review'
      when 'rejected'::public.identity_proposal_status then 'closed'
      when 'superseded'::public.identity_proposal_status then 'closed'
    end as identity_state
    from public.identity_proposals as proposal
    where proposal.sighting_id = sighting.id
      and proposal.status in (
        'tentative'::public.identity_proposal_status,
        'rejected'::public.identity_proposal_status,
        'superseded'::public.identity_proposal_status
      )
    order by case proposal.status
      when 'tentative'::public.identity_proposal_status then 1
      when 'rejected'::public.identity_proposal_status then 2
      when 'superseded'::public.identity_proposal_status then 2
    end
    limit 1
  ) as identity on sighting.animal_id is null
  where sighting.reporter_id = actor_id
    and (
      p_before_created_at is null
      or (sighting.created_at, sighting.id) < (p_before_created_at, p_before_sighting_id)
    )
  order by sighting.created_at desc, sighting.id desc
  limit effective_limit;
end;
$$;

revoke all on function public.list_my_sighting_summaries(integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.list_my_sighting_summaries(integer, timestamptz, uuid)
  to authenticated;

comment on function public.list_my_sighting_summaries(integer, timestamptz, uuid) is
  'Authenticated owner-only coarse report states. Deliberately excludes report content, locations, reporter data, review data, and AI metadata.';
