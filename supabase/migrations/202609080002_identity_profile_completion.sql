begin;

create table private.identity_profile_completions (
  proposal_id uuid primary key references public.identity_proposals(id) on delete cascade,
  animal_id uuid references public.animals(id) on delete set null,
  confirmed_by uuid references public.user_profiles(id) on delete set null,
  confirmation_source text not null check (confirmation_source = 'independent_identity_review'),
  created_at timestamptz not null default pg_catalog.now(),
  unique (animal_id)
);

create table private.identity_profile_completion_requests (
  actor_id uuid not null references public.user_profiles(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  proposal_id uuid not null references public.identity_proposals(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (actor_id, request_id)
);

alter table private.identity_profile_completions enable row level security;
alter table private.identity_profile_completion_requests enable row level security;
revoke all on table private.identity_profile_completions from public, anon, authenticated, service_role;
revoke all on table private.identity_profile_completion_requests from public, anon, authenticated, service_role;

-- A non-mutating, default-deny bridge for future material/detail flows.  The
-- public legacy reviewer keeps its own replay ordering; callers use this only
-- when no legacy request replay is being interpreted.
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

create function public.confirm_new_animal_identity(
  p_proposal_id uuid, p_primary_alias text, p_rationale text, p_request_id uuid
)
returns table ("proposalId" uuid, status text, "animalId" uuid)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  alias_text text := pg_catalog.btrim(p_primary_alias);
  rationale_text text := pg_catalog.btrim(p_rationale);
  payload_hash text;
  request_row private.identity_profile_completion_requests%rowtype;
  context_row record;
  review_row record;
  completion_row private.identity_profile_completions%rowtype;
  animal_row public.animals%rowtype;
  prior_error text;
begin
  if p_proposal_id is null or p_request_id is null or alias_text is null
     or char_length(alias_text) not between 1 and 80
     or not private.identity_rationale_is_safe(rationale_text) then
    raise exception 'invalid_new_animal_profile' using errcode = '22023';
  end if;
  payload_hash := encode(extensions.digest(jsonb_build_object(
    'proposalId', p_proposal_id, 'primaryAlias', alias_text, 'rationale', rationale_text
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_actor_id::text, '') || ':' || p_request_id::text, 0));
  -- First obtain the proven final review behavior for tentative proposals.
  begin
    select * into review_row from public.review_identity_proposal(
      p_proposal_id, 'confirm', rationale_text, p_request_id
    );
  exception when others then
    prior_error := sqlerrm;
    if prior_error not like '%identity_proposal_not_actionable%' then raise; end if;
  end;
  select * into context_row from private.lock_and_validate_identity_proposal(p_proposal_id, v_actor_id, true);
  if context_row.source <> 'new_animal' then raise exception 'identity_proposal_not_actionable' using errcode = 'P0001'; end if;
  select * into request_row from private.identity_profile_completion_requests as requests
    where requests.actor_id = v_actor_id and requests.request_id = p_request_id;
  if found then
    if request_row.payload_hash <> payload_hash or request_row.proposal_id <> p_proposal_id then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
  select * into completion_row from private.identity_profile_completions where proposal_id = p_proposal_id;
    if not found then raise exception 'identity_profile_outcome_unavailable' using errcode = 'P0001'; end if;
    if completion_row.animal_id is null then raise exception 'identity_profile_outcome_unavailable' using errcode = 'P0001'; end if;
    return query select p_proposal_id, 'confirmed', completion_row.animal_id; return;
  end if;
  select * into completion_row from private.identity_profile_completions where proposal_id = p_proposal_id for update;
  if found then
    if completion_row.animal_id is null then raise exception 'identity_profile_outcome_unavailable' using errcode = 'P0001'; end if;
    insert into private.identity_profile_completion_requests(actor_id, request_id, payload_hash, proposal_id)
      values (v_actor_id, p_request_id, payload_hash, p_proposal_id);
    return query select p_proposal_id, 'confirmed', completion_row.animal_id; return;
  end if;
  if context_row.status <> 'confirmed'::public.identity_proposal_status
     or not exists (select 1 from public.match_reviews where proposal_id = p_proposal_id and decision = 'confirm') then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  end if;
  insert into public.animals(primary_alias, profile_created_by, lifecycle, visibility)
    values (alias_text, v_actor_id, 'unknown', case when (select visibility from public.sightings where id = context_row.sighting_id) = 'hidden'::public.record_visibility
      or (select risk from public.sightings where id = context_row.sighting_id) <> 'normal'::public.risk_tier
      then 'hidden'::public.record_visibility else 'public'::public.record_visibility end)
    returning * into animal_row;
  insert into private.identity_profile_completions(proposal_id, animal_id, confirmed_by, confirmation_source)
    values (p_proposal_id, animal_row.id, v_actor_id, 'independent_identity_review') returning * into completion_row;
  update public.sightings set animal_id = animal_row.id where id = context_row.sighting_id and animal_id is null;
  if not found then raise exception 'identity_proposal_not_actionable' using errcode = 'P0001'; end if;
  insert into private.identity_profile_completion_requests(actor_id, request_id, payload_hash, proposal_id)
    values (v_actor_id, p_request_id, payload_hash, p_proposal_id);
  insert into audit.access_audit(actor_id, action, resource_type, resource_id, purpose, request_id)
    values (v_actor_id, 'identity_profile_complete', 'identity_proposal', p_proposal_id, 'identity_review', p_request_id::text);
  return query select p_proposal_id, 'confirmed', completion_row.animal_id;
end;
$$;

revoke all on function private.lock_and_validate_identity_proposal(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_new_animal_identity(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_new_animal_identity(uuid, text, text, uuid) to authenticated;
comment on function public.confirm_new_animal_identity(uuid, text, text, uuid) is
  'Atomic trusted independent confirmation and explicit new-animal profile completion; legacy review remains confirmation-only.';

commit;
