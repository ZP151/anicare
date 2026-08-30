begin;

create table private.identity_assistance_claim_results (
  request_id uuid not null references private.identity_assistance_service_requests(request_id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 10),
  job_id uuid not null references private.identity_assistance_jobs(id) on delete cascade,
  lease_id uuid not null,
  attempt integer not null check (attempt between 1 and 3),
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (request_id, ordinal),
  unique (request_id, job_id),
  check (lease_expires_at > created_at)
);
alter table private.identity_assistance_claim_results enable row level security;
revoke all on table private.identity_assistance_claim_results
  from public, anon, authenticated, service_role;

create function private.guard_identity_assistance_job_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  cleanup_allows_binding_clear boolean;
  old_was_actionable_success boolean;
begin
  if tg_op = 'INSERT' then
    if (
      new.status = 'processing'::private.identity_assistance_job_status
      or (
        new.status = 'succeeded'::private.identity_assistance_job_status
        and new.selected_at is null
        and new.withdrawn_at is null
        and new.result_invalidated_at is null
      )
    ) and (
      new.requester_id is null
      or new.media_asset_id is null
      or new.input_sha256 is null
    ) then
      raise exception 'identity_assistance_job_binding_required'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if pg_catalog.current_setting('private.identity_assistance_job_deleter', true)
        is distinct from old.id::text then
      raise exception 'identity_assistance_job_delete_forbidden'
        using errcode = '42501';
    end if;

    return old;
  end if;

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

  old_was_actionable_success :=
    old.status = 'succeeded'::private.identity_assistance_job_status
    and old.selected_at is null
    and old.withdrawn_at is null
    and old.result_invalidated_at is null;

  if old.status = 'succeeded'::private.identity_assistance_job_status
     and (
       (
         new.status = 'succeeded'::private.identity_assistance_job_status
         and (
           new.model_version is distinct from old.model_version
           or new.callback_contract_version is distinct from old.callback_contract_version
           or new.new_cat_recommended is distinct from old.new_cat_recommended
           or new.completed_at is distinct from old.completed_at
         )
       )
       or (
         new.status in (
           'cancelled'::private.identity_assistance_job_status,
           'expired'::private.identity_assistance_job_status
         )
         and (
           new.model_version is not null
           or new.callback_contract_version is not null
           or new.new_cat_recommended is not null
           or new.completed_at is not null
         )
       )
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

  if new.status is distinct from old.status
     and not (
       (old.status = 'requested'::private.identity_assistance_job_status
        and new.status = 'processing'::private.identity_assistance_job_status)
       or
       (old.status = 'processing'::private.identity_assistance_job_status
        and new.status in (
          'requested'::private.identity_assistance_job_status,
          'succeeded'::private.identity_assistance_job_status,
          'failed'::private.identity_assistance_job_status,
          'cancelled'::private.identity_assistance_job_status
        ))
       or
       (old_was_actionable_success
        and new.status in (
          'cancelled'::private.identity_assistance_job_status,
          'expired'::private.identity_assistance_job_status
        ))
     ) then
    raise exception 'identity_assistance_job_transition_forbidden'
      using errcode = '42501';
  end if;

  if (
    new.status = 'processing'::private.identity_assistance_job_status
    or (
      new.status = 'succeeded'::private.identity_assistance_job_status
      and new.selected_at is null
      and new.withdrawn_at is null
      and new.result_invalidated_at is null
    )
  ) and (
    new.requester_id is null
    or new.media_asset_id is null
    or new.input_sha256 is null
  ) then
    raise exception 'identity_assistance_job_binding_required'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_identity_assistance_job_mutation
before insert or update or delete on private.identity_assistance_jobs
for each row execute function private.guard_identity_assistance_job_mutation();

create function private.guard_identity_assistance_candidate_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  candidate_job_id uuid;
  candidate_job_status private.identity_assistance_job_status;
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

create trigger guard_identity_assistance_candidate_mutation
before insert or update or delete on private.identity_assistance_candidates
for each row execute function private.guard_identity_assistance_candidate_mutation();

create function private.invalidate_identity_assistance_candidate_sets()
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
             ) then pg_catalog.coalesce(cancelled_at, invalidated_at)
             else cancelled_at
           end,
           withdrawn_at = pg_catalog.coalesce(withdrawn_at, invalidated_at),
           result_invalidated_at = pg_catalog.coalesce(result_invalidated_at, invalidated_at),
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
    pg_catalog.coalesce(prior_candidate_writer, ''), true
  );
  perform pg_catalog.set_config(
    'private.identity_assistance_job_writer',
    pg_catalog.coalesce(prior_job_writer, ''), true
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger invalidate_identity_assistance_candidate_sets
before update of visibility, archived_at or delete on public.animals
for each row execute function private.invalidate_identity_assistance_candidate_sets();

revoke all on function private.guard_identity_assistance_job_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_identity_assistance_candidate_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.invalidate_identity_assistance_candidate_sets()
  from public, anon, authenticated, service_role;

commit;
