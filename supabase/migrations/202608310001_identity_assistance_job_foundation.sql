begin;

create type private.identity_assistance_job_status as enum
  ('requested', 'processing', 'succeeded', 'failed', 'cancelled', 'expired');
create type private.identity_assistance_confidence_band as enum
  ('likely', 'possible', 'weak');
create type private.identity_assistance_reason_code as enum
  ('face_pattern_similar', 'ear_shape_similar', 'coat_marking_similar',
   'view_angle_limited', 'image_quality_limited');
create type private.identity_assistance_failure_code as enum
  ('invalid_input', 'provider_unavailable', 'quality_rejected', 'internal_error',
   'lease_expired', 'source_invalidated');
create type private.identity_assistance_event_type as enum
  ('requested', 'claimed', 'completed', 'retry_released', 'failed', 'cancelled',
   'expired', 'selected', 'invalidated', 'cleaned');

create table private.identity_assistance_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  requester_id uuid references public.user_profiles(id) on delete set null,
  status private.identity_assistance_job_status not null default 'requested',
  purpose text not null default 'community_cat_identity_assistance'
    check (purpose = 'community_cat_identity_assistance'),
  notice_version text not null
    check (notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  input_sha256 text,
  recipe_version text not null default 'jpeg-srgb-2048-q88.v1'
    check (recipe_version = 'jpeg-srgb-2048-q88.v1'),
  crop_contract_version text not null default 'crop.v1'
    check (crop_contract_version = 'crop.v1'),
  embedding_contract_version text not null default 'embedding.v1'
    check (embedding_contract_version = 'embedding.v1'),
  identify_contract_version text not null default 'identify.v1'
    check (identify_contract_version = 'identify.v1'),
  model_version text,
  callback_contract_version text,
  new_cat_recommended boolean,
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  lease_id uuid,
  lease_expires_at timestamptz,
  failure_code private.identity_assistance_failure_code,
  requested_at timestamptz not null default pg_catalog.now(),
  processing_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  selected_at timestamptz,
  withdrawn_at timestamptz,
  result_invalidated_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint identity_assistance_job_input_hash check (
    (input_sha256 is not null and input_sha256 ~ '^[a-f0-9]{64}$')
    or (
      input_sha256 is null
      and (
        status in ('failed', 'cancelled', 'expired')
        or (
          status = 'succeeded'
          and (withdrawn_at is not null or result_invalidated_at is not null)
        )
      )
    )
  ),
  constraint identity_assistance_job_lease_pair check (
    (lease_id is null) = (lease_expires_at is null)
  ),
  constraint identity_assistance_job_completion_provenance check (
    (
      status = 'succeeded'
      and model_version is not null
      and callback_contract_version is not null
      and callback_contract_version = 'identify-callback.v1'
      and new_cat_recommended is not null
    )
    or (
      status <> 'succeeded'
      and model_version is null
      and callback_contract_version is null
      and new_cat_recommended is null
    )
  ),
  constraint identity_assistance_job_model_version check (
    model_version is null
    or model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ),
  constraint identity_assistance_job_state check (
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
      and completed_at is null and failed_at is null and cancelled_at is not null
      and failure_code is null)
    or (status = 'expired'
      and lease_id is null and lease_expires_at is null
      and completed_at is null and failed_at is null and cancelled_at is null
      and expires_at is not null and failure_code is null)
  ),
  constraint identity_assistance_job_provenance_times check (
    (selected_at is null or selected_at >= requested_at)
    and (withdrawn_at is null or withdrawn_at >= requested_at)
    and (result_invalidated_at is null or result_invalidated_at >= requested_at)
  )
);

create unique index identity_assistance_one_actionable_job_per_sighting_idx
  on private.identity_assistance_jobs (sighting_id)
  where status in ('requested', 'processing')
     or (status = 'succeeded' and selected_at is null
         and withdrawn_at is null and result_invalidated_at is null);
create index identity_assistance_jobs_claim_idx
  on private.identity_assistance_jobs (status, requested_at, id);
create index identity_assistance_jobs_cleanup_idx
  on private.identity_assistance_jobs (expires_at, id);

