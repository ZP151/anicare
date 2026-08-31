begin;

create or replace function private.prepare_user_profile_account_erasure()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  erasure_token uuid := extensions.gen_random_uuid();
  invalidated_at timestamptz;
  affected_job record;
  affected_sighting_ids uuid[] := '{}'::uuid[];
  affected_upload_ids uuid[] := '{}'::uuid[];
  affected_media_ids uuid[] := '{}'::uuid[];
  affected_job_ids uuid[] := '{}'::uuid[];
  affected_proposal_ids uuid[] := '{}'::uuid[];
  revalidated_sighting_ids uuid[] := '{}'::uuid[];
  revalidated_upload_ids uuid[] := '{}'::uuid[];
  revalidated_media_ids uuid[] := '{}'::uuid[];
  revalidated_job_ids uuid[] := '{}'::uuid[];
  revalidated_proposal_ids uuid[] := '{}'::uuid[];
  newly_invalidated boolean;
  prior_erasure_actor text :=
    pg_catalog.current_setting('private.account_erasure_actor', true);
  prior_job_writer text :=
    pg_catalog.current_setting('private.identity_assistance_job_writer', true);
  prior_candidate_writer text :=
    pg_catalog.current_setting('private.identity_assistance_candidate_writer', true);
begin
  perform pg_catalog.set_config('private.account_erasure_actor', old.id::text, true);
  begin
    -- Discovery selects stable lock targets only. The outer profile DELETE
    -- already owns OLD, so no authorization decision depends on these reads.
    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into affected_job_ids
      from (
        select distinct jobs.id
          from private.identity_assistance_jobs as jobs
          join public.sightings as sightings on sightings.id = jobs.sighting_id
          left join public.media_assets as media on media.id = jobs.media_asset_id
          left join private.identity_proposal_evidence as evidence on evidence.job_id = jobs.id
          left join public.identity_proposals as proposals on proposals.id = evidence.proposal_id
         where jobs.requester_id = old.id
            or sightings.reporter_id = old.id
            or media.uploader_id = old.id
            or evidence.selector_id = old.id
            or (
              proposals.status = 'tentative'::public.identity_proposal_status
              and proposals.proposer_id = old.id
            )
      ) as discovered;

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into affected_proposal_ids
      from (
        select distinct proposals.id
          from public.identity_proposals as proposals
          left join private.identity_proposal_evidence as evidence
            on evidence.proposal_id = proposals.id
         where proposals.proposer_id = old.id
            or evidence.job_id = any(affected_job_ids)
      ) as discovered;

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into affected_sighting_ids
      from (
        select sightings.id
          from public.sightings as sightings
         where sightings.reporter_id = old.id
        union
        select jobs.sighting_id
          from private.identity_assistance_jobs as jobs
         where jobs.id = any(affected_job_ids)
        union
        select proposals.sighting_id
          from public.identity_proposals as proposals
         where proposals.id = any(affected_proposal_ids)
      ) as discovered;

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into affected_media_ids
      from (
        select media.id
          from public.media_assets as media
         where media.uploader_id = old.id
        union
        select jobs.media_asset_id
          from private.identity_assistance_jobs as jobs
         where jobs.id = any(affected_job_ids)
           and jobs.media_asset_id is not null
      ) as discovered;

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into affected_upload_ids
      from (
        select uploads.id
          from private.media_upload_jobs as uploads
         where uploads.uploader_id = old.id
            or uploads.media_asset_id = any(affected_media_ids)
      ) as discovered;

    -- Global lock classes: erased grants, sightings, uploads, media, jobs,
    -- proposals/evidence, then reviews. Candidate animals are never locked.
    perform 1
      from public.role_grants as grants
     where grants.user_id = old.id
     order by grants.id
     for update;

    perform 1
      from public.sightings as sightings
     where sightings.id = any(affected_sighting_ids)
     order by sightings.id
     for update;

    perform 1
      from private.media_upload_jobs as uploads
     where uploads.id = any(affected_upload_ids)
     order by uploads.id
     for update;

    perform 1
      from public.media_assets as media
     where media.id = any(affected_media_ids)
     order by media.id
     for update;

    perform 1
      from private.identity_assistance_jobs as jobs
     where jobs.id = any(affected_job_ids)
     order by jobs.id
     for update;

    perform 1
      from public.identity_proposals as proposals
     where proposals.id = any(affected_proposal_ids)
     order by proposals.id
     for update;

    perform 1
      from private.identity_proposal_evidence as evidence
     where evidence.proposal_id = any(affected_proposal_ids)
     order by evidence.proposal_id
     for update;

    perform 1
      from public.match_reviews as reviews
     where reviews.proposal_id = any(affected_proposal_ids)
        or reviews.reviewer_id = old.id
     order by reviews.id
     for update;

    invalidated_at := pg_catalog.clock_timestamp();

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into revalidated_job_ids
      from (
        select distinct jobs.id
          from private.identity_assistance_jobs as jobs
          join public.sightings as sightings on sightings.id = jobs.sighting_id
          left join public.media_assets as media on media.id = jobs.media_asset_id
          left join private.identity_proposal_evidence as evidence on evidence.job_id = jobs.id
          left join public.identity_proposals as proposals on proposals.id = evidence.proposal_id
         where jobs.requester_id = old.id
            or sightings.reporter_id = old.id
            or media.uploader_id = old.id
            or evidence.selector_id = old.id
            or (
              proposals.status = 'tentative'::public.identity_proposal_status
              and proposals.proposer_id = old.id
            )
      ) as discovered;

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into revalidated_proposal_ids
      from (
        select distinct proposals.id
          from public.identity_proposals as proposals
          left join private.identity_proposal_evidence as evidence
            on evidence.proposal_id = proposals.id
         where proposals.proposer_id = old.id
            or evidence.job_id = any(revalidated_job_ids)
      ) as discovered;

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into revalidated_sighting_ids
      from (
        select sightings.id
          from public.sightings as sightings
         where sightings.reporter_id = old.id
        union
        select jobs.sighting_id
          from private.identity_assistance_jobs as jobs
         where jobs.id = any(revalidated_job_ids)
        union
        select proposals.sighting_id
          from public.identity_proposals as proposals
         where proposals.id = any(revalidated_proposal_ids)
      ) as discovered;

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into revalidated_media_ids
      from (
        select media.id
          from public.media_assets as media
         where media.uploader_id = old.id
        union
        select jobs.media_asset_id
          from private.identity_assistance_jobs as jobs
         where jobs.id = any(revalidated_job_ids)
           and jobs.media_asset_id is not null
      ) as discovered;

    select coalesce(pg_catalog.array_agg(discovered.id order by discovered.id), '{}'::uuid[])
      into revalidated_upload_ids
      from (
        select uploads.id
          from private.media_upload_jobs as uploads
         where uploads.uploader_id = old.id
            or uploads.media_asset_id = any(revalidated_media_ids)
      ) as discovered;

    if revalidated_job_ids is distinct from affected_job_ids
       or revalidated_proposal_ids is distinct from affected_proposal_ids
       or revalidated_sighting_ids is distinct from affected_sighting_ids
       or revalidated_upload_ids is distinct from affected_upload_ids
       or revalidated_media_ids is distinct from affected_media_ids then
      raise exception 'account_erasure_relationship_changed' using errcode = 'P0001';
    end if;

    -- Withdraw detailed tentative work without manufacturing a decision.
    delete from public.identity_proposals as proposals
     where proposals.id = any(affected_proposal_ids)
       and proposals.status = 'tentative'::public.identity_proposal_status;

    -- Terminal decision history may remain, but erased source provenance may not.
    update private.identity_proposal_evidence as evidence
       set media_asset_id = null,
           selector_id = case when selector_id = old.id then null else selector_id end
     where evidence.job_id = any(affected_job_ids);

    for affected_job in
      select jobs.id, jobs.status, jobs.selected_at,
             jobs.withdrawn_at, jobs.result_invalidated_at
        from private.identity_assistance_jobs as jobs
       where jobs.id = any(affected_job_ids)
       order by jobs.id
    loop
      newly_invalidated := affected_job.result_invalidated_at is null;

      perform pg_catalog.set_config(
        'private.identity_assistance_candidate_writer', affected_job.id::text, true
      );
      perform pg_catalog.set_config(
        'private.identity_assistance_job_writer', affected_job.id::text, true
      );

      delete from private.identity_assistance_candidates
       where job_id = affected_job.id;

      update private.identity_assistance_jobs
         set status = case
               when status in (
                 'requested'::private.identity_assistance_job_status,
                 'processing'::private.identity_assistance_job_status
               ) then 'cancelled'::private.identity_assistance_job_status
               when status = 'succeeded'::private.identity_assistance_job_status
                 and selected_at is null
                 and withdrawn_at is null
                 and result_invalidated_at is null
                 then 'cancelled'::private.identity_assistance_job_status
               else status
             end,
             requester_id = case when requester_id = old.id then null else requester_id end,
             media_asset_id = null,
             input_sha256 = null,
             lease_id = case
               when status in (
                 'requested'::private.identity_assistance_job_status,
                 'processing'::private.identity_assistance_job_status
               ) or (
                 status = 'succeeded'::private.identity_assistance_job_status
                 and selected_at is null
                 and withdrawn_at is null
                 and result_invalidated_at is null
               ) then null else lease_id end,
             lease_expires_at = case
               when status in (
                 'requested'::private.identity_assistance_job_status,
                 'processing'::private.identity_assistance_job_status
               ) or (
                 status = 'succeeded'::private.identity_assistance_job_status
                 and selected_at is null
                 and withdrawn_at is null
                 and result_invalidated_at is null
               ) then null else lease_expires_at end,
             processing_at = case
               when status in (
                 'requested'::private.identity_assistance_job_status,
                 'processing'::private.identity_assistance_job_status
               ) or (
                 status = 'succeeded'::private.identity_assistance_job_status
                 and selected_at is null
                 and withdrawn_at is null
                 and result_invalidated_at is null
               ) then null else processing_at end,
             cancelled_at = case
               when status in (
                 'requested'::private.identity_assistance_job_status,
                 'processing'::private.identity_assistance_job_status
               ) or (
                 status = 'succeeded'::private.identity_assistance_job_status
                 and selected_at is null
                 and withdrawn_at is null
                 and result_invalidated_at is null
               ) then coalesce(cancelled_at, invalidated_at)
               else cancelled_at end,
             withdrawn_at = coalesce(withdrawn_at, invalidated_at),
             result_invalidated_at = coalesce(result_invalidated_at, invalidated_at),
             updated_at = invalidated_at
       where id = affected_job.id;

      perform pg_catalog.set_config(
        'private.identity_assistance_candidate_writer',
        coalesce(prior_candidate_writer, ''), true
      );
      perform pg_catalog.set_config(
        'private.identity_assistance_job_writer', coalesce(prior_job_writer, ''), true
      );

      if newly_invalidated then
        insert into private.identity_assistance_events (
          job_id, event_type, failure_code, reason_code, occurred_at
        ) values (
          affected_job.id,
          'invalidated'::private.identity_assistance_event_type,
          'source_invalidated'::private.identity_assistance_failure_code,
          'source_invalidated', invalidated_at
        );
      end if;
    end loop;

    delete from private.identity_assistance_requests where actor_id = old.id;
    delete from private.identity_requests where actor_id = old.id;
    delete from private.identity_assistance_status_reads where actor_id = old.id;

    -- Preserve the established media tombstone and cleanup behavior. Media
    -- uploader_id stays intact for the sibling legacy-outbox trigger.
    update public.media_assets
       set deleted_at = coalesce(deleted_at, invalidated_at),
           embedding = null,
           embedding_model_version = null,
           training_eligible = false
     where uploader_id = old.id;

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
           updated_at = invalidated_at
     where uploader_id = old.id;

    delete from private.admin_moderation_requests where actor_id = old.id;

    update public.moderation_actions
       set actor_id = null, actor_erasure_token = erasure_token
     where actor_id = old.id;

    update audit.access_audit
       set actor_erasure_token = erasure_token
     where actor_id = old.id;
  exception when others then
    perform pg_catalog.set_config(
      'private.identity_assistance_candidate_writer',
      coalesce(prior_candidate_writer, ''), true
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer', coalesce(prior_job_writer, ''), true
    );
    perform pg_catalog.set_config(
      'private.account_erasure_actor', coalesce(prior_erasure_actor, ''), true
    );
    raise;
  end;

  perform pg_catalog.set_config(
    'private.identity_assistance_candidate_writer',
    coalesce(prior_candidate_writer, ''), true
  );
  perform pg_catalog.set_config(
    'private.identity_assistance_job_writer', coalesce(prior_job_writer, ''), true
  );
  perform pg_catalog.set_config(
    'private.account_erasure_actor', coalesce(prior_erasure_actor, ''), true
  );
  return old;
