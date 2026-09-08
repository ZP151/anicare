begin;

-- Keep the M1.2 interface stable while adding the workbench-only post-lock
-- constraints.  The renamed implementation still obtains the established
-- account, grant, sighting, provenance, proposal, and review locks first.
alter function private.lock_and_validate_identity_proposal(uuid, uuid, boolean)
  rename to lock_and_validate_identity_proposal_m12;

create or replace function private.lock_and_validate_identity_proposal_m12(
  p_proposal_id uuid, p_actor_id uuid, p_allow_confirmed boolean
)
returns table (
  proposal_id uuid, sighting_id uuid, proposed_animal_id uuid, source text,
  status public.identity_proposal_status, has_evidence boolean
)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  proposal_row public.identity_proposals%rowtype;
  sighting_row public.sightings%rowtype;
  evidence_row private.identity_proposal_evidence%rowtype;
  job_row private.identity_assistance_jobs%rowtype;
  media_row public.media_assets%rowtype;
  upload_row private.media_upload_jobs%rowtype;
  animal_creator uuid;
  discovered_sighting_id uuid;
  discovered_proposer_id uuid;
  discovered_proposed_animal_id uuid;
  discovered_reporter_id uuid;
  discovered_evidence_job_id uuid;
  discovered_evidence_media_id uuid;
  discovered_selector_id uuid;
  discovered_rank integer;
  discovered_selected_at timestamptz;
  discovered_job_requester_id uuid;
  discovered_job_media_id uuid;
  discovered_media_uploader_id uuid;
  discovered_animal_creator uuid;
  account_ids uuid[] := '{}'::uuid[];
  account_count bigint;
  upload_count bigint;
