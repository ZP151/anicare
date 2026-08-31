begin;

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
  discovered_sighting_id uuid;
  asset public.media_assets%rowtype;
  upload_job private.media_upload_jobs%rowtype;
  affected_job record;
  affected_job_ids uuid[] := '{}'::uuid[];
  revalidated_job_ids uuid[] := '{}'::uuid[];
  affected_proposal_ids uuid[] := '{}'::uuid[];
  revalidated_proposal_ids uuid[] := '{}'::uuid[];
  linked_upload_count bigint;
  finalized_upload_count bigint;
  authorized boolean;
  newly_invalidated boolean;
  invalidated_at timestamptz;
  prior_job_writer text :=
    pg_catalog.current_setting('private.identity_assistance_job_writer', true);
  prior_candidate_writer text :=
    pg_catalog.current_setting('private.identity_assistance_candidate_writer', true);
begin
  if p_actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- This discovery read chooses the sighting lock without authorizing from an
  -- unlocked media row. Every security-sensitive field is re-read below.
  select media.sighting_id
    into discovered_sighting_id
    from public.media_assets as media
   where media.id = p_media_id;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'media-delete:' || coalesce(p_media_id::text, 'null'), 0
    )
  );

  -- Global order: account/role -> sighting -> upload job -> media asset ->
  -- identity job -> proposal -> evidence -> review. This path removes
  -- candidates but intentionally never acquires candidate-animal rows.
  perform 1
    from public.user_profiles as profiles
   where profiles.id = p_actor_id
   for update;

  perform 1
    from public.role_grants as grants
   where grants.user_id = p_actor_id
   order by grants.id
   for update;

  perform 1
    from public.sightings as sightings
   where sightings.id = discovered_sighting_id
   for update;

  perform 1
    from private.media_upload_jobs as uploads
   where uploads.media_asset_id = p_media_id
   order by uploads.id
   for update;

  select media.*
    into asset
    from public.media_assets as media
   where media.id = p_media_id
   for update;

  if not found then
    raise exception 'media_not_found_or_forbidden' using errcode = '42501';
  end if;

  perform 1
    from private.identity_assistance_jobs as jobs
   where jobs.media_asset_id = p_media_id
   order by jobs.id
   for update;

  select coalesce(pg_catalog.array_agg(jobs.id order by jobs.id), '{}'::uuid[])
    into affected_job_ids
    from private.identity_assistance_jobs as jobs
   where jobs.media_asset_id = p_media_id;

  perform 1
    from public.identity_proposals as proposals
    join private.identity_proposal_evidence as evidence
      on evidence.proposal_id = proposals.id
   where evidence.job_id = any(affected_job_ids)
   order by proposals.id
   for update of proposals;

  select coalesce(
           pg_catalog.array_agg(proposals.id order by proposals.id),
           '{}'::uuid[]
         )
    into affected_proposal_ids
    from public.identity_proposals as proposals
    join private.identity_proposal_evidence as evidence
      on evidence.proposal_id = proposals.id
   where evidence.job_id = any(affected_job_ids);

  perform 1
    from private.identity_proposal_evidence as evidence
   where evidence.job_id = any(affected_job_ids)
   order by evidence.proposal_id
   for update;

  perform 1
    from public.match_reviews as reviews
   where reviews.proposal_id = any(affected_proposal_ids)
   order by reviews.id
   for update;

  -- All time-sensitive checks use a post-wait wall-clock value.
  invalidated_at := pg_catalog.clock_timestamp();

  if asset.sighting_id is distinct from discovered_sighting_id
     or (
       asset.sighting_id is not null
       and not exists (
         select 1
           from public.sightings as sightings
          where sightings.id = asset.sighting_id
       )
     ) then
    raise exception 'media_not_found_or_forbidden' using errcode = '42501';
  end if;

  authorized :=
    asset.uploader_id = p_actor_id
    or exists (
      select 1
        from public.role_grants as grants
       where grants.user_id = p_actor_id
         and grants.role = 'platform_admin'::public.trust_role
         and grants.revoked_at is null
         and (
           grants.provisional_until is null
           or grants.provisional_until > invalidated_at
         )
    );

  if not coalesce(authorized, false) then
    raise exception 'media_not_found_or_forbidden' using errcode = '42501';
  end if;

  if asset.deleted_at is not null then
    raise exception 'media_deleted' using errcode = 'P0001';
  end if;

  select pg_catalog.count(*),
         pg_catalog.count(*) filter (
           where uploads.status = 'finalized'::private.media_upload_job_status
         )
    into linked_upload_count, finalized_upload_count
    from private.media_upload_jobs as uploads
   where uploads.media_asset_id = p_media_id;

  if asset.storage_bucket = 'media-staging' then
    if linked_upload_count <> 1 or finalized_upload_count <> 1 then
      raise exception 'media_deletion_unavailable_upload_count'
        using errcode = 'P0001';
    end if;

    select uploads.*
      into upload_job
      from private.media_upload_jobs as uploads
     where uploads.media_asset_id = p_media_id
       and uploads.status = 'finalized'::private.media_upload_job_status
     order by uploads.id
     limit 1;

    if upload_job.media_asset_id is distinct from asset.id then
      raise exception 'media_deletion_unavailable_binding_asset'
        using errcode = 'P0001';
    elsif upload_job.sighting_id is distinct from asset.sighting_id then
      raise exception 'media_deletion_unavailable_binding_sighting'
        using errcode = 'P0001';
    elsif upload_job.uploader_id is distinct from asset.uploader_id then
      raise exception 'media_deletion_unavailable_binding_uploader'
        using errcode = 'P0001';
    elsif upload_job.object_path is distinct from asset.storage_path then
      raise exception 'media_deletion_unavailable_binding_path'
        using errcode = 'P0001';
    elsif upload_job.media_id is distinct from asset.client_media_id then
      raise exception 'media_deletion_unavailable_binding_media_id'
        using errcode = 'P0001';
    elsif upload_job.sha256 is distinct from asset.sha256 then
      raise exception 'media_deletion_unavailable_binding_hash'
        using errcode = 'P0001';
    elsif upload_job.recipe_version is distinct from asset.recipe_version then
      raise exception 'media_deletion_unavailable_binding_recipe'
        using errcode = 'P0001';
    elsif upload_job.byte_length is distinct from asset.byte_length then
      raise exception 'media_deletion_unavailable_binding_bytes'
        using errcode = 'P0001';
    elsif upload_job.width is distinct from asset.width then
      raise exception 'media_deletion_unavailable_binding_width'
        using errcode = 'P0001';
    elsif upload_job.height is distinct from asset.height then
      raise exception 'media_deletion_unavailable_binding_height'
        using errcode = 'P0001';
    elsif upload_job.detector_versions is distinct from asset.detector_versions then
      raise exception 'media_deletion_unavailable_binding_detectors'
        using errcode = 'P0001';
    elsif upload_job.finalized_at is null then
      raise exception 'media_deletion_unavailable_binding_finalized_at'
        using errcode = 'P0001';
    end if;
  end if;

  -- Re-read the relationships after the final review locks. Foreign-key key
  -- locks plus the already-held parent row locks prevent a new affected child
  -- from committing between this revalidation and mutation.
  select coalesce(pg_catalog.array_agg(jobs.id order by jobs.id), '{}'::uuid[])
    into revalidated_job_ids
    from private.identity_assistance_jobs as jobs
   where jobs.media_asset_id = p_media_id;

  select coalesce(
           pg_catalog.array_agg(proposals.id order by proposals.id),
           '{}'::uuid[]
         )
    into revalidated_proposal_ids
    from public.identity_proposals as proposals
    join private.identity_proposal_evidence as evidence
      on evidence.proposal_id = proposals.id
   where evidence.job_id = any(revalidated_job_ids);

  if revalidated_job_ids is distinct from affected_job_ids
     or revalidated_proposal_ids is distinct from affected_proposal_ids then
    raise exception 'media_deletion_unavailable_relationship_revalidation'
      using errcode = 'P0001';
  end if;

  -- Tentative AI-selected work is withdrawn, not rejected. Deleting the
  -- protected proposal cascades its evidence and any non-terminal review
  -- detail without manufacturing a match_reviews decision.
  delete from public.identity_proposals as proposals
   using private.identity_proposal_evidence as evidence
   where proposals.id = evidence.proposal_id
     and evidence.job_id = any(affected_job_ids)
     and proposals.status = 'tentative'::public.identity_proposal_status;

  -- Non-tentative proposal history may remain, but no longer identifies the
  -- source media or selector when the media is tombstoned.
  update private.identity_proposal_evidence as evidence
     set media_asset_id = null,
         selector_id = null
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
      'private.identity_assistance_candidate_writer',
      affected_job.id::text,
      true
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer',
      affected_job.id::text,
      true
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
           media_asset_id = null,
           input_sha256 = null,
           lease_id = case
             when status in (
               'requested'::private.identity_assistance_job_status,
               'processing'::private.identity_assistance_job_status
             ) then null
             else lease_id
           end,
           lease_expires_at = case
             when status in (
               'requested'::private.identity_assistance_job_status,
               'processing'::private.identity_assistance_job_status
             ) then null
             else lease_expires_at
           end,
           processing_at = case
             when status in (
               'requested'::private.identity_assistance_job_status,
               'processing'::private.identity_assistance_job_status
             ) then null
             else processing_at
           end,
           cancelled_at = case
             when status in (
               'requested'::private.identity_assistance_job_status,
               'processing'::private.identity_assistance_job_status
             )
               or (
                 status = 'succeeded'::private.identity_assistance_job_status
                 and selected_at is null
                 and withdrawn_at is null
                 and result_invalidated_at is null
               )
               then coalesce(cancelled_at, invalidated_at)
             else cancelled_at
           end,
           withdrawn_at = coalesce(withdrawn_at, invalidated_at),
           result_invalidated_at = coalesce(result_invalidated_at, invalidated_at),
           updated_at = invalidated_at
     where id = affected_job.id;

    perform pg_catalog.set_config(
      'private.identity_assistance_candidate_writer',
      coalesce(prior_candidate_writer, ''),
      true
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer',
      coalesce(prior_job_writer, ''),
      true
    );

    if newly_invalidated then
      insert into private.identity_assistance_events (
        job_id, event_type, failure_code, reason_code, occurred_at
      ) values (
        affected_job.id,
        'invalidated'::private.identity_assistance_event_type,
        'source_invalidated'::private.identity_assistance_failure_code,
        'source_invalidated',
        invalidated_at
      );
    end if;
  end loop;

  update public.media_assets
     set deleted_at = invalidated_at,
         embedding = null,
         embedding_model_version = null,
         training_eligible = false
   where id = asset.id;

  if asset.storage_bucket <> 'media-staging' then
    return query
      select asset.storage_bucket, asset.storage_path, true;
    return;
  end if;

  update private.media_upload_jobs
     set status = 'deletion_pending'::private.media_upload_job_status,
         next_cleanup_at = greatest(
           invalidated_at,
           coalesce(upload_token_expires_at, reservation_expires_at)
             + interval '5 minutes'
         ),
         cleanup_claimed_at = null,
         cleanup_claim_id = null,
         updated_at = invalidated_at
   where id = upload_job.id;

  return query
    select asset.storage_bucket, asset.storage_path, false;
end;
$$;

revoke all on function public.server_request_media_deletion(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.server_request_media_deletion(uuid, uuid)
  to service_role;

commit;
