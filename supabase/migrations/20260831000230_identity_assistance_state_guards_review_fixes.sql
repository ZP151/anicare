begin;

alter table private.identity_assistance_jobs
  drop constraint identity_assistance_job_completion_provenance,
  drop constraint identity_assistance_job_state;

alter table private.identity_assistance_jobs
  add constraint identity_assistance_job_completion_provenance check (
    (
      completed_at is not null
      and status in ('succeeded', 'cancelled', 'expired')
      and model_version is not null
      and callback_contract_version = 'identify-callback.v1'
      and new_cat_recommended is not null
    )
    or (
      completed_at is null
      and status <> 'succeeded'
      and model_version is null
      and callback_contract_version is null
      and new_cat_recommended is null
    )
  ),
  add constraint identity_assistance_job_state check (
    (status = 'requested'
      and lease_id is null and lease_expires_at is null
      and processing_at is null and completed_at is null and failed_at is null
      and cancelled_at is null and failure_code is null)
    or (status = 'processing'
      and lease_id is not null and lease_expires_at is not null
      and processing_at is not null and attempt_count >= 1
      and completed_at is null and failed_at is null and cancelled_at is null
      and failure_code is null)
    or (status = 'succeeded'
      and lease_id is null and lease_expires_at is null
      and completed_at is not null and failed_at is null and cancelled_at is null
      and failure_code is null)
    or (status = 'failed'
      and lease_id is null and lease_expires_at is null
      and completed_at is null and failed_at is not null and cancelled_at is null
      and failure_code is not null)
    or (status = 'cancelled'
      and lease_id is null and lease_expires_at is null
      and failed_at is null and cancelled_at is not null
      and failure_code is null)
    or (status = 'expired'
      and lease_id is null and lease_expires_at is null
      and failed_at is null and cancelled_at is null
      and expires_at is not null and failure_code is null)
  );

create or replace function private.guard_identity_assistance_job_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  cleanup_allows_binding_clear boolean;
  old_was_actionable_success boolean;
  binding_required boolean;
  sighting_row public.sightings%rowtype;
  upload_row private.media_upload_jobs%rowtype;
  media_row public.media_assets%rowtype;
  upload_count bigint;
