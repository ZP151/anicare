begin;

create function private.is_valid_identity_assistance_candidate_payload(
  p_candidates jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  candidate jsonb;
  reason_code text;
  candidate_id uuid;
  candidate_ids uuid[] := '{}'::uuid[];
  reason_codes text[];
begin
  if p_candidates is null
     or pg_catalog.jsonb_typeof(p_candidates) <> 'array'
     or pg_catalog.jsonb_array_length(p_candidates) > 3 then
    return false;
  end if;

  for candidate in
    select entries.value
      from pg_catalog.jsonb_array_elements(p_candidates) as entries(value)
  loop
    if pg_catalog.jsonb_typeof(candidate) <> 'object'
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(candidate)) <> 3
       or not (candidate ? 'animalId')
       or not (candidate ? 'confidenceBand')
       or not (candidate ? 'reasonCodes')
       or pg_catalog.jsonb_typeof(candidate -> 'animalId') <> 'string'
       or pg_catalog.jsonb_typeof(candidate -> 'confidenceBand') <> 'string'
       or pg_catalog.jsonb_typeof(candidate -> 'reasonCodes') <> 'array' then
      return false;
    end if;

    if candidate ->> 'animalId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or candidate ->> 'confidenceBand' not in ('likely', 'possible', 'weak')
       or pg_catalog.jsonb_array_length(candidate -> 'reasonCodes') not between 1 and 4 then
      return false;
    end if;

    candidate_id := (candidate ->> 'animalId')::uuid;
    if candidate_id = any(candidate_ids) then
      return false;
    end if;
    candidate_ids := pg_catalog.array_append(candidate_ids, candidate_id);

    select pg_catalog.coalesce(
             pg_catalog.array_agg(reasons.value order by reasons.ordinal),
             '{}'::text[]
           )
      into reason_codes
      from pg_catalog.jsonb_array_elements_text(candidate -> 'reasonCodes')
           with ordinality as reasons(value, ordinal);

    if pg_catalog.cardinality(reason_codes) not between 1 and 4
       or pg_catalog.cardinality(
            array(select distinct reason from pg_catalog.unnest(reason_codes) as values(reason))
          ) <> pg_catalog.cardinality(reason_codes) then
      return false;
    end if;

    foreach reason_code in array reason_codes loop
      if reason_code not in (
        'face_pattern_similar', 'ear_shape_similar', 'coat_marking_similar',
        'view_angle_limited', 'image_quality_limited'
      ) then
        return false;
      end if;
    end loop;
  end loop;

  return true;
end;
$$;

