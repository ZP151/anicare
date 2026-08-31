begin;

alter table private.identity_assistance_service_requests
  add column result_count integer
  check (result_count >= 0 and result_count <= 10);

create function public.service_claim_identity_assistance_jobs(
  p_worker_id text,
  p_limit integer,
  p_request_id uuid
)
returns table (
  "jobId" uuid,
  "mediaAssetId" uuid,
  "inputSha256" text,
  "recipeVersion" text,
  "cropContractVersion" text,
  "embeddingContractVersion" text,
  "identifyContractVersion" text,
  "leaseId" uuid,
  "leaseExpiresAt" timestamptz,
  "attempt" integer
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  payload_sha256 text;
  request_row private.identity_assistance_service_requests%rowtype;
  job_row private.identity_assistance_jobs%rowtype;
  prior_job_writer text :=
    pg_catalog.current_setting('private.identity_assistance_job_writer', true);
  expired_job_ids uuid[] := '{}'::uuid[];
  pool_job_ids uuid[] := '{}'::uuid[];
  pool_sighting_ids uuid[] := '{}'::uuid[];
  pool_media_ids uuid[] := '{}'::uuid[];
  claimed_job_ids uuid[] := '{}'::uuid[];
  claimed_lease_ids uuid[] := '{}'::uuid[];
  claimed_lease_expires_at timestamptz[] := '{}'::timestamptz[];
  claimed_attempts integer[] := '{}'::integer[];
  claimed_count integer := 0;
  replay_count integer;
  ordinal integer;
  canonical_source boolean;
  authoritative_now timestamptz;
  processing_now timestamptz;
  new_lease_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_worker_id is null
     or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     or p_limit is null
     or p_limit not between 1 and 10
     or p_request_id is null then
    raise exception 'invalid_identity_assistance_claim' using errcode = '22023';
  end if;

  payload_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'operation', 'claim',
          'workerId', p_worker_id,
          'limit', p_limit
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'identity-assistance-service:' || p_request_id::text,
      0
    )
  );

  select requests.*
    into request_row
    from private.identity_assistance_service_requests as requests
   where requests.request_id = p_request_id;

  if found then
    if request_row.operation is distinct from 'claim'
       or request_row.payload_sha256 is distinct from payload_sha256 then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;

    if request_row.result_count is null then
      raise exception 'identity_assistance_claim_outcome_unavailable'
        using errcode = 'P0001';
    end if;

    select pg_catalog.count(*)
      into replay_count
      from private.identity_assistance_claim_results as results
     where results.request_id = p_request_id;

    if replay_count <> request_row.result_count
       or exists (
         select 1
           from private.identity_assistance_claim_results as results
           left join private.identity_assistance_jobs as jobs
             on jobs.id = results.job_id
          where results.request_id = p_request_id
            and (
              jobs.id is null
              or jobs.media_asset_id is null
              or jobs.input_sha256 is null
              or jobs.recipe_version is null
              or jobs.crop_contract_version is null
              or jobs.embedding_contract_version is null
              or jobs.identify_contract_version is null
              or (
                select pg_catalog.count(*)
                  from private.media_upload_jobs as uploads
                 where uploads.media_asset_id = jobs.media_asset_id
              ) <> 1
              or not exists (
                select 1
                  from public.sightings as sightings
                  join public.media_assets as assets
                    on assets.id = jobs.media_asset_id
                   and assets.sighting_id = sightings.id
                  join private.media_upload_jobs as uploads
                    on uploads.media_asset_id = assets.id
                 where sightings.id = jobs.sighting_id
                   and sightings.reporter_id = jobs.requester_id
                   and assets.uploader_id = jobs.requester_id
                   and uploads.uploader_id = jobs.requester_id
                   and uploads.sighting_id = jobs.sighting_id
                   and assets.sha256 = jobs.input_sha256
                   and uploads.sha256 = jobs.input_sha256
                   and assets.recipe_version = jobs.recipe_version
                   and uploads.recipe_version = jobs.recipe_version
                   and uploads.status = 'finalized'::private.media_upload_job_status
                   and uploads.finalized_at is not null
                   and assets.storage_bucket = 'media-staging'
                   and assets.deleted_at is null
                   and assets.status = 'quarantined'
                   and assets.reviewed_at is not null
                   and assets.storage_path = uploads.object_path
                   and assets.client_media_id = uploads.media_id
                   and assets.byte_length = uploads.byte_length
                   and assets.width = uploads.width
                   and assets.height = uploads.height
                   and assets.detector_versions = uploads.detector_versions
              )
            )
       ) then
      raise exception 'identity_assistance_claim_outcome_unavailable'
        using errcode = 'P0001';
    end if;

    return query
    select jobs.id,
           jobs.media_asset_id,
           jobs.input_sha256,
           jobs.recipe_version,
           jobs.crop_contract_version,
           jobs.embedding_contract_version,
           jobs.identify_contract_version,
           results.lease_id,
           results.lease_expires_at,
           results.attempt
      from private.identity_assistance_claim_results as results
      join private.identity_assistance_jobs as jobs on jobs.id = results.job_id
     where results.request_id = p_request_id
     order by results.ordinal;
    return;
  end if;

  with expired_pool as (
    select jobs.id, jobs.sighting_id, jobs.media_asset_id
      from private.identity_assistance_jobs as jobs
     where jobs.status = 'processing'::private.identity_assistance_job_status
       and jobs.lease_expires_at <= pg_catalog.clock_timestamp()
     order by jobs.lease_expires_at, jobs.id
     limit 50
  ), requested_pool as (
    select jobs.id, jobs.sighting_id, jobs.media_asset_id
      from private.identity_assistance_jobs as jobs
     where jobs.status = 'requested'::private.identity_assistance_job_status
       and jobs.attempt_count < 3
     order by jobs.requested_at, jobs.id
     limit 50
  ), pool as (
    select * from expired_pool
    union all
    select * from requested_pool
  )
  select coalesce(
           pg_catalog.array_agg(pool.id order by pool.id), '{}'::uuid[]
         ),
         coalesce(
           pg_catalog.array_agg(distinct pool.sighting_id), '{}'::uuid[]
         ),
         coalesce(
           pg_catalog.array_agg(distinct pool.media_asset_id)
             filter (where pool.media_asset_id is not null),
           '{}'::uuid[]
         ),
         coalesce(
           pg_catalog.array_agg(expired_pool.id order by expired_pool.id),
           '{}'::uuid[]
         )
    into pool_job_ids, pool_sighting_ids, pool_media_ids, expired_job_ids
    from pool
    left join expired_pool on expired_pool.id = pool.id;

  perform 1
    from public.sightings as sightings
   where sightings.id = any(pool_sighting_ids)
   order by sightings.id
   for update;
  perform 1
    from private.media_upload_jobs as uploads
   where uploads.media_asset_id = any(pool_media_ids)
   order by uploads.id
   for update;
  perform 1
    from public.media_assets as assets
   where assets.id = any(pool_media_ids)
   order by assets.id
   for update;

  for job_row in
    select jobs.*
      from private.identity_assistance_jobs as jobs
     where jobs.id = any(expired_job_ids)
       and jobs.status = 'processing'::private.identity_assistance_job_status
     order by jobs.id
     for update of jobs skip locked
  loop
    authoritative_now := pg_catalog.clock_timestamp();
    select (
      (select pg_catalog.count(*)
         from private.media_upload_jobs as uploads
        where uploads.media_asset_id = job_row.media_asset_id) = 1
      and exists (
        select 1
          from public.sightings as sightings
          join public.media_assets as assets
            on assets.id = job_row.media_asset_id
           and assets.sighting_id = sightings.id
          join private.media_upload_jobs as uploads
            on uploads.media_asset_id = assets.id
         where sightings.id = job_row.sighting_id
           and sightings.reporter_id = job_row.requester_id
           and assets.uploader_id = job_row.requester_id
           and uploads.uploader_id = job_row.requester_id
           and uploads.sighting_id = job_row.sighting_id
           and assets.sha256 = job_row.input_sha256
           and uploads.sha256 = job_row.input_sha256
           and assets.recipe_version = job_row.recipe_version
           and uploads.recipe_version = job_row.recipe_version
           and uploads.status = 'finalized'::private.media_upload_job_status
           and uploads.finalized_at is not null
           and assets.storage_bucket = 'media-staging'
           and assets.deleted_at is null
           and assets.status = 'quarantined'
           and assets.reviewed_at is not null
           and assets.storage_path = uploads.object_path
           and assets.client_media_id = uploads.media_id
           and assets.byte_length = uploads.byte_length
           and assets.width = uploads.width
           and assets.height = uploads.height
           and assets.detector_versions = uploads.detector_versions
      )
    ) into canonical_source;

    if canonical_source
       and job_row.lease_expires_at <= authoritative_now then
      perform pg_catalog.set_config(
        'private.identity_assistance_job_writer', job_row.id::text, true
      );
      if job_row.attempt_count < 3 then
        update private.identity_assistance_jobs as jobs
           set status = 'requested',
               lease_id = null,
               lease_expires_at = null,
               processing_at = null,
               updated_at = authoritative_now
         where jobs.id = job_row.id;
        insert into private.identity_assistance_events (
          job_id, request_id, event_type, failure_code, reason_code, occurred_at
        ) values (
          job_row.id, p_request_id, 'retry_released', 'lease_expired',
          'lease_expired', authoritative_now
        );
      else
        update private.identity_assistance_jobs as jobs
           set status = 'failed',
               lease_id = null,
               lease_expires_at = null,
               processing_at = null,
               failed_at = authoritative_now,
               failure_code = 'lease_expired',
               updated_at = authoritative_now
         where jobs.id = job_row.id;
        insert into private.identity_assistance_events (
          job_id, request_id, event_type, failure_code, reason_code, occurred_at
        ) values (
          job_row.id, p_request_id, 'failed', 'lease_expired',
          'lease_expired', authoritative_now
        );
      end if;
      perform pg_catalog.set_config(
        'private.identity_assistance_job_writer',
        coalesce(prior_job_writer, ''), true
      );
    end if;
  end loop;

  processing_now := pg_catalog.clock_timestamp();
  for job_row in
    select jobs.*
      from private.identity_assistance_jobs as jobs
     where jobs.id = any(pool_job_ids)
       and jobs.status = 'requested'::private.identity_assistance_job_status
       and jobs.attempt_count < 3
     order by jobs.requested_at, jobs.id
     limit p_limit
     for update of jobs skip locked
  loop
    select (
      (select pg_catalog.count(*)
         from private.media_upload_jobs as uploads
        where uploads.media_asset_id = job_row.media_asset_id) = 1
      and exists (
        select 1
          from public.sightings as sightings
          join public.media_assets as assets
            on assets.id = job_row.media_asset_id
           and assets.sighting_id = sightings.id
          join private.media_upload_jobs as uploads
            on uploads.media_asset_id = assets.id
         where sightings.id = job_row.sighting_id
           and sightings.reporter_id = job_row.requester_id
           and assets.uploader_id = job_row.requester_id
           and uploads.uploader_id = job_row.requester_id
           and uploads.sighting_id = job_row.sighting_id
           and assets.sha256 = job_row.input_sha256
           and uploads.sha256 = job_row.input_sha256
           and assets.recipe_version = job_row.recipe_version
           and uploads.recipe_version = job_row.recipe_version
           and uploads.status = 'finalized'::private.media_upload_job_status
           and uploads.finalized_at is not null
           and assets.storage_bucket = 'media-staging'
           and assets.deleted_at is null
           and assets.status = 'quarantined'
           and assets.reviewed_at is not null
           and assets.storage_path = uploads.object_path
           and assets.client_media_id = uploads.media_id
           and assets.byte_length = uploads.byte_length
           and assets.width = uploads.width
           and assets.height = uploads.height
           and assets.detector_versions = uploads.detector_versions
      )
    ) into canonical_source;

    if canonical_source then
      new_lease_id := extensions.gen_random_uuid();
      perform pg_catalog.set_config(
        'private.identity_assistance_job_writer', job_row.id::text, true
      );
      update private.identity_assistance_jobs as jobs
         set status = 'processing',
             attempt_count = jobs.attempt_count + 1,
             lease_id = new_lease_id,
             lease_expires_at = processing_now + interval '2 minutes',
             processing_at = processing_now,
             updated_at = processing_now
       where jobs.id = job_row.id;
      perform pg_catalog.set_config(
        'private.identity_assistance_job_writer',
        coalesce(prior_job_writer, ''), true
      );

      insert into private.identity_assistance_events (
        job_id, request_id, event_type, occurred_at
      ) values (job_row.id, p_request_id, 'claimed', processing_now);

      claimed_job_ids := pg_catalog.array_append(claimed_job_ids, job_row.id);
      claimed_lease_ids := pg_catalog.array_append(
        claimed_lease_ids, new_lease_id
      );
      claimed_lease_expires_at := pg_catalog.array_append(
        claimed_lease_expires_at, processing_now + interval '2 minutes'
      );
      claimed_attempts := pg_catalog.array_append(
        claimed_attempts, job_row.attempt_count + 1
      );
    end if;
  end loop;

  claimed_count := pg_catalog.cardinality(claimed_job_ids);
  insert into private.identity_assistance_service_requests (
    request_id, payload_sha256, operation, result_count
  ) values (p_request_id, payload_sha256, 'claim', claimed_count);

  if claimed_count > 0 then
    for ordinal in 1..claimed_count loop
      insert into private.identity_assistance_claim_results (
        request_id, ordinal, job_id, lease_id, attempt, lease_expires_at,
        created_at
      ) values (
        p_request_id, ordinal, claimed_job_ids[ordinal],
        claimed_lease_ids[ordinal], claimed_attempts[ordinal],
        claimed_lease_expires_at[ordinal], processing_now
      );
    end loop;
  end if;

  return query
  select jobs.id,
         jobs.media_asset_id,
         jobs.input_sha256,
         jobs.recipe_version,
         jobs.crop_contract_version,
         jobs.embedding_contract_version,
         jobs.identify_contract_version,
         results.lease_id,
         results.lease_expires_at,
         results.attempt
    from private.identity_assistance_claim_results as results
    join private.identity_assistance_jobs as jobs on jobs.id = results.job_id
   where results.request_id = p_request_id
   order by results.ordinal;
  return;