begin
  if tg_op = 'DELETE' then
    if pg_catalog.current_setting('private.identity_assistance_job_deleter', true)
        is distinct from old.id::text then
      raise exception 'identity_assistance_job_delete_forbidden'
        using errcode = '42501';
    end if;

    return old;
  end if;

  binding_required :=
    new.status = 'processing'::private.identity_assistance_job_status
    or (
      new.status = 'succeeded'::private.identity_assistance_job_status
      and new.selected_at is null
      and new.withdrawn_at is null
      and new.result_invalidated_at is null
    );

  if tg_op = 'UPDATE' then
    cleanup_allows_binding_clear :=
      new.status in (
        'failed'::private.identity_assistance_job_status,
        'cancelled'::private.identity_assistance_job_status,
        'expired'::private.identity_assistance_job_status
      )
      or (
        new.status = 'succeeded'::private.identity_assistance_job_status
        and (new.withdrawn_at is not null or new.result_invalidated_at is not null)
      );

    if new.sighting_id is distinct from old.sighting_id
       or new.recipe_version is distinct from old.recipe_version
       or new.crop_contract_version is distinct from old.crop_contract_version
       or new.embedding_contract_version is distinct from old.embedding_contract_version
       or new.identify_contract_version is distinct from old.identify_contract_version
       or new.requested_at is distinct from old.requested_at
       or new.purpose is distinct from old.purpose
       or new.notice_version is distinct from old.notice_version
       or (
         new.media_asset_id is distinct from old.media_asset_id
         and not (new.media_asset_id is null and cleanup_allows_binding_clear)
       )
       or (
         new.requester_id is distinct from old.requester_id
         and not (new.requester_id is null and cleanup_allows_binding_clear)
       )
       or (
         new.input_sha256 is distinct from old.input_sha256
         and not (new.input_sha256 is null and cleanup_allows_binding_clear)
       ) then
      raise exception 'identity_assistance_job_provenance_immutable'
        using errcode = '42501';
    end if;

    if (old.selected_at is not null and new.selected_at is distinct from old.selected_at)
       or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at)
       or (
         old.result_invalidated_at is not null
         and new.result_invalidated_at is distinct from old.result_invalidated_at
       ) then
      raise exception 'identity_assistance_job_lifecycle_immutable'
        using errcode = '42501';
    end if;

    if old.completed_at is not null
       and (
         new.model_version is distinct from old.model_version
         or new.callback_contract_version is distinct from old.callback_contract_version
         or new.new_cat_recommended is distinct from old.new_cat_recommended
         or new.completed_at is distinct from old.completed_at
       ) then
      raise exception 'identity_assistance_job_completion_immutable'
        using errcode = '42501';
    end if;

    if old.completed_at is null
       and new.completed_at is not null
       and not (
         old.status = 'processing'::private.identity_assistance_job_status
         and new.status = 'succeeded'::private.identity_assistance_job_status
       ) then
      raise exception 'identity_assistance_job_completion_immutable'
        using errcode = '42501';
    end if;

    if pg_catalog.current_setting('private.identity_assistance_job_writer', true)
        is distinct from old.id::text then
      raise exception 'identity_assistance_job_write_forbidden'
        using errcode = '42501';
    end if;

    if new.attempt_count < old.attempt_count then
      raise exception 'identity_assistance_job_attempt_decreased'
        using errcode = '42501';
    end if;

    old_was_actionable_success :=
      old.status = 'succeeded'::private.identity_assistance_job_status
      and old.selected_at is null
      and old.withdrawn_at is null
      and old.result_invalidated_at is null;

    if new.status is distinct from old.status
       and not (
         (
           old.status = 'requested'::private.identity_assistance_job_status
           and new.status in (
             'processing'::private.identity_assistance_job_status,
             'failed'::private.identity_assistance_job_status,
             'cancelled'::private.identity_assistance_job_status,
             'expired'::private.identity_assistance_job_status
           )
         )
         or (
           old.status = 'processing'::private.identity_assistance_job_status
           and new.status in (
             'requested'::private.identity_assistance_job_status,
             'succeeded'::private.identity_assistance_job_status,
             'failed'::private.identity_assistance_job_status,
             'cancelled'::private.identity_assistance_job_status
           )
         )
         or (
           old_was_actionable_success
           and new.status in (
             'cancelled'::private.identity_assistance_job_status,
             'expired'::private.identity_assistance_job_status
           )
         )
       ) then
      raise exception 'identity_assistance_job_transition_forbidden'
        using errcode = '42501';
    end if;
  end if;

  if binding_required then
    if new.requester_id is null
       or new.media_asset_id is null
       or new.input_sha256 is null then
      raise exception 'identity_assistance_job_binding_required'
        using errcode = '42501';
    end if;

    -- Future controlled writers take these locks before the identity-job row.
    -- Repeating the validation here prevents writer context from becoming an
    -- authorization or a non-null-only bypass for a privileged caller.
    select sightings.*
      into sighting_row
      from public.sightings as sightings
     where sightings.id = new.sighting_id
     for share;

    if not found then
      raise exception 'identity_assistance_job_binding_invalid'
        using errcode = '42501';
    end if;

    select pg_catalog.count(*)
      into upload_count
      from (
        select uploads.id
          from private.media_upload_jobs as uploads
         where uploads.media_asset_id = new.media_asset_id
         order by uploads.id
         for share
      ) as locked_uploads;

    if upload_count <> 1 then
      raise exception 'identity_assistance_job_binding_invalid'
        using errcode = '42501';
    end if;

    select uploads.*
      into upload_row
      from private.media_upload_jobs as uploads
     where uploads.media_asset_id = new.media_asset_id;

    select assets.*
      into media_row
      from public.media_assets as assets
     where assets.id = new.media_asset_id
     for share;

    if not found
       or sighting_row.reporter_id is distinct from new.requester_id
       or media_row.sighting_id is distinct from new.sighting_id
       or upload_row.sighting_id is distinct from new.sighting_id
       or media_row.uploader_id is distinct from new.requester_id
       or upload_row.uploader_id is distinct from new.requester_id
       or media_row.sha256 is distinct from new.input_sha256
       or upload_row.sha256 is distinct from new.input_sha256
       or media_row.recipe_version is distinct from new.recipe_version
       or upload_row.recipe_version is distinct from new.recipe_version
       or upload_row.status is distinct from 'finalized'::private.media_upload_job_status
       or upload_row.finalized_at is null
       or upload_row.media_asset_id is distinct from media_row.id
       or media_row.storage_bucket is distinct from 'media-staging'
       or media_row.deleted_at is not null
       or media_row.status is distinct from 'quarantined'
       or media_row.reviewed_at is null
       or media_row.storage_path is distinct from upload_row.object_path
       or media_row.client_media_id is distinct from upload_row.media_id
       or media_row.byte_length is distinct from upload_row.byte_length
       or media_row.width is distinct from upload_row.width
       or media_row.height is distinct from upload_row.height
       or media_row.detector_versions is distinct from upload_row.detector_versions then
      raise exception 'identity_assistance_job_binding_invalid'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.guard_identity_assistance_candidate_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  candidate_job_id uuid;
  candidate_job_status private.identity_assistance_job_status;
  candidate_animal_visibility public.record_visibility;
  candidate_animal_archived_at timestamptz;