begin
  select * into proposal_row from public.identity_proposals where id = p_proposal_id;
  if not found then raise exception 'identity_proposal_not_actionable' using errcode = 'P0001'; end if;
  select * into sighting_row from public.sightings where id = proposal_row.sighting_id;
  if not found then raise exception 'identity_proposal_not_actionable' using errcode = 'P0001'; end if;
  select * into evidence_row from private.identity_proposal_evidence as evidence where evidence.proposal_id = proposal_row.id;
  has_evidence := found;
  if has_evidence then
    select * into job_row from private.identity_assistance_jobs where id = evidence_row.job_id;
    select * into media_row from public.media_assets where id = evidence_row.media_asset_id;
  end if;
  if proposal_row.proposed_animal_id is not null then
    select profile_created_by into animal_creator from public.animals where id = proposal_row.proposed_animal_id;
  end if;
  discovered_sighting_id := proposal_row.sighting_id;
  discovered_proposer_id := proposal_row.proposer_id;
  discovered_proposed_animal_id := proposal_row.proposed_animal_id;
  discovered_reporter_id := sighting_row.reporter_id;
  discovered_animal_creator := animal_creator;
  if has_evidence then
    discovered_evidence_job_id := evidence_row.job_id;
    discovered_evidence_media_id := evidence_row.media_asset_id;
    discovered_selector_id := evidence_row.selector_id;
    discovered_rank := evidence_row.selected_candidate_rank;
    discovered_selected_at := evidence_row.selected_at;
    discovered_job_requester_id := job_row.requester_id;
    discovered_job_media_id := job_row.media_asset_id;
    discovered_media_uploader_id := media_row.uploader_id;
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into account_ids from (
    select distinct id from unnest(array[p_actor_id, sighting_row.reporter_id, proposal_row.proposer_id,
      evidence_row.selector_id, job_row.requester_id, media_row.uploader_id, animal_creator]::uuid[]) as ids(id)
      where id is not null
  ) accounts;
  perform 1 from public.user_profiles where id = any(account_ids) order by id for update;
  perform 1 from public.role_grants where user_id = p_actor_id order by id for update;
  perform 1 from public.sightings where id = sighting_row.id for update;
  if has_evidence then
    perform 1 from private.media_upload_jobs where media_asset_id = evidence_row.media_asset_id order by id for update;
    perform 1 from public.media_assets where id = evidence_row.media_asset_id for update;
  end if;
  if not has_evidence then
    -- Manual material belongs to the already-locked reporter account. Lock all
    -- its source uploads/assets before the animal and proposal, like erasure.
    perform 1 from private.media_upload_jobs uploads
      join public.media_assets media on media.id = uploads.media_asset_id
      where media.sighting_id = sighting_row.id and media.uploader_id = sighting_row.reporter_id
      order by uploads.id for update of uploads;
    perform 1 from public.media_assets media
      where media.sighting_id = sighting_row.id and media.uploader_id = sighting_row.reporter_id
      order by media.id for update;
  end if;
  if proposal_row.proposed_animal_id is not null then
    perform 1 from public.animals where id = proposal_row.proposed_animal_id for update;
  end if;
  if has_evidence then perform 1 from private.identity_assistance_jobs where id = evidence_row.job_id for update; end if;
  perform 1 from public.identity_proposals where id = proposal_row.id for update;
  if has_evidence then perform 1 from private.identity_proposal_evidence as evidence where evidence.proposal_id = proposal_row.id for update; end if;
  perform 1 from public.match_reviews as reviews where reviews.proposal_id = proposal_row.id order by reviews.id for update;
  -- Re-read every mutable provenance row only after the full lock sequence.
  if has_evidence then
    select * into evidence_row from private.identity_proposal_evidence as evidence where evidence.proposal_id = proposal_row.id;
    select * into job_row from private.identity_assistance_jobs as jobs where jobs.id = evidence_row.job_id;
    select * into media_row from public.media_assets as media where media.id = evidence_row.media_asset_id;
    select count(*) into upload_count from private.media_upload_jobs as uploads where uploads.media_asset_id = evidence_row.media_asset_id;
    select * into upload_row from private.media_upload_jobs as uploads where uploads.media_asset_id = evidence_row.media_asset_id order by uploads.id limit 1;
  end if;
  if p_actor_id is null or not exists (select 1 from public.user_profiles where id = p_actor_id)
     or not exists (
       select 1 from public.role_grants where user_id = p_actor_id
        and role = any(array['trusted_contributor','area_steward','platform_admin']::public.trust_role[])
        and revoked_at is null and (provisional_until is null or provisional_until > pg_catalog.now())
     ) then raise exception 'trusted_identity_reviewer_required' using errcode = '42501'; end if;
  select count(*) into account_count from public.user_profiles where id = any(account_ids);
  if account_count <> cardinality(account_ids) then raise exception 'identity_proposal_not_actionable' using errcode = 'P0001'; end if;
  select * into proposal_row from public.identity_proposals where id = proposal_row.id;
  select * into sighting_row from public.sightings where id = sighting_row.id;
  if proposal_row.id is null or proposal_row.sighting_id is distinct from discovered_sighting_id
     or proposal_row.proposer_id is distinct from discovered_proposer_id
     or proposal_row.proposed_animal_id is distinct from discovered_proposed_animal_id
     or sighting_row.id is null or sighting_row.reporter_id is distinct from discovered_reporter_id
     or (has_evidence and (
       evidence_row.job_id is distinct from discovered_evidence_job_id
       or evidence_row.media_asset_id is distinct from discovered_evidence_media_id
       or evidence_row.selector_id is distinct from discovered_selector_id
       or evidence_row.selected_candidate_rank is distinct from discovered_rank
       or evidence_row.selected_at is distinct from discovered_selected_at
       or job_row.requester_id is distinct from discovered_job_requester_id
       or job_row.media_asset_id is distinct from discovered_job_media_id
       or media_row.uploader_id is distinct from discovered_media_uploader_id
     )) or sighting_row.reporter_id is null or proposal_row.proposer_id is null
     or proposal_row.status <> 'tentative'::public.identity_proposal_status
     and not (p_allow_confirmed and proposal_row.status = 'confirmed'::public.identity_proposal_status)
     or sighting_row.animal_id is not null and not exists (
       select 1 from private.identity_profile_completions as completions where completions.proposal_id = proposal_row.id
     ) and not (p_allow_confirmed and proposal_row.status = 'confirmed'::public.identity_proposal_status) then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  end if;
  if discovered_proposed_animal_id is not null then
    select profile_created_by into animal_creator from public.animals
      where id = discovered_proposed_animal_id and archived_at is null
        and visibility <> 'hidden'::public.record_visibility;
    if not found or animal_creator is distinct from discovered_animal_creator then
      raise exception 'identity_animal_not_available' using errcode = 'P0001';
    end if;
  end if;
  if proposal_row.source <> 'new_animal' and proposal_row.proposed_animal_id is null then
    raise exception 'identity_animal_not_available' using errcode = 'P0001';
  end if;
  if p_actor_id = proposal_row.proposer_id or p_actor_id = sighting_row.reporter_id
     or p_actor_id = animal_creator or (has_evidence and p_actor_id = evidence_row.selector_id) then
    raise exception 'identity_reviewer_recusal_required' using errcode = '42501';
  end if;
  if has_evidence then
    if job_row.id is null or media_row.id is null or evidence_row.media_asset_id is null
       or evidence_row.proposal_id is distinct from proposal_row.id
       or evidence_row.job_id is distinct from job_row.id
       or evidence_row.selector_id is null
       or job_row.sighting_id is distinct from proposal_row.sighting_id
       or job_row.media_asset_id is distinct from media_row.id
       or job_row.status <> 'succeeded'::private.identity_assistance_job_status
       or job_row.selected_at is null or job_row.completed_at is null
       or job_row.model_version is null or job_row.callback_contract_version is null
       or job_row.input_sha256 is null or job_row.withdrawn_at is not null or job_row.result_invalidated_at is not null
       or media_row.sighting_id is distinct from proposal_row.sighting_id
       or media_row.deleted_at is not null or media_row.storage_bucket <> 'media-staging'
       or media_row.status <> 'quarantined' or media_row.reviewed_at is null
       or upload_count <> 1 or upload_row.status <> 'finalized'::private.media_upload_job_status or upload_row.finalized_at is null
       or upload_row.media_asset_id is distinct from media_row.id
       or upload_row.sighting_id is distinct from media_row.sighting_id
       or upload_row.uploader_id is distinct from media_row.uploader_id
       or upload_row.object_path is distinct from media_row.storage_path
       or upload_row.media_id is distinct from media_row.client_media_id
       or upload_row.sha256 is distinct from media_row.sha256
       or upload_row.sha256 is distinct from job_row.input_sha256
       or upload_row.recipe_version is distinct from media_row.recipe_version
       or upload_row.recipe_version is distinct from job_row.recipe_version
       or upload_row.byte_length is distinct from media_row.byte_length
       or upload_row.width is distinct from media_row.width
       or upload_row.height is distinct from media_row.height
       or upload_row.detector_versions is distinct from media_row.detector_versions
       or evidence_row.recipe_version is distinct from job_row.recipe_version
       or evidence_row.recipe_version is distinct from media_row.recipe_version
       or evidence_row.model_version is distinct from job_row.model_version
       or evidence_row.selected_at is distinct from job_row.selected_at
       or evidence_row.crop_contract_version is distinct from job_row.crop_contract_version
       or evidence_row.embedding_contract_version is distinct from job_row.embedding_contract_version
       or evidence_row.identify_contract_version is distinct from job_row.identify_contract_version
       or evidence_row.callback_contract_version is distinct from job_row.callback_contract_version
       or proposal_row.source not in ('ai_candidate', 'new_animal')
       or (proposal_row.source = 'new_animal' and (
         proposal_row.proposed_animal_id is not null or evidence_row.selected_candidate_rank is not null
       ))
       or (proposal_row.source = 'ai_candidate' and (
         proposal_row.proposed_animal_id is null or evidence_row.selected_candidate_rank is null
         or not exists (select 1 from private.identity_assistance_candidates as candidates
           where candidates.job_id = job_row.id and candidates.rank = evidence_row.selected_candidate_rank
             and candidates.animal_id = proposal_row.proposed_animal_id)
       )) then
      raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
    end if;
  end if;
  return query select proposal_row.id, sighting_row.id, proposal_row.proposed_animal_id,
    proposal_row.source, proposal_row.status, has_evidence;