create table private.identity_assistance_candidates (
  job_id uuid not null references private.identity_assistance_jobs(id) on delete cascade,
  rank integer not null check (rank between 1 and 3),
  animal_id uuid not null references public.animals(id) on delete restrict,
  confidence_band private.identity_assistance_confidence_band not null,
  reason_codes private.identity_assistance_reason_code[] not null
    check (
      cardinality(reason_codes) between 1 and 4
      and array_position(reason_codes, null) is null
    ),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (job_id, rank),
  unique (job_id, animal_id)
);

create table private.identity_assistance_requests (
  actor_id uuid not null references public.user_profiles(id) on delete cascade,
  request_id uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  operation text not null check (operation in ('request', 'cancel', 'select')),
  job_id uuid references private.identity_assistance_jobs(id) on delete set null,
  proposal_id uuid references public.identity_proposals(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (actor_id, request_id)
);

create table private.identity_assistance_service_requests (
  request_id uuid primary key,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  operation text not null check (operation in ('claim', 'complete', 'fail', 'cleanup', 'authorize_media')),
  job_id uuid references private.identity_assistance_jobs(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now()
);

create table private.identity_assistance_events (
  id bigint generated always as identity primary key,
  job_id uuid references private.identity_assistance_jobs(id) on delete set null,
  actor_id uuid references public.user_profiles(id) on delete set null,
  request_id uuid,
  event_type private.identity_assistance_event_type not null,
  failure_code private.identity_assistance_failure_code,
  reason_code text check (
    reason_code is null
    or reason_code ~ '^[a-z][a-z0-9_]{0,63}$'
  ),
  occurred_at timestamptz not null default pg_catalog.now()
);

create table private.identity_assistance_status_reads (
  actor_id uuid not null references public.user_profiles(id) on delete cascade,
  job_id uuid not null references private.identity_assistance_jobs(id) on delete cascade,
  accessed_on date not null,
  first_accessed_at timestamptz not null,
  last_accessed_at timestamptz not null,
  access_count integer not null check (access_count between 1 and 10000),
  primary key (actor_id, job_id, accessed_on)
);

create table private.identity_proposal_evidence (
  proposal_id uuid primary key references public.identity_proposals(id) on delete cascade,
  job_id uuid not null unique references private.identity_assistance_jobs(id) on delete cascade,
  selected_candidate_rank integer check (selected_candidate_rank is null or selected_candidate_rank between 1 and 3),
  media_asset_id uuid references public.media_assets(id) on delete set null,
  recipe_version text not null check (recipe_version = 'jpeg-srgb-2048-q88.v1'),
  crop_contract_version text not null check (crop_contract_version = 'crop.v1'),
  embedding_contract_version text not null check (embedding_contract_version = 'embedding.v1'),
  identify_contract_version text not null check (identify_contract_version = 'identify.v1'),
  model_version text not null check (model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  callback_contract_version text not null check (callback_contract_version = 'identify-callback.v1'),
  selector_id uuid references public.user_profiles(id) on delete set null,
  selected_at timestamptz not null
);

alter table private.identity_assistance_jobs enable row level security;
alter table private.identity_assistance_candidates enable row level security;
alter table private.identity_assistance_requests enable row level security;
alter table private.identity_assistance_service_requests enable row level security;
alter table private.identity_assistance_events enable row level security;
alter table private.identity_assistance_status_reads enable row level security;
alter table private.identity_proposal_evidence enable row level security;

revoke all on table private.identity_assistance_jobs from public, anon, authenticated, service_role;
revoke all on table private.identity_assistance_candidates from public, anon, authenticated, service_role;
revoke all on table private.identity_assistance_requests from public, anon, authenticated, service_role;
revoke all on table private.identity_assistance_service_requests from public, anon, authenticated, service_role;
revoke all on table private.identity_assistance_events from public, anon, authenticated, service_role;
revoke all on table private.identity_assistance_status_reads from public, anon, authenticated, service_role;
revoke all on table private.identity_proposal_evidence from public, anon, authenticated, service_role;

commit;