create function public.service_complete_identity_assistance_job(
  p_job_id uuid,
  p_lease_id uuid,
  p_attempt integer,
  p_callback_contract_version text,
  p_model_version text,
  p_candidates jsonb,
  p_new_cat_recommended boolean,
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
  candidate_ids uuid[] := '{}'::uuid[];
  available_candidate_count integer;
  existing_candidate_count integer;
  upload_count integer;
  canonical_source boolean;
  authoritative_now timestamptz;
  prior_job_writer text :=
    pg_catalog.current_setting('private.identity_assistance_job_writer', true);
  prior_candidate_writer text :=
    pg_catalog.current_setting('private.identity_assistance_candidate_writer', true);
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_job_id is null
     or p_lease_id is null
     or p_attempt is null
     or p_attempt not between 1 and 3
     or p_callback_contract_version is null
     or p_callback_contract_version <> 'identify-callback.v1'
     or p_model_version is null
     or p_model_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
     or p_new_cat_recommended is null
     or p_request_id is null
     or not private.is_valid_identity_assistance_candidate_payload(p_candidates) then
    raise exception 'invalid_identity_assistance_completion' using errcode = '22023';
  end if;

  select pg_catalog.coalesce(
           pg_catalog.array_agg((entries.value ->> 'animalId')::uuid order by entries.ordinal),
           '{}'::uuid[]
         )
    into candidate_ids
    from pg_catalog.jsonb_array_elements(p_candidates)
         with ordinality as entries(value, ordinal);

  payload_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'operation', 'complete',
          'jobId', p_job_id,
          'leaseId', p_lease_id,
          'attempt', p_attempt,
          'callbackContractVersion', p_callback_contract_version,
          'modelVersion', p_model_version,
          'candidates', p_candidates,
          'newCatRecommended', p_new_cat_recommended
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
    if request_row.operation is distinct from 'complete'
       or request_row.payload_sha256 is distinct from payload_sha256 then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return;
  end if;

  -- Discovery intentionally takes no row locks.  Every lower resource is then
  -- locked before the identity job, so candidate availability never requires a
  -- post-job animal lock.
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
  if pg_catalog.cardinality(candidate_ids) > 0 then
    perform 1
      from public.animals as animals
     where animals.id = any(candidate_ids)
     order by animals.id
     for share;
  end if;
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
     or job_row.lease_expires_at <= authoritative_now
     or job_row.sighting_id is distinct from discovered_sighting_id
     or job_row.media_asset_id is distinct from discovered_media_id
     or job_row.requester_id is null
     or job_row.media_asset_id is null
     or job_row.input_sha256 is null then
    raise exception 'identity_assistance_lease_not_current' using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::integer
    into upload_count
    from private.media_upload_jobs as uploads
   where uploads.media_asset_id = job_row.media_asset_id;
  select (
    upload_count = 1
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
         and assets.status = 'quarantined'
         and assets.reviewed_at is not null
         and assets.deleted_at is null
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

  select pg_catalog.count(*)::integer
    into available_candidate_count
    from public.animals as animals
   where animals.id = any(candidate_ids)
     and animals.visibility in (
       'limited'::public.record_visibility,
       'public'::public.record_visibility
     )
     and animals.archived_at is null;
  if available_candidate_count <> pg_catalog.cardinality(candidate_ids) then
    raise exception 'identity_assistance_candidate_unavailable' using errcode = '42501';
  end if;

  select pg_catalog.count(*)::integer
    into existing_candidate_count
    from private.identity_assistance_candidates as candidates
   where candidates.job_id = job_row.id;
  if existing_candidate_count <> 0 then
    raise exception 'identity_assistance_completion_state_invalid' using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config(
    'private.identity_assistance_candidate_writer', job_row.id::text, true
  );
  insert into private.identity_assistance_candidates (
    job_id, rank, animal_id, confidence_band, reason_codes
  )
  select job_row.id,
         entries.ordinal::integer,
         (entries.value ->> 'animalId')::uuid,
         (entries.value ->> 'confidenceBand')::private.identity_assistance_confidence_band,
         array(
           select reasons.value::private.identity_assistance_reason_code
             from pg_catalog.jsonb_array_elements_text(entries.value -> 'reasonCodes')
                  with ordinality as reasons(value, ordinal)
            order by reasons.ordinal
         )
    from pg_catalog.jsonb_array_elements(p_candidates)
         with ordinality as entries(value, ordinal)
   order by entries.ordinal;

  perform pg_catalog.set_config(
    'private.identity_assistance_job_writer', job_row.id::text, true
  );
  update private.identity_assistance_jobs as jobs
     set status = 'succeeded',
         lease_id = null,
         lease_expires_at = null,
         model_version = p_model_version,
         callback_contract_version = p_callback_contract_version,
         new_cat_recommended = p_new_cat_recommended,
         completed_at = authoritative_now,
         expires_at = authoritative_now + interval '7 days',
         updated_at = authoritative_now
   where jobs.id = job_row.id;

  insert into private.identity_assistance_events (
    job_id, request_id, event_type, occurred_at
  ) values (
    job_row.id, p_request_id, 'completed', authoritative_now
  );
  insert into private.identity_assistance_service_requests (
    request_id, payload_sha256, operation, job_id
  ) values (
    p_request_id, payload_sha256, 'complete', job_row.id
  );

  perform pg_catalog.set_config(
    'private.identity_assistance_job_writer', coalesce(prior_job_writer, ''), true
  );
  perform pg_catalog.set_config(
    'private.identity_assistance_candidate_writer', coalesce(prior_candidate_writer, ''), true
  );
exception
  when others then
    perform pg_catalog.set_config(
      'private.identity_assistance_job_writer', coalesce(prior_job_writer, ''), true
    );
    perform pg_catalog.set_config(
      'private.identity_assistance_candidate_writer', coalesce(prior_candidate_writer, ''), true
    );
    raise;
end;
$$;

revoke all on function private.is_valid_identity_assistance_candidate_payload(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.service_complete_identity_assistance_job(
  uuid, uuid, integer, text, text, jsonb, boolean, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.service_complete_identity_assistance_job(
  uuid, uuid, integer, text, text, jsonb, boolean, uuid
) to service_role;

commit;