end;
$$;

create function private.lock_and_validate_identity_proposal(
  p_proposal_id uuid, p_actor_id uuid, p_allow_confirmed boolean
)
returns table (
  proposal_id uuid, sighting_id uuid, proposed_animal_id uuid, source text,
  status public.identity_proposal_status, has_evidence boolean
)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  context_row record;
  sighting_row public.sightings%rowtype;
  animal_row public.animals%rowtype;
  active_scope boolean;
begin
  select * into context_row
    from private.lock_and_validate_identity_proposal_m12(p_proposal_id, p_actor_id, p_allow_confirmed);

  select * into sighting_row from public.sightings where id = context_row.sighting_id for update;
  if not found then raise exception 'identity_proposal_not_actionable' using errcode = 'P0001'; end if;
  select exists(
    select 1 from public.role_grants grants
    where grants.user_id = p_actor_id
      and grants.role = any(array['trusted_contributor','area_steward','platform_admin']::public.trust_role[])
      and grants.revoked_at is null
      and (grants.provisional_until is null or grants.provisional_until > pg_catalog.now())
      and (grants.area_cell_id is null or grants.area_cell_id = sighting_row.public_cell_id)
  ) into active_scope;
  if not active_scope then raise exception 'identity_reviewer_area_required' using errcode = '42501'; end if;

  if context_row.proposed_animal_id is not null then
    select * into animal_row from public.animals
      where id = context_row.proposed_animal_id
        and archived_at is null
        and visibility <> 'hidden'::public.record_visibility
      for update;
    if not found then raise exception 'identity_animal_not_available' using errcode = 'P0001'; end if;
    if p_actor_id = animal_row.profile_created_by then
      raise exception 'identity_reviewer_recusal_required' using errcode = '42501';
    end if;
  elsif context_row.source <> 'new_animal' then
    raise exception 'identity_animal_not_available' using errcode = 'P0001';
  end if;

  return query select context_row.proposal_id, context_row.sighting_id,
    context_row.proposed_animal_id, context_row.source, context_row.status,
    context_row.has_evidence;