end;
$$;

create or replace function public.review_identity_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_rationale text,
  p_request_id uuid
)
returns table (
  "proposalId" uuid,
  "decision" text,
  "status" text,
  "animalId" uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  normalized_rationale text;
  payload_hash text;
  prior private.identity_requests%rowtype;
  discovered_proposal public.identity_proposals%rowtype;
  proposal_row public.identity_proposals%rowtype;
  discovered_sighting public.sightings%rowtype;
  sighting_row public.sightings%rowtype;
  discovered_evidence private.identity_proposal_evidence%rowtype;
  evidence_row private.identity_proposal_evidence%rowtype;
  discovered_job private.identity_assistance_jobs%rowtype;
  job_row private.identity_assistance_jobs%rowtype;
  discovered_media public.media_assets%rowtype;
  media_row public.media_assets%rowtype;
  upload_row private.media_upload_jobs%rowtype;
  review_row public.match_reviews%rowtype;
  discovered_animal_creator_id uuid;
  animal_creator_id uuid;
  discovered_account_ids uuid[] := '{}'::uuid[];
  locked_account_count bigint;
  upload_count bigint;
  has_evidence boolean := false;
  resulting_status public.identity_proposal_status;
  revalidated_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'trusted_identity_reviewer_required' using errcode = '42501';
  end if;

  -- Cheap rejection only; the locked role recheck below is authoritative.
  perform 1
    from public.role_grants as grants
   where grants.user_id = v_actor_id
     and grants.role = any(
       array['trusted_contributor', 'area_steward', 'platform_admin']::public.trust_role[]
     )
     and grants.revoked_at is null
     and (grants.provisional_until is null or grants.provisional_until > pg_catalog.now());
  if not found then
    raise exception 'trusted_identity_reviewer_required' using errcode = '42501';
  end if;

  normalized_rationale := pg_catalog.btrim(p_rationale);
  if p_proposal_id is null
    or p_request_id is null
    or p_decision is null
    or p_decision not in ('confirm', 'reject', 'needs_more_evidence')
    or not private.identity_rationale_is_safe(normalized_rationale) then
    raise exception 'invalid_identity_review' using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'proposalId', p_proposal_id,
        'decision', p_decision,
        'rationale', normalized_rationale
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id::text || ':' || p_request_id::text, 0)
  );

  select * into discovered_proposal
    from public.identity_proposals as proposals
   where proposals.id = p_proposal_id;
  if not found then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  end if;

  select * into discovered_sighting
    from public.sightings as sightings
   where sightings.id = discovered_proposal.sighting_id;
  if not found then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  end if;

  select * into discovered_evidence
    from private.identity_proposal_evidence as evidence
   where evidence.proposal_id = discovered_proposal.id;
  has_evidence := found;

  if has_evidence then
    select * into discovered_job
      from private.identity_assistance_jobs as jobs
     where jobs.id = discovered_evidence.job_id;
    select * into discovered_media
      from public.media_assets as media
     where media.id = discovered_evidence.media_asset_id;
  end if;

  discovered_animal_creator_id := null;
  if discovered_proposal.proposed_animal_id is not null then
    select animals.profile_created_by into discovered_animal_creator_id
      from public.animals as animals
     where animals.id = discovered_proposal.proposed_animal_id;
  end if;

  select coalesce(pg_catalog.array_agg(accounts.id order by accounts.id), '{}'::uuid[])
    into discovered_account_ids
    from (
      select distinct account_id as id
        from unnest(array[
          v_actor_id,
          discovered_sighting.reporter_id,
          discovered_proposal.proposer_id,
          discovered_evidence.selector_id,
          discovered_job.requester_id,
          discovered_media.uploader_id,
          discovered_animal_creator_id
        ]::uuid[]) as account_ids(account_id)
       where account_id is not null
    ) as accounts;

  -- Profiles serialize reviewer, recusal subjects, and evidence sources with
  -- account erasure before any lower resource is acquired.
  perform 1
    from public.user_profiles as profiles
   where profiles.id = any(discovered_account_ids)
   order by profiles.id
   for update;

  perform 1
    from public.role_grants as grants
   where grants.user_id = v_actor_id
   order by grants.id
   for update;

  perform 1
    from public.sightings as sightings
   where sightings.id = discovered_proposal.sighting_id
   for update;

  if has_evidence then
    perform 1
      from private.media_upload_jobs as uploads
     where uploads.media_asset_id = discovered_evidence.media_asset_id
     order by uploads.id
     for update;

    perform 1
      from public.media_assets as media
     where media.id = discovered_evidence.media_asset_id
     for update;
  end if;

  if discovered_proposal.proposed_animal_id is not null then
    perform 1
      from public.animals as animals
     where animals.id = discovered_proposal.proposed_animal_id
     for update;
  end if;

  if has_evidence then
    perform 1
      from private.identity_assistance_jobs as jobs
     where jobs.id = discovered_evidence.job_id
     for update;
  end if;

  perform 1
    from public.identity_proposals as proposals
   where proposals.id = discovered_proposal.id
   for update;

  if has_evidence then
    perform 1
      from private.identity_proposal_evidence as evidence
     where evidence.proposal_id = discovered_proposal.id
     for update;
  end if;

  perform 1
    from public.match_reviews as reviews
   where reviews.proposal_id = discovered_proposal.id
   order by reviews.id
   for update;

  revalidated_at := pg_catalog.clock_timestamp();

  if not exists (
    select 1 from public.user_profiles as profiles where profiles.id = v_actor_id
  ) then
    raise exception 'trusted_identity_reviewer_required' using errcode = '42501';
  end if;

  select pg_catalog.count(*) into locked_account_count
    from public.user_profiles as profiles
   where profiles.id = any(discovered_account_ids);
  if locked_account_count <> cardinality(discovered_account_ids) then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
      from public.role_grants as grants
     where grants.user_id = v_actor_id
       and grants.role = any(
         array['trusted_contributor', 'area_steward', 'platform_admin']::public.trust_role[]
       )
       and grants.revoked_at is null
       and (grants.provisional_until is null or grants.provisional_until > revalidated_at)
  ) then
    raise exception 'trusted_identity_reviewer_required' using errcode = '42501';
  end if;

  select * into prior
    from private.identity_requests as requests
   where requests.actor_id = v_actor_id
     and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'review' or prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    select * into review_row
      from public.match_reviews as reviews where reviews.id = prior.review_id;
    select * into proposal_row
      from public.identity_proposals as proposals where proposals.id = prior.proposal_id;
    if review_row.id is null or proposal_row.id is null then
      raise exception 'identity_review_outcome_unavailable' using errcode = 'P0001';
    end if;
    return query select proposal_row.id, review_row.decision, proposal_row.status::text,
      proposal_row.proposed_animal_id;
    return;
  end if;

  select * into proposal_row
    from public.identity_proposals as proposals
   where proposals.id = discovered_proposal.id;
  select * into sighting_row
    from public.sightings as sightings
   where sightings.id = discovered_sighting.id;

  if proposal_row.id is null
     or proposal_row.sighting_id is distinct from discovered_proposal.sighting_id
     or proposal_row.proposed_animal_id is distinct from discovered_proposal.proposed_animal_id
     or proposal_row.proposer_id is distinct from discovered_proposal.proposer_id
     or proposal_row.status <> 'tentative'::public.identity_proposal_status
     or sighting_row.id is null
     or sighting_row.reporter_id is distinct from discovered_sighting.reporter_id
     or sighting_row.animal_id is not null then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  end if;

  if proposal_row.proposed_animal_id is not null then
    select animals.profile_created_by into animal_creator_id
      from public.animals as animals
    where animals.id = proposal_row.proposed_animal_id
       and animals.archived_at is null
       and animals.visibility <> 'hidden'::public.record_visibility;
    if not found then
      if has_evidence then
        raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
      end if;
      raise exception 'identity_animal_not_available' using errcode = 'P0001';
    end if;
    if animal_creator_id is distinct from discovered_animal_creator_id then
      raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
    end if;
  elsif proposal_row.source <> 'new_animal' and has_evidence then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  elsif proposal_row.source <> 'new_animal' then
    raise exception 'identity_animal_not_available' using errcode = 'P0001';
  end if;

  if v_actor_id = proposal_row.proposer_id
     or v_actor_id = sighting_row.reporter_id
     or v_actor_id = animal_creator_id
     or (has_evidence and v_actor_id = discovered_evidence.selector_id) then
    raise exception 'identity_reviewer_recusal_required' using errcode = '42501';
  end if;

  if has_evidence then
    select * into evidence_row
      from private.identity_proposal_evidence as evidence
     where evidence.proposal_id = proposal_row.id;
    select * into job_row
      from private.identity_assistance_jobs as jobs
     where jobs.id = evidence_row.job_id;
    select * into media_row
      from public.media_assets as media
     where media.id = evidence_row.media_asset_id;

    select pg_catalog.count(*) into upload_count
      from private.media_upload_jobs as uploads
     where uploads.media_asset_id = evidence_row.media_asset_id;
    select * into upload_row
      from private.media_upload_jobs as uploads
     where uploads.media_asset_id = evidence_row.media_asset_id
     order by uploads.id
     limit 1;

    if evidence_row.proposal_id is null
       or evidence_row.job_id is distinct from discovered_evidence.job_id
       or evidence_row.media_asset_id is distinct from discovered_evidence.media_asset_id
       or evidence_row.selector_id is null
       or evidence_row.selector_id is distinct from discovered_evidence.selector_id
       or evidence_row.selected_candidate_rank is distinct from discovered_evidence.selected_candidate_rank
       or evidence_row.selected_at is distinct from discovered_evidence.selected_at
       or evidence_row.recipe_version is distinct from discovered_evidence.recipe_version
       or evidence_row.model_version is distinct from discovered_evidence.model_version
       or evidence_row.crop_contract_version is distinct from discovered_evidence.crop_contract_version
       or evidence_row.embedding_contract_version is distinct from discovered_evidence.embedding_contract_version
       or evidence_row.identify_contract_version is distinct from discovered_evidence.identify_contract_version
       or evidence_row.callback_contract_version is distinct from discovered_evidence.callback_contract_version
       or job_row.id is null
       or job_row.id is distinct from discovered_job.id
       or job_row.sighting_id is distinct from proposal_row.sighting_id
       or job_row.sighting_id is distinct from discovered_job.sighting_id
       or job_row.requester_id is distinct from discovered_job.requester_id
       or job_row.media_asset_id is distinct from evidence_row.media_asset_id
       or job_row.media_asset_id is distinct from discovered_job.media_asset_id
       or job_row.status <> 'succeeded'::private.identity_assistance_job_status
       or job_row.selected_at is null
       or job_row.completed_at is null
       or job_row.model_version is null
       or job_row.callback_contract_version is null
       or job_row.withdrawn_at is not null
       or job_row.result_invalidated_at is not null
       or job_row.input_sha256 is null
       or media_row.id is null
       or media_row.id is distinct from discovered_media.id
       or media_row.sighting_id is distinct from proposal_row.sighting_id
       or media_row.uploader_id is distinct from discovered_media.uploader_id
       or media_row.deleted_at is not null
       or media_row.storage_bucket is distinct from 'media-staging'
       or media_row.status is distinct from 'quarantined'
       or media_row.reviewed_at is null
       or upload_count <> 1
       or upload_row.status is distinct from 'finalized'::private.media_upload_job_status
       or upload_row.finalized_at is null
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
       or (
         proposal_row.source = 'new_animal'
         and (
           proposal_row.proposed_animal_id is not null
           or evidence_row.selected_candidate_rank is not null
         )
       )
       or (
         proposal_row.source = 'ai_candidate'
         and (
           proposal_row.proposed_animal_id is null
           or evidence_row.selected_candidate_rank is null
           or not exists (
             select 1
               from private.identity_assistance_candidates as candidates
              where candidates.job_id = job_row.id
                and candidates.rank = evidence_row.selected_candidate_rank
                and candidates.animal_id = proposal_row.proposed_animal_id
           )
         )
       ) then
      raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
    end if;
  end if;

  insert into public.match_reviews (
    proposal_id, reviewer_id, decision, rationale, request_id
  ) values (
    proposal_row.id, v_actor_id, p_decision, normalized_rationale, p_request_id
  ) returning * into review_row;

  resulting_status := proposal_row.status;
  if p_decision = 'confirm' then
    resulting_status := 'confirmed'::public.identity_proposal_status;
    update public.identity_proposals
       set status = resulting_status, reviewed_at = pg_catalog.now()
     where id = proposal_row.id;
    if proposal_row.proposed_animal_id is not null then
      update public.sightings
         set animal_id = proposal_row.proposed_animal_id
       where id = sighting_row.id and animal_id is null;
      if not found then
        raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
      end if;
    end if;
  elsif p_decision = 'reject' then
    resulting_status := 'rejected'::public.identity_proposal_status;
    update public.identity_proposals
       set status = resulting_status, reviewed_at = pg_catalog.now()
     where id = proposal_row.id;
  end if;

  insert into private.identity_requests (
    actor_id, request_id, operation, payload_hash, proposal_id, review_id
  ) values (
    v_actor_id, p_request_id, 'review', payload_hash, proposal_row.id, review_row.id
  );
  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, request_id
  ) values (
    v_actor_id, 'identity_proposal_review', 'identity_proposal', proposal_row.id,
    'identity_review', p_request_id::text
  );

  return query select proposal_row.id, p_decision, resulting_status::text,
    proposal_row.proposed_animal_id;
end;
$$;

revoke all on function private.prepare_user_profile_account_erasure()
  from public, anon, authenticated, service_role;
revoke all on function public.review_identity_proposal(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.review_identity_proposal(uuid, text, text, uuid)
  to authenticated;

comment on function public.review_identity_proposal(uuid, text, text, uuid) is
  'Independent trusted-reviewer path with account-first serialization, selector recusal, evidence revalidation, and unchanged decision semantics.';

commit;