exception
  when others then
    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer',
      coalesce(prior_job_writer, ''), true
    );
    raise;
end;
$$;

create function public.service_fail_identity_assistance_job(
  p_job_id uuid,
  p_lease_id uuid,
  p_attempt integer,
  p_failure_code text,
  p_retryable boolean,
  p_request_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  payload_sha256 text;
  request_row private.identity_assistance_service_requests%rowtype;
  job_row private.identity_assistance_jobs%rowtype;
  discovered_sighting_id uuid;
  discovered_media_id uuid;
  prior_job_writer text :=
    pg_catalog.current_setting('private.identity_assistance_job_writer', true);
  canonical_source boolean;
  authoritative_now timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_job_id is null
     or p_lease_id is null
     or p_attempt is null
     or p_attempt not between 1 and 3
     or p_failure_code is null
     or p_failure_code not in (
       'invalid_input', 'provider_unavailable', 'quality_rejected', 'internal_error'
     )
     or p_retryable is null
     or (p_failure_code in ('invalid_input', 'quality_rejected') and p_retryable)
     or p_request_id is null then
    raise exception 'invalid_identity_assistance_failure' using errcode = '22023';
  end if;

  payload_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'operation', 'fail',
          'jobId', p_job_id,
          'leaseId', p_lease_id,
          'attempt', p_attempt,
          'failureCode', p_failure_code,
          'retryable', p_retryable
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'identity-assistance-service:' || p_request_id::text,
      0
    )
  );
  select requests.*
    into request_row
    from private.identity_assistance_service_requests as requests
   where requests.request_id = p_request_id;
  if found then
    if request_row.operation is distinct from 'fail'
       or request_row.payload_sha256 is distinct from payload_sha256 then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return;
  end if;

  select jobs.sighting_id, jobs.media_asset_id
    into discovered_sighting_id, discovered_media_id
    from private.identity_assistance_jobs as jobs
   where jobs.id = p_job_id;

  perform 1
    from public.sightings as sightings
   where sightings.id = discovered_sighting_id
   for update;
  perform 1
    from private.media_upload_jobs as uploads
   where uploads.media_asset_id = discovered_media_id
   order by uploads.id
   for update;
  perform 1
    from public.media_assets as assets
   where assets.id = discovered_media_id
   for update;
  select jobs.*
    into job_row
    from private.identity_assistance_jobs as jobs
   where jobs.id = p_job_id
   for update;

  authoritative_now := pg_catalog.clock_timestamp();
  if not found
     or job_row.status is distinct from 'processing'::private.identity_assistance_job_status
     or job_row.lease_id is distinct from p_lease_id
     or job_row.attempt_count is distinct from p_attempt
     or job_row.lease_expires_at is null
     or job_row.lease_expires_at <= authoritative_now then
    raise exception 'identity_assistance_lease_not_current' using errcode = 'P0001';
  end if;

  select (
    (select pg_catalog.count(*)
       from private.media_upload_jobs as uploads
      where uploads.media_asset_id = job_row.media_asset_id) = 1
    and exists (
      select 1
        from public.sightings as sightings
        join public.media_assets as assets
          on assets.id = job_row.media_asset_id
         and assets.sighting_id = sightings.id
        join private.media_upload_jobs as uploads
          on uploads.media_asset_id = assets.id
       where sightings.id = job_row.sighting_id
         and sightings.reporter_id = job_row.requester_id
         and assets.uploader_id = job_row.requester_id
         and uploads.uploader_id = job_row.requester_id
         and uploads.sighting_id = job_row.sighting_id
         and assets.sha256 = job_row.input_sha256
         and uploads.sha256 = job_row.input_sha256
         and assets.recipe_version = job_row.recipe_version
         and uploads.recipe_version = job_row.recipe_version
         and uploads.status = 'finalized'::private.media_upload_job_status
         and uploads.finalized_at is not null
         and assets.storage_bucket = 'media-staging'
         and assets.deleted_at is null
         and assets.status = 'quarantined'
         and assets.reviewed_at is not null
         and assets.storage_path = uploads.object_path
         and assets.client_media_id = uploads.media_id
         and assets.byte_length = uploads.byte_length
         and assets.width = uploads.width
         and assets.height = uploads.height
         and assets.detector_versions = uploads.detector_versions
    )
  ) into canonical_source;
  if not canonical_source then
    raise exception 'identity_assistance_lease_not_current' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config(
    'private.identity_assistance_job_writer', job_row.id::text, true
  );
  if p_retryable and p_attempt < 3 then
    update private.identity_assistance_jobs as jobs
       set status = 'requested',
           lease_id = null,
           lease_expires_at = null,
           processing_at = null,
           updated_at = authoritative_now
     where jobs.id = job_row.id;
    insert into private.identity_assistance_events (
      job_id, request_id, event_type, failure_code, occurred_at
    ) values (
      job_row.id, p_request_id, 'retry_released',
      p_failure_code::private.identity_assistance_failure_code,
      authoritative_now
    );
  else
    update private.identity_assistance_jobs as jobs
       set status = 'failed',
           lease_id = null,
           lease_expires_at = null,
           processing_at = null,
           failed_at = authoritative_now,
           failure_code = p_failure_code::private.identity_assistance_failure_code,
           updated_at = authoritative_now
     where jobs.id = job_row.id;
    insert into private.identity_assistance_events (
      job_id, request_id, event_type, failure_code, occurred_at
    ) values (
      job_row.id, p_request_id, 'failed',
      p_failure_code::private.identity_assistance_failure_code,
      authoritative_now
    );
  end if;
  perform pg_catalog.set_config(
    'private.identity_assistance_job_writer',
    coalesce(prior_job_writer, ''), true
  );

  insert into private.identity_assistance_service_requests (
    request_id, payload_sha256, operation, job_id
  ) values (p_request_id, payload_sha256, 'fail', p_job_id);