end;
$$;

-- The original mutation has the proven idempotency and terminal replay
-- behavior.  Its public entry point becomes a lock-preserving scope gate.
alter function public.review_identity_proposal(uuid, text, text, uuid)
  set schema private;
alter function private.review_identity_proposal(uuid, text, text, uuid)
  rename to review_identity_proposal_legacy;

create function public.review_identity_proposal(
  p_proposal_id uuid, p_decision text, p_rationale text, p_request_id uuid
)
returns table ("proposalId" uuid, "decision" text, "status" text, "animalId" uuid)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  sighting_cell text;
  in_scope boolean;
  outcome_row record;
begin
  -- Preserve the proven legacy lock order, request replay, and terminal
  -- outcome behavior. A scope failure below rolls the delegated mutation back.
  select * into outcome_row from private.review_identity_proposal_legacy(
    p_proposal_id, p_decision, p_rationale, p_request_id
  );
  select sightings.public_cell_id into sighting_cell
    from public.identity_proposals proposals
    join public.sightings sightings on sightings.id = proposals.sighting_id
    where proposals.id = p_proposal_id
    for update of proposals, sightings;
  if not found then raise exception 'identity_proposal_not_actionable' using errcode = 'P0001'; end if;
  perform 1 from public.role_grants where user_id = v_actor_id order by id for update;
  select exists(
    select 1 from public.role_grants grants
    where grants.user_id = v_actor_id
      and grants.role = any(array['trusted_contributor','area_steward','platform_admin']::public.trust_role[])
      and grants.revoked_at is null
      and (grants.provisional_until is null or grants.provisional_until > pg_catalog.now())
      and (grants.area_cell_id is null or grants.area_cell_id = sighting_cell)
  ) into in_scope;
  if not in_scope then raise exception 'identity_reviewer_area_required' using errcode = '42501'; end if;
  return query select outcome_row."proposalId", outcome_row.decision, outcome_row.status, outcome_row."animalId";
end;
$$;

create function private.identity_reviewer_can_access(
  p_actor_id uuid, p_proposal_id uuid
)
returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select p_actor_id is not null and exists (
    select 1
    from public.identity_proposals proposals
    join public.sightings sightings on sightings.id = proposals.sighting_id
    left join public.animals animals on animals.id = proposals.proposed_animal_id
    left join private.identity_proposal_evidence evidence on evidence.proposal_id = proposals.id
    where proposals.id = p_proposal_id
      and proposals.status = 'tentative'::public.identity_proposal_status
      and exists (
        select 1 from public.role_grants grants
        where grants.user_id = p_actor_id
          and grants.role = any(array['trusted_contributor','area_steward','platform_admin']::public.trust_role[])
          and grants.revoked_at is null
          and (grants.provisional_until is null or grants.provisional_until > pg_catalog.now())
          and (grants.area_cell_id is null or grants.area_cell_id = sightings.public_cell_id)
      )
      and p_actor_id is distinct from proposals.proposer_id
      and p_actor_id is distinct from sightings.reporter_id
      and p_actor_id is distinct from animals.profile_created_by
      and p_actor_id is distinct from evidence.selector_id
  );
