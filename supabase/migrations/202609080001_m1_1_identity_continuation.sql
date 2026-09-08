begin;

create or replace function public.get_my_sighting_summary(p_sighting_id uuid)
returns table(
  "sightingId" uuid,
  "occurredAt" timestamptz,
  "createdAt" timestamptz,
  "reportState" text,
  "mediaState" text,
  "identityState" text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
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
      select case when asset.deleted_at is not null then 'removed'
                  when asset.status = 'quarantined' then 'quarantined' end as media_state,
             case when asset.deleted_at is not null then 1 when asset.status = 'quarantined' then 3 end as priority
      from public.media_assets as asset
      where asset.sighting_id = sighting.id and asset.uploader_id = auth.uid()
      union all
      select case upload.status when 'deletion_pending'::private.media_upload_job_status then 'cleanup_pending'
                                when 'finalized'::private.media_upload_job_status then 'quarantined'
                                when 'reserved'::private.media_upload_job_status then 'pending' end,
             case upload.status when 'deletion_pending'::private.media_upload_job_status then 2
                                when 'finalized'::private.media_upload_job_status then 3
                                when 'reserved'::private.media_upload_job_status then 4 end
      from private.media_upload_jobs as upload
      where upload.sighting_id = sighting.id and upload.uploader_id = auth.uid()
    ) as candidate order by candidate.priority limit 1
  ) as media on true
  left join lateral (
    select case proposal.status
      when 'tentative'::public.identity_proposal_status then 'pending_review'
      when 'rejected'::public.identity_proposal_status then 'closed'
      when 'superseded'::public.identity_proposal_status then 'closed'
      when 'confirmed'::public.identity_proposal_status then 'closed'
    end as identity_state
    from public.identity_proposals as proposal
    where proposal.sighting_id = sighting.id
    order by case proposal.status
      when 'tentative'::public.identity_proposal_status then 1
      when 'confirmed'::public.identity_proposal_status then 2
      when 'rejected'::public.identity_proposal_status then 3
      when 'superseded'::public.identity_proposal_status then 3
    end limit 1
  ) as identity on sighting.animal_id is null
  where sighting.id = p_sighting_id and sighting.reporter_id = auth.uid();
$$;

create or replace function public.submit_identity_proposal(
  p_sighting_id uuid, p_proposed_animal_id uuid, p_source text, p_request_id uuid
)
returns table ("proposalId" uuid, "source" text, "status" text)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  sighting_row public.sightings%rowtype;
  prior private.identity_requests%rowtype;
  proposal_row public.identity_proposals%rowtype;
  payload_hash text;
begin
  if v_actor_id is null or not public.is_adult_contributor() then
    raise exception 'adult_contributor_required' using errcode = '42501';
  end if;
  if p_sighting_id is null or p_request_id is null or p_source is null
    or p_source not in ('manual_search', 'new_animal')
    or (p_source = 'manual_search' and p_proposed_animal_id is null)
    or (p_source = 'new_animal' and p_proposed_animal_id is not null) then
    raise exception 'invalid_identity_proposal' using errcode = '22023';
  end if;
  payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'sightingId', p_sighting_id, 'proposedAnimalId', p_proposed_animal_id, 'source', p_source
  )::text, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor_id::text || ':' || p_request_id::text, 0));
  select * into prior from private.identity_requests requests where requests.actor_id = v_actor_id and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'submit' or prior.payload_hash <> payload_hash then raise exception 'idempotency_conflict' using errcode = 'P0001'; end if;
    select * into proposal_row from public.identity_proposals proposals where proposals.id = prior.proposal_id;
    if not found then raise exception 'identity_proposal_outcome_unavailable' using errcode = 'P0001'; end if;
    return query select proposal_row.id, proposal_row.source, proposal_row.status::text;
    return;
  end if;
  select * into sighting_row from public.sightings sightings where sightings.id = p_sighting_id for update;
  if not found or sighting_row.reporter_id is distinct from v_actor_id then raise exception 'identity_sighting_owner_required' using errcode = '42501'; end if;
  if sighting_row.animal_id is not null then raise exception 'identity_sighting_already_linked' using errcode = 'P0001'; end if;
  if exists (select 1 from public.identity_proposals proposals where proposals.sighting_id = p_sighting_id and proposals.status = 'tentative'::public.identity_proposal_status) then
    raise exception 'identity_proposal_already_active' using errcode = 'P0001';
  end if;
  if p_proposed_animal_id is not null and not exists (
    select 1 from public.sightings candidate
    join public.animals animal on animal.id = candidate.animal_id
    where candidate.animal_id = p_proposed_animal_id
      and candidate.visibility = 'public'::public.record_visibility
      and candidate.visible_at is not null and candidate.visible_at <= pg_catalog.now()
      and candidate.risk <> 'critical'::public.risk_tier
      and animal.visibility = 'public'::public.record_visibility and animal.archived_at is null
      and (candidate.reporter_id is null or not exists (
        select 1 from public.user_blocks block where (block.blocker_id = v_actor_id and block.blocked_id = candidate.reporter_id)
          or (block.blocker_id = candidate.reporter_id and block.blocked_id = v_actor_id)
      ))
  ) then raise exception 'identity_animal_not_available' using errcode = 'P0001'; end if;
  insert into public.identity_proposals (sighting_id, proposed_animal_id, proposer_id, source, status, model_version, confidence_band, reasons, reviewed_at)
  values (p_sighting_id, p_proposed_animal_id, v_actor_id, p_source, 'tentative'::public.identity_proposal_status, null, null, '[]'::jsonb, null)
  returning * into proposal_row;
  insert into private.identity_requests (actor_id, request_id, operation, payload_hash, proposal_id)
  values (v_actor_id, p_request_id, 'submit', payload_hash, proposal_row.id);
  insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, request_id)
  values (v_actor_id, 'identity_proposal_submit', 'identity_proposal', proposal_row.id, 'identity_review', p_request_id::text);
  return query select proposal_row.id, proposal_row.source, proposal_row.status::text;
end;
$$;

revoke all on function public.get_my_sighting_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_my_sighting_summary(uuid) to authenticated;
revoke all on function public.submit_identity_proposal(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_identity_proposal(uuid, uuid, text, uuid) to authenticated;

comment on function public.get_my_sighting_summary(uuid) is
  'One owner-bound report receipt summary. Missing and non-owner IDs return no rows; it contains no report content, locations, candidate metadata, or review details.';
comment on function public.submit_identity_proposal(uuid, uuid, text, uuid) is
  'Owner-bound, idempotent tentative identity proposal. Manual targets must remain visible through the delayed public feed at submission time.';

commit;