exception
  when others then
    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer',
      coalesce(prior_job_writer, ''), true
    );
    raise;
end;
$$;

create function public.service_cleanup_identity_assistance(
  p_batch_size integer,
  p_cutoff_time timestamptz,
  p_request_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  payload_sha256 text;
  request_row private.identity_assistance_service_requests%rowtype;
  cleanup_row record;
  discovered_job_ids uuid[] := '{}'::uuid[];
  discovered_sighting_ids uuid[] := '{}'::uuid[];
  discovered_media_ids uuid[] := '{}'::uuid[];
  locked_job_ids uuid[] := '{}'::uuid[];
  prior_job_writer text :=
    pg_catalog.current_setting('private.identity_assistance_job_writer', true);
  prior_candidate_writer text :=
    pg_catalog.current_setting('private.identity_assistance_candidate_writer', true);
  prior_job_deleter text :=
    pg_catalog.current_setting('private.identity_assistance_job_deleter', true);
  authoritative_now timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_batch_size is null
     or p_batch_size not between 1 and 50
     or p_cutoff_time is null
     or p_request_id is null then
    raise exception 'invalid_identity_assistance_cleanup' using errcode = '22023';
  end if;

  payload_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'operation', 'cleanup',
          'batchSize', p_batch_size,
          'cutoffTime', p_cutoff_time
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'identity-assistance-service:' || p_request_id::text,
      0
    )
  );
  authoritative_now := pg_catalog.clock_timestamp();
  if p_cutoff_time > authoritative_now then
    raise exception 'invalid_identity_assistance_cleanup' using errcode = '22023';
  end if;

  select requests.*
    into request_row
    from private.identity_assistance_service_requests as requests
   where requests.request_id = p_request_id;
  if found then
    if request_row.operation is distinct from 'cleanup'
       or request_row.payload_sha256 is distinct from payload_sha256 then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return;
  end if;

  insert into private.identity_assistance_service_requests (
    request_id, payload_sha256, operation
  ) values (p_request_id, payload_sha256, 'cleanup');

  with eligible as (
    select jobs.id, jobs.sighting_id, jobs.media_asset_id,
           pg_catalog.greatest(
             jobs.expires_at, jobs.completed_at + interval '7 days'
           ) as retention_anchor
      from private.identity_assistance_jobs as jobs
     where jobs.status = 'succeeded'::private.identity_assistance_job_status
       and jobs.selected_at is null
       and jobs.withdrawn_at is null
       and jobs.result_invalidated_at is null
       and jobs.expires_at is not null
       and jobs.expires_at <= p_cutoff_time
       and jobs.completed_at + interval '7 days' <= p_cutoff_time
       and not exists (
         select 1
           from private.identity_proposal_evidence as evidence
          where evidence.job_id = jobs.id
       )
    union all
    select jobs.id, jobs.sighting_id, jobs.media_asset_id,
           case jobs.status
             when 'failed'::private.identity_assistance_job_status
               then jobs.failed_at
             when 'cancelled'::private.identity_assistance_job_status
               then jobs.cancelled_at
             when 'expired'::private.identity_assistance_job_status
               then jobs.expires_at
           end as retention_anchor
      from private.identity_assistance_jobs as jobs
     where jobs.status in (
       'failed'::private.identity_assistance_job_status,
       'cancelled'::private.identity_assistance_job_status,
       'expired'::private.identity_assistance_job_status
     )
       and jobs.selected_at is null
       and case jobs.status
             when 'failed'::private.identity_assistance_job_status
               then jobs.failed_at
             when 'cancelled'::private.identity_assistance_job_status
               then jobs.cancelled_at
             when 'expired'::private.identity_assistance_job_status
               then jobs.expires_at
           end is not null
       and case jobs.status
             when 'failed'::private.identity_assistance_job_status
               then jobs.failed_at
             when 'cancelled'::private.identity_assistance_job_status
               then jobs.cancelled_at
             when 'expired'::private.identity_assistance_job_status
               then jobs.expires_at
           end + interval '30 days' <= p_cutoff_time
       and not exists (
         select 1
           from private.identity_proposal_evidence as evidence
          where evidence.job_id = jobs.id
       )
  ), batch as (
    select eligible.*
      from eligible
     order by eligible.retention_anchor, eligible.id
     limit p_batch_size
  )
  select coalesce(
           pg_catalog.array_agg(batch.id order by batch.id), '{}'::uuid[]
         ),
         coalesce(
           pg_catalog.array_agg(distinct batch.sighting_id), '{}'::uuid[]
         ),
         coalesce(
           pg_catalog.array_agg(distinct batch.media_asset_id)
             filter (where batch.media_asset_id is not null),
           '{}'::uuid[]
         )
    into discovered_job_ids, discovered_sighting_ids, discovered_media_ids
    from batch;

  perform 1
    from public.sightings as sightings
   where sightings.id = any(discovered_sighting_ids)
   order by sightings.id
   for update;
  perform 1
    from private.media_upload_jobs as uploads
   where uploads.media_asset_id = any(discovered_media_ids)
   order by uploads.id
   for update;
  perform 1
    from public.media_assets as assets
   where assets.id = any(discovered_media_ids)
   order by assets.id
   for update;
  select coalesce(
           pg_catalog.array_agg(locked.id order by locked.id), '{}'::uuid[]
         )
    into locked_job_ids
    from (
      select jobs.id
        from private.identity_assistance_jobs as jobs
       where jobs.id = any(discovered_job_ids)
       order by jobs.id
       for update of jobs skip locked
    ) as locked;

  for cleanup_row in
    with eligible as (
      select jobs.id, 'expire'::text as action,
             pg_catalog.greatest(
               jobs.expires_at, jobs.completed_at + interval '7 days'
             ) as retention_anchor
        from private.identity_assistance_jobs as jobs
       where jobs.id = any(locked_job_ids)
         and jobs.status = 'succeeded'::private.identity_assistance_job_status
         and jobs.selected_at is null
         and jobs.withdrawn_at is null
         and jobs.result_invalidated_at is null
         and jobs.expires_at is not null
         and jobs.expires_at <= p_cutoff_time
         and jobs.completed_at + interval '7 days' <= p_cutoff_time
         and not exists (
           select 1
             from private.identity_proposal_evidence as evidence
            where evidence.job_id = jobs.id
         )
      union all
      select jobs.id, 'delete'::text as action,
             case jobs.status
               when 'failed'::private.identity_assistance_job_status
                 then jobs.failed_at
               when 'cancelled'::private.identity_assistance_job_status
                 then jobs.cancelled_at
               when 'expired'::private.identity_assistance_job_status
                 then jobs.expires_at
             end as retention_anchor
        from private.identity_assistance_jobs as jobs
       where jobs.id = any(locked_job_ids)
         and jobs.status in (
           'failed'::private.identity_assistance_job_status,
           'cancelled'::private.identity_assistance_job_status,
           'expired'::private.identity_assistance_job_status
         )
         and jobs.selected_at is null
         and case jobs.status
               when 'failed'::private.identity_assistance_job_status
                 then jobs.failed_at
               when 'cancelled'::private.identity_assistance_job_status
                 then jobs.cancelled_at
               when 'expired'::private.identity_assistance_job_status
                 then jobs.expires_at
             end is not null
         and case jobs.status
               when 'failed'::private.identity_assistance_job_status
                 then jobs.failed_at
               when 'cancelled'::private.identity_assistance_job_status
                 then jobs.cancelled_at
               when 'expired'::private.identity_assistance_job_status
                 then jobs.expires_at
             end + interval '30 days' <= p_cutoff_time
         and not exists (
           select 1
             from private.identity_proposal_evidence as evidence
            where evidence.job_id = jobs.id
         )
    )
    select eligible.*
      from eligible
     order by eligible.retention_anchor, eligible.id
  loop
    perform pg_catalog.set_config(
      'private.identity_assistance_candidate_writer',
      cleanup_row.id::text, true
    );
    delete from private.identity_assistance_candidates as candidates
     where candidates.job_id = cleanup_row.id;

    if cleanup_row.action = 'expire' then
      perform pg_catalog.set_config(
        'private.identity_assistance_job_writer', cleanup_row.id::text, true
      );
      update private.identity_assistance_jobs as jobs
         set status = 'expired',
             media_asset_id = null,
             requester_id = null,
             input_sha256 = null,
             withdrawn_at = coalesce(jobs.withdrawn_at, authoritative_now),
             updated_at = authoritative_now
       where jobs.id = cleanup_row.id;
      insert into private.identity_assistance_events (
        job_id, request_id, event_type, reason_code, occurred_at
      ) values (
        cleanup_row.id, p_request_id, 'expired',
        'retention_window_elapsed', authoritative_now
      );
    else
      delete from private.identity_assistance_requests as requests
       where requests.job_id = cleanup_row.id;
      delete from private.identity_assistance_status_reads as reads
       where reads.job_id = cleanup_row.id;
      delete from private.identity_assistance_service_requests as requests
       where requests.request_id <> p_request_id
         and (
           requests.job_id = cleanup_row.id
           or exists (
             select 1
               from private.identity_assistance_claim_results as results
              where results.request_id = requests.request_id
                and results.job_id = cleanup_row.id
           )
         );
      insert into private.identity_assistance_events (
        job_id, request_id, event_type, reason_code, occurred_at
      ) values (
        cleanup_row.id, p_request_id, 'cleaned',
        'operational_retention_elapsed', authoritative_now
      );
      perform pg_catalog.set_config(
        'private.identity_assistance_job_deleter', cleanup_row.id::text, true
      );
      delete from private.identity_assistance_jobs as jobs
       where jobs.id = cleanup_row.id;
    end if;

    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer',
      coalesce(prior_job_writer, ''), true
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_candidate_writer',
      coalesce(prior_candidate_writer, ''), true
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_job_deleter',
      coalesce(prior_job_deleter, ''), true
    );
  end loop;
exception
  when others then
    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer',
      coalesce(prior_job_writer, ''), true
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_candidate_writer',
      coalesce(prior_candidate_writer, ''), true
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_job_deleter',
      coalesce(prior_job_deleter, ''), true
    );
    raise;
end;
$$;

revoke all on function public.service_claim_identity_assistance_jobs(text, integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.service_fail_identity_assistance_job(
  uuid, uuid, integer, text, boolean, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.service_cleanup_identity_assistance(
  integer, timestamptz, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.service_claim_identity_assistance_jobs(
  text, integer, uuid
) to service_role;
grant execute on function public.service_fail_identity_assistance_job(
  uuid, uuid, integer, text, boolean, uuid
) to service_role;
grant execute on function public.service_cleanup_identity_assistance(
  integer, timestamptz, uuid
) to service_role;

commit;