$$;

create function public.identity_has_active_reviewer()
returns boolean
language sql stable security definer set search_path = pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_profiles profiles
    join public.role_grants grants on grants.user_id = profiles.id
    where profiles.id = auth.uid()
      and grants.role = any(array['trusted_contributor','area_steward','platform_admin']::public.trust_role[])
      and grants.revoked_at is null
      and (grants.provisional_until is null or grants.provisional_until > pg_catalog.now())
  );
$$;

create function public.list_identity_review_queue(
  p_limit integer, p_before_created_at timestamptz, p_before_proposal_id uuid, p_request_id uuid
)
returns table ("proposalId" uuid, source text, status text, "createdAt" timestamptz)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  capped_limit integer;
begin
  if v_actor_id is null or p_request_id is null or p_limit is null or p_limit not between 1 and 20 then
    raise exception 'invalid_identity_review_request' using errcode = '22023';
  end if;
  if (p_before_created_at is null) <> (p_before_proposal_id is null) then
    raise exception 'invalid_identity_review_request' using errcode = '22023';
  end if;
  capped_limit := p_limit;
  if not public.identity_has_active_reviewer() then
    raise exception 'trusted_identity_reviewer_required' using errcode = '42501';
  end if;
  insert into audit.access_audit(actor_id, action, resource_type, purpose, request_id)
    values (v_actor_id, 'identity_review_queue_read', 'identity_review_queue', 'identity_review', p_request_id::text);
  return query
    select proposals.id, proposals.source, proposals.status::text, proposals.created_at
    from public.identity_proposals proposals
    where private.identity_reviewer_can_access(v_actor_id, proposals.id)
      and (p_before_created_at is null or (proposals.created_at, proposals.id) < (p_before_created_at, p_before_proposal_id))
    order by proposals.created_at desc, proposals.id desc
    limit capped_limit;
end;
$$;

create function private.lock_and_get_identity_review_material(
  p_proposal_id uuid, p_actor_id uuid, p_allow_confirmed boolean default false
)
returns table (
  proposal_id uuid, sighting_id uuid, source text, has_evidence boolean,
  storage_bucket text, storage_path text, byte_length integer
)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  context_row record;
  media_row public.media_assets%rowtype;
  sighting_owner uuid;
begin
  select * into context_row from private.lock_and_validate_identity_proposal(p_proposal_id, p_actor_id, p_allow_confirmed);
  select reporter_id into sighting_owner from public.sightings where id = context_row.sighting_id for update;
  if context_row.has_evidence then
    -- M1.2 validated and locked the full AI provenance chain. Re-read the
    -- bound asset only after that lock sequence, never by a client path.
    select media.* into media_row
      from private.identity_proposal_evidence evidence
      join public.media_assets media on media.id = evidence.media_asset_id
      where evidence.proposal_id = context_row.proposal_id
      for update of media;
  else
    -- The sighting lock above prevents a late FK-backed upload from appearing.
    -- Select and lock only a fully bound, finalized owner asset.
    select media.* into media_row
      from public.media_assets media
      join private.media_upload_jobs uploads on uploads.media_asset_id = media.id
      where media.sighting_id = context_row.sighting_id
        and media.uploader_id = sighting_owner
        and media.deleted_at is null and media.storage_bucket = 'media-staging'
        and media.status = 'quarantined' and media.reviewed_at is not null and media.byte_length between 1 and 20971520
        and uploads.status = 'finalized'::private.media_upload_job_status
        and uploads.finalized_at is not null
        and uploads.sighting_id = media.sighting_id
        and uploads.uploader_id = media.uploader_id
        and uploads.object_path = media.storage_path
        and uploads.media_id = media.client_media_id
        and uploads.sha256 = media.sha256
        and uploads.recipe_version = media.recipe_version
        and uploads.byte_length = media.byte_length
        and uploads.width = media.width and uploads.height = media.height
        and uploads.detector_versions is not distinct from media.detector_versions
        and 1 = (select count(*) from private.media_upload_jobs all_uploads where all_uploads.media_asset_id = media.id)
      order by media.created_at desc, media.id desc limit 1
      for update of media;
  end if;
  if media_row.id is null or media_row.deleted_at is not null or media_row.storage_bucket <> 'media-staging'
     or media_row.status <> 'quarantined' or media_row.byte_length not between 1 and 20971520 then
    return query select context_row.proposal_id, context_row.sighting_id, context_row.source,
      context_row.has_evidence, null::text, null::text, null::integer;
    return;
  end if;
  return query select context_row.proposal_id, context_row.sighting_id, context_row.source,
    context_row.has_evidence, media_row.storage_bucket, media_row.storage_path, media_row.byte_length;