begin
  if tg_op = 'UPDATE' then
    raise exception 'identity_assistance_candidate_update_forbidden'
      using errcode = '42501';
  end if;

  candidate_job_id := case when tg_op = 'DELETE' then old.job_id else new.job_id end;

  if pg_catalog.current_setting('private.identity_assistance_candidate_writer', true)
      is distinct from candidate_job_id::text then
    raise exception 'identity_assistance_candidate_write_forbidden'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- SHARE conflicts with both availability updates and deletion. Animal
    -- mutation triggers then lock jobs, so both paths are animal -> job.
    select animals.visibility, animals.archived_at
      into candidate_animal_visibility, candidate_animal_archived_at
      from public.animals as animals
     where animals.id = new.animal_id
     for share;

    if not found
       or candidate_animal_visibility in (
         'hidden'::public.record_visibility,
         'archived'::public.record_visibility
       )
       or candidate_animal_archived_at is not null then
      raise exception 'identity_assistance_candidate_unavailable'
        using errcode = '42501';
    end if;

    select jobs.status
      into candidate_job_status
      from private.identity_assistance_jobs as jobs
     where jobs.id = new.job_id;

    if candidate_job_status is distinct from 'processing'::private.identity_assistance_job_status then
      raise exception 'identity_assistance_candidate_job_not_processing'
        using errcode = '42501';
    end if;

    return new;
  end if;

  return old;
end;
$$;

create or replace function private.invalidate_identity_assistance_candidate_sets()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  affected_job record;
  invalidated_at timestamptz := pg_catalog.now();
  prior_job_writer text := pg_catalog.current_setting('private.identity_assistance_job_writer', true);
  prior_candidate_writer text := pg_catalog.current_setting('private.identity_assistance_candidate_writer', true);
begin
  if tg_op = 'UPDATE'
     and not (
       (
         new.visibility in ('hidden'::public.record_visibility, 'archived'::public.record_visibility)
         and old.visibility not in ('hidden'::public.record_visibility, 'archived'::public.record_visibility)
       )
       or (new.archived_at is not null and old.archived_at is null)
     ) then
    return new;
  end if;

  -- The triggering UPDATE/DELETE already holds the animal mutation lock. The
  -- candidate guard's conflicting SHARE lock therefore serializes before this
  -- post-lock scan and revalidation of every containing result set.
  for affected_job in
    select jobs.id, jobs.status
      from private.identity_assistance_jobs as jobs
     where exists (
       select 1
         from private.identity_assistance_candidates as candidates
        where candidates.job_id = jobs.id
          and candidates.animal_id = old.id
     )
     order by jobs.id
     for update of jobs
  loop
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
             else status
           end,
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
           cancelled_at = case
             when status in (
               'requested'::private.identity_assistance_job_status,
               'processing'::private.identity_assistance_job_status
             ) then coalesce(cancelled_at, invalidated_at)
             else cancelled_at
           end,
           withdrawn_at = coalesce(withdrawn_at, invalidated_at),
           result_invalidated_at = coalesce(result_invalidated_at, invalidated_at),
           updated_at = invalidated_at
     where id = affected_job.id;

    insert into private.identity_assistance_events (
      job_id, event_type, failure_code, reason_code, occurred_at
    ) values (
      affected_job.id, 'invalidated', 'source_invalidated',
      'source_invalidated', invalidated_at
    );
  end loop;

  perform pg_catalog.set_config(
    'private.identity_assistance_candidate_writer',
    coalesce(prior_candidate_writer, ''), true
  );
  perform pg_catalog.set_config(
    'private.identity_assistance_job_writer',
    coalesce(prior_job_writer, ''), true
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_identity_assistance_job_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_identity_assistance_candidate_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.invalidate_identity_assistance_candidate_sets()
  from public, anon, authenticated, service_role;

commit;