end;
$$;

-- Only this ledger proves that a prior workbench confirmation checked material.
-- A legacy confirmation request alone must never bypass that first check.
create table private.identity_workbench_requests (
  actor_id uuid not null references public.user_profiles(id) on delete cascade,
  request_id uuid not null,
  proposal_id uuid not null references public.identity_proposals(id) on delete cascade,
  payload_hash text not null,
  primary key (actor_id, request_id)
);
alter table private.identity_workbench_requests enable row level security;
revoke all on private.identity_workbench_requests from public, anon, authenticated, service_role;

create function public.decide_identity_review_workbench(
  p_proposal_id uuid, p_decision text, p_rationale text, p_primary_alias text, p_request_id uuid
)
returns table ("proposalId" uuid, "decision" text, status text, "animalId" uuid)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  material_row record;
  review_row record;
  completion_row record;
  prior private.identity_workbench_requests%rowtype;
  v_source text;
  v_hash text;
begin
  if v_actor_id is null or p_proposal_id is null or p_request_id is null
     or p_decision is null or p_decision not in ('confirm','reject','needs_more_evidence')
     or (p_decision <> 'confirm' and p_primary_alias is not null) then
    raise exception 'invalid_identity_review' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text || ':' || p_request_id::text, 0));
  if p_decision <> 'confirm' then
    return query select * from public.review_identity_proposal(p_proposal_id,p_decision,p_rationale,p_request_id);
    return;
  end if;
  v_hash := encode(extensions.digest(jsonb_build_object('proposal',p_proposal_id,
    'alias',btrim(p_primary_alias),'rationale',btrim(p_rationale))::text,'sha256'),'hex');
  select * into prior from private.identity_workbench_requests requests
    where requests.actor_id=v_actor_id and requests.request_id=p_request_id;
  if found then
    if prior.proposal_id <> p_proposal_id or prior.payload_hash <> v_hash then
      raise exception 'idempotency_conflict' using errcode='P0001';
    end if;
    select proposals.source into v_source from public.identity_proposals proposals where proposals.id=p_proposal_id;
  else
    select * into material_row from private.lock_and_get_identity_review_material(p_proposal_id,v_actor_id,true);
    if material_row.storage_bucket is null then
      raise exception 'identity_review_material_required' using errcode='P0001';
    end if;
    v_source := material_row.source;
  end if;
  -- Both delegates revalidate the actor and role under the established locks,
  -- including replay. New workbench outcomes are recorded only after success.
  if v_source = 'new_animal' then
    select * into completion_row from public.confirm_new_animal_identity(p_proposal_id,p_primary_alias,p_rationale,p_request_id);
    return query select completion_row."proposalId",'confirm'::text,completion_row.status,completion_row."animalId";
  else
    if p_primary_alias is not null then raise exception 'invalid_identity_review' using errcode='22023'; end if;
    select * into review_row from public.review_identity_proposal(p_proposal_id,'confirm',p_rationale,p_request_id);
    return query select review_row."proposalId",review_row.decision,review_row.status,review_row."animalId";
  end if;
  insert into private.identity_workbench_requests(actor_id,request_id,proposal_id,payload_hash)
    values(v_actor_id,p_request_id,p_proposal_id,v_hash) on conflict do nothing;
end;
$$;

create function public.get_identity_review_detail(p_proposal_id uuid, p_request_id uuid)
returns table (
  "proposalId" uuid, source text, status text, "createdAt" timestamptz,
  "proposedAlias" text, "timeBucket" text, "evidenceState" text
)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  material_row record;
begin
  if v_actor_id is null or p_proposal_id is null or p_request_id is null then
    raise exception 'invalid_identity_review_request' using errcode = '22023';
  end if;
  if not private.identity_reviewer_can_access(v_actor_id, p_proposal_id) then return; end if;
  begin
    select * into material_row from private.lock_and_get_identity_review_material(p_proposal_id, v_actor_id);
  exception when others then
    return;
  end;
  insert into audit.access_audit(actor_id, action, resource_type, resource_id, purpose, request_id)
    values (v_actor_id, 'identity_review_detail_read', 'identity_proposal', p_proposal_id, 'identity_review', p_request_id::text);
  return query
    select proposals.id, proposals.source, proposals.status::text, proposals.created_at,
      animals.primary_alias, sightings.time_bucket,
      case when material_row.storage_bucket is null then 'unavailable' else 'available' end
    from public.identity_proposals proposals
    join public.sightings sightings on sightings.id = proposals.sighting_id
    left join public.animals animals on animals.id = proposals.proposed_animal_id
    left join private.identity_proposal_evidence evidence on evidence.proposal_id = proposals.id
    where proposals.id = p_proposal_id;
end;
$$;

create function public.get_my_identity_result(p_sighting_id uuid)
returns table ("proposalId" uuid, status text, decision text, "animalId" uuid, "requestId" uuid)
language sql stable security definer set search_path = pg_catalog
as $$
  select proposals.id, proposals.status::text, reviews.decision,
    case when proposals.status = 'confirmed'::public.identity_proposal_status
           and animals.id is not null and animals.archived_at is null
           and animals.visibility = 'public'::public.record_visibility
           and sightings.animal_id = animals.id then animals.id else null end, submission.request_id
  from public.sightings sightings
  join public.identity_proposals proposals on proposals.sighting_id = sightings.id
  left join lateral (
    select match_reviews.decision from public.match_reviews
    where match_reviews.proposal_id = proposals.id
    order by match_reviews.created_at desc, match_reviews.id desc limit 1
  ) reviews on true
  left join public.animals animals on animals.id = sightings.animal_id
  left join lateral (
    select requests.request_id from private.identity_requests requests
    where requests.actor_id = sightings.reporter_id and requests.proposal_id = proposals.id
      and requests.operation = 'submit'
    order by requests.created_at, requests.request_id limit 1
  ) submission on true
  where sightings.id = p_sighting_id and sightings.reporter_id = auth.uid()
  order by proposals.created_at desc, proposals.id desc
  limit 1;
$$;

create function public.service_get_identity_review_media(
  p_actor_id uuid, p_proposal_id uuid, p_request_id uuid
)
returns table ("storageBucket" text, "storagePath" text, "byteLength" integer)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  material_row record;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_actor_id is null or p_proposal_id is null or p_request_id is null then
    raise exception 'invalid_identity_review_request' using errcode = '22023';
  end if;
  select * into material_row from private.lock_and_get_identity_review_material(p_proposal_id, p_actor_id);
  if material_row.storage_bucket is null then return; end if;
  insert into audit.access_audit(actor_id, action, resource_type, resource_id, purpose, request_id)
    values (p_actor_id, 'identity_review_media_read', 'identity_proposal', p_proposal_id, 'identity_review', p_request_id::text);
  return query select material_row.storage_bucket, material_row.storage_path, material_row.byte_length;
end;
$$;

revoke all on function private.lock_and_validate_identity_proposal_m12(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_and_validate_identity_proposal(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.review_identity_proposal_legacy(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.identity_reviewer_can_access(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_and_get_identity_review_material(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.decide_identity_review_workbench(uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.identity_has_active_reviewer() from public, anon, authenticated, service_role;
revoke all on function public.list_identity_review_queue(integer, timestamptz, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_identity_review_detail(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_my_identity_result(uuid) from public, anon, authenticated, service_role;
revoke all on function public.service_get_identity_review_media(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.review_identity_proposal(uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.identity_has_active_reviewer() to authenticated;
grant execute on function public.list_identity_review_queue(integer, timestamptz, uuid, uuid) to authenticated;
grant execute on function public.get_identity_review_detail(uuid, uuid) to authenticated;
grant execute on function public.get_my_identity_result(uuid) to authenticated;
grant execute on function public.review_identity_proposal(uuid, text, text, uuid) to authenticated;
grant execute on function public.decide_identity_review_workbench(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.service_get_identity_review_media(uuid, uuid, uuid) to service_role;

commit;
