begin;

create or replace function private.identity_reasons_are_safe(p_reasons jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  item jsonb;
  reason_text text;
  lowered text;
begin
  if p_reasons is null
    or pg_catalog.jsonb_typeof(p_reasons) <> 'array'
    or pg_catalog.jsonb_array_length(p_reasons) not between 1 and 4 then
    return false;
  end if;

  for item in select value from pg_catalog.jsonb_array_elements(p_reasons) loop
    if pg_catalog.jsonb_typeof(item) <> 'string' then
      return false;
    end if;
    reason_text := item #>> '{}';
    if pg_catalog.char_length(reason_text) not between 1 and 160 then
      return false;
    end if;
    lowered := pg_catalog.lower(reason_text);
    if lowered like '%http://%'
      or lowered like '%https://%'
      or lowered like '%file:%'
      or lowered like '%storage%'
      or lowered like '%vector%'
      or lowered like '%score%'
      or lowered like '%location%'
      or lowered like '%path%'
      or lowered like '%latitude%'
      or lowered like '%longitude%' then
      return false;
    end if;
  end loop;
  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function private.identity_rationale_is_safe(p_rationale text)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog
as $$
  select p_rationale is not null
    and pg_catalog.char_length(pg_catalog.btrim(p_rationale)) between 10 and 1000
    and pg_catalog.lower(p_rationale) not like '%http://%'
    and pg_catalog.lower(p_rationale) not like '%https://%'
    and pg_catalog.lower(p_rationale) not like '%file:%'
    and pg_catalog.lower(p_rationale) not like '%storage%'
    and pg_catalog.lower(p_rationale) not like '%vector%'
    and pg_catalog.lower(p_rationale) not like '%bearer%'
    and pg_catalog.lower(p_rationale) not like '%token%'
    and pg_catalog.lower(p_rationale) not like '%latitude%'
    and pg_catalog.lower(p_rationale) not like '%longitude%'
    and p_rationale !~ '[+-]?[0-9]{1,3}\.[0-9]{4,}[[:space:]]*[,/][[:space:]]*[+-]?[0-9]{1,3}\.[0-9]{4,}'
    and p_rationale !~ '(^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{16,}';
$$;

create unique index identity_proposals_one_tentative_per_sighting_idx
  on public.identity_proposals (sighting_id)
  where status = 'tentative'::public.identity_proposal_status;

alter table public.match_reviews
  add column request_id uuid not null default extensions.gen_random_uuid();
create unique index match_reviews_reviewer_request_idx
  on public.match_reviews (reviewer_id, request_id);

create table private.identity_requests (
  actor_id uuid not null references public.user_profiles(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (operation in ('submit', 'review')),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  proposal_id uuid not null references public.identity_proposals(id) on delete cascade,
  review_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (actor_id, request_id),
  check (
    (operation = 'submit' and proposal_id is not null and review_id is null)
    or (operation = 'review' and proposal_id is not null and review_id is not null)
  )
);

create table private.ai_identity_requests (
  request_id uuid primary key,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  proposal_id uuid not null references public.identity_proposals(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

alter table private.identity_requests enable row level security;
alter table private.ai_identity_requests enable row level security;
revoke all on table private.identity_requests from public, anon, authenticated, service_role;
revoke all on table private.ai_identity_requests from public, anon, authenticated, service_role;

drop policy if exists "adult users create tentative proposals" on public.identity_proposals;
drop policy if exists "trusted reviewers create reviews" on public.match_reviews;
revoke insert, update, delete on table public.identity_proposals from public, anon, authenticated;
revoke insert, update, delete on table public.match_reviews from public, anon, authenticated;
revoke insert, update, delete on table public.identity_proposals from service_role;
revoke insert, update, delete on table public.match_reviews from service_role;
grant select on table public.identity_proposals to service_role;
grant select on table public.match_reviews to service_role;

create or replace function private.enforce_identity_proposal_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status <> 'tentative'::public.identity_proposal_status
    or new.reviewed_at is not null then
    raise exception 'identity_proposal_must_start_tentative' using errcode = '42501';
  end if;
  if not pg_catalog.coalesce((
    (
      new.source = 'manual_search'
      and new.proposer_id is not null
      and new.proposed_animal_id is not null
      and new.model_version is null
      and new.confidence_band is null
      and new.reasons = '[]'::jsonb
    )
    or (
      new.source = 'new_animal'
      and new.proposer_id is not null
      and new.proposed_animal_id is null
      and new.model_version is null
      and new.confidence_band is null
      and new.reasons = '[]'::jsonb
    )
    or (
      new.source = 'ai_candidate'
      and new.proposer_id is null
      and new.proposed_animal_id is not null
      and new.model_version is not null
      and new.model_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
      and new.confidence_band is not null
      and new.confidence_band in ('likely', 'possible', 'weak')
      and private.identity_reasons_are_safe(new.reasons)
    )
  ), false) then
    raise exception 'invalid_identity_proposal_provenance' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger identity_proposal_starts_tentative
before insert on public.identity_proposals
for each row execute function private.enforce_identity_proposal_insert();

create or replace function private.reject_match_review_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- Service-managed parent deletion may invoke this as a nested cascade during
  -- an approved erasure flow. A direct rewrite or delete is never allowed.
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op = 'UPDATE'
    and pg_catalog.pg_trigger_depth() > 1
    and old.reviewer_id is not null
    and new.reviewer_id is null
    and row(new.id, new.proposal_id, new.decision, new.rationale, new.created_at, new.request_id)
      is not distinct from
      row(old.id, old.proposal_id, old.decision, old.rationale, old.created_at, old.request_id) then
    return new;
  end if;
  raise exception 'match_reviews_append_only' using errcode = '42501';
end;
$$;

create trigger match_reviews_append_only
before update or delete on public.match_reviews
for each row execute function private.reject_match_review_mutation();

create or replace function public.service_submit_ai_identity_proposal(
  p_sighting_id uuid,
  p_proposed_animal_id uuid,
  p_model_version text,
  p_confidence_band text,
  p_reasons jsonb,
  p_request_id uuid
)
returns table (
  "proposalId" uuid,
  "source" text,
  "status" text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  sighting_row public.sightings%rowtype;
  prior private.ai_identity_requests%rowtype;
  proposal_row public.identity_proposals%rowtype;
  payload_hash text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_sighting_id is null
    or p_proposed_animal_id is null
    or p_request_id is null
    or p_model_version is null
    or p_model_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
    or p_confidence_band is null
    or p_confidence_band not in ('likely', 'possible', 'weak')
    or not private.identity_reasons_are_safe(p_reasons) then
    raise exception 'invalid_ai_identity_proposal' using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'sightingId', p_sighting_id,
        'proposedAnimalId', p_proposed_animal_id,
        'modelVersion', p_model_version,
        'confidenceBand', p_confidence_band,
        'reasons', p_reasons
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-identity:' || p_request_id::text, 0)
  );
  select * into prior
  from private.ai_identity_requests requests
  where requests.request_id = p_request_id;
  if found then
    if prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    select * into proposal_row
    from public.identity_proposals proposals
    where proposals.id = prior.proposal_id;
    if not found then
      raise exception 'identity_proposal_outcome_unavailable' using errcode = 'P0001';
    end if;
    return query select proposal_row.id, proposal_row.source, proposal_row.status::text;
    return;
  end if;

  select * into sighting_row
  from public.sightings sightings
  where sightings.id = p_sighting_id
  for update;
  if not found then
    raise exception 'identity_sighting_not_available' using errcode = 'P0001';
  end if;
  if sighting_row.animal_id is not null then
    raise exception 'identity_sighting_already_linked' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.identity_proposals proposals
    where proposals.sighting_id = p_sighting_id
      and proposals.status = 'tentative'::public.identity_proposal_status
  ) then
    raise exception 'identity_proposal_already_active' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.animals animals
    where animals.id = p_proposed_animal_id
      and animals.archived_at is null
      and animals.visibility <> 'hidden'::public.record_visibility
  ) then
    raise exception 'identity_animal_not_available' using errcode = 'P0001';
  end if;

  insert into public.identity_proposals (
    sighting_id, proposed_animal_id, proposer_id, source, status,
    model_version, confidence_band, reasons, reviewed_at
  ) values (
    p_sighting_id, p_proposed_animal_id, null, 'ai_candidate',
    'tentative'::public.identity_proposal_status,
    p_model_version, p_confidence_band, p_reasons, null
  ) returning * into proposal_row;

  insert into private.ai_identity_requests (request_id, payload_hash, proposal_id)
  values (p_request_id, payload_hash, proposal_row.id);
  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, request_id
  ) values (
    null, 'ai_identity_proposal_submit', 'identity_proposal', proposal_row.id,
    'identity_review', p_request_id::text
  );

  return query select proposal_row.id, proposal_row.source, proposal_row.status::text;
end;
$$;

create or replace function public.submit_identity_proposal(
  p_sighting_id uuid,
  p_proposed_animal_id uuid,
  p_source text,
  p_request_id uuid
)
returns table (
  "proposalId" uuid,
  "source" text,
  "status" text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  sighting_row public.sightings%rowtype;
  prior private.identity_requests%rowtype;
  proposal_row public.identity_proposals%rowtype;
  payload_hash text;
begin
  if actor_id is null or not public.is_adult_contributor() then
    raise exception 'adult_contributor_required' using errcode = '42501';
  end if;
  if p_sighting_id is null
    or p_request_id is null
    or p_source is null
    or p_source not in ('manual_search', 'new_animal')
    or (p_source = 'manual_search' and p_proposed_animal_id is null)
    or (p_source = 'new_animal' and p_proposed_animal_id is not null) then
    raise exception 'invalid_identity_proposal' using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'sightingId', p_sighting_id,
        'proposedAnimalId', p_proposed_animal_id,
        'source', p_source
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior
  from private.identity_requests requests
  where requests.actor_id = submit_identity_proposal.actor_id
    and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'submit' or prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    select * into proposal_row
    from public.identity_proposals proposals
    where proposals.id = prior.proposal_id;
    if not found then
      raise exception 'identity_proposal_outcome_unavailable' using errcode = 'P0001';
    end if;
    return query select proposal_row.id, proposal_row.source, proposal_row.status::text;
    return;
  end if;

  select * into sighting_row
  from public.sightings sightings
  where sightings.id = p_sighting_id
  for update;
  if not found or sighting_row.reporter_id is distinct from actor_id then
    raise exception 'identity_sighting_owner_required' using errcode = '42501';
  end if;
  if sighting_row.animal_id is not null then
    raise exception 'identity_sighting_already_linked' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.identity_proposals proposals
    where proposals.sighting_id = p_sighting_id
      and proposals.status = 'tentative'::public.identity_proposal_status
  ) then
    raise exception 'identity_proposal_already_active' using errcode = 'P0001';
  end if;
  if p_proposed_animal_id is not null and not exists (
    select 1 from public.animals animals
    where animals.id = p_proposed_animal_id
      and animals.archived_at is null
      and animals.visibility <> 'hidden'::public.record_visibility
  ) then
    raise exception 'identity_animal_not_available' using errcode = 'P0001';
  end if;

  insert into public.identity_proposals (
    sighting_id, proposed_animal_id, proposer_id, source, status,
    model_version, confidence_band, reasons, reviewed_at
  ) values (
    p_sighting_id, p_proposed_animal_id, actor_id, p_source,
    'tentative'::public.identity_proposal_status, null, null, '[]'::jsonb, null
  ) returning * into proposal_row;

  insert into private.identity_requests (
    actor_id, request_id, operation, payload_hash, proposal_id
  ) values (
    actor_id, p_request_id, 'submit', payload_hash, proposal_row.id
  );
  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, request_id
  ) values (
    actor_id, 'identity_proposal_submit', 'identity_proposal', proposal_row.id,
    'identity_review', p_request_id::text
  );

  return query select proposal_row.id, proposal_row.source, proposal_row.status::text;
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
  actor_id uuid := auth.uid();
  normalized_rationale text;
  payload_hash text;
  prior private.identity_requests%rowtype;
  proposal_row public.identity_proposals%rowtype;
  sighting_row public.sightings%rowtype;
  review_row public.match_reviews%rowtype;
  animal_creator_id uuid;
  resulting_status public.identity_proposal_status;
begin
  if actor_id is null then
    raise exception 'trusted_identity_reviewer_required' using errcode = '42501';
  end if;
  perform 1
  from public.role_grants grants
  where grants.user_id = actor_id
    and grants.role = any(
      array['trusted_contributor', 'area_steward', 'platform_admin']::public.trust_role[]
    )
    and grants.revoked_at is null
    and (grants.provisional_until is null or grants.provisional_until > pg_catalog.now())
  for key share;
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
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior
  from private.identity_requests requests
  where requests.actor_id = review_identity_proposal.actor_id
    and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'review' or prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    select * into review_row from public.match_reviews reviews where reviews.id = prior.review_id;
    select * into proposal_row from public.identity_proposals proposals where proposals.id = prior.proposal_id;
    if review_row.id is null or proposal_row.id is null then
      raise exception 'identity_review_outcome_unavailable' using errcode = 'P0001';
    end if;
    return query select proposal_row.id, review_row.decision, proposal_row.status::text,
      proposal_row.proposed_animal_id;
    return;
  end if;

  select * into proposal_row
  from public.identity_proposals proposals
  where proposals.id = p_proposal_id
  for update;
  if not found or proposal_row.status <> 'tentative'::public.identity_proposal_status then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  end if;

  select * into sighting_row
  from public.sightings sightings
  where sightings.id = proposal_row.sighting_id
  for update;
  if not found or sighting_row.animal_id is not null then
    raise exception 'identity_proposal_not_actionable' using errcode = 'P0001';
  end if;

  animal_creator_id := null;
  if proposal_row.proposed_animal_id is not null then
    select animals.profile_created_by into animal_creator_id
    from public.animals animals
    where animals.id = proposal_row.proposed_animal_id
      and animals.archived_at is null
      and animals.visibility <> 'hidden'::public.record_visibility;
    if not found then
      raise exception 'identity_animal_not_available' using errcode = 'P0001';
    end if;
  elsif proposal_row.source <> 'new_animal' then
    raise exception 'identity_animal_not_available' using errcode = 'P0001';
  end if;

  if actor_id = proposal_row.proposer_id
    or actor_id = sighting_row.reporter_id
    or actor_id = animal_creator_id then
    raise exception 'identity_reviewer_recusal_required' using errcode = '42501';
  end if;

  insert into public.match_reviews (
    proposal_id, reviewer_id, decision, rationale, request_id
  ) values (
    proposal_row.id, actor_id, p_decision, normalized_rationale, p_request_id
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
    actor_id, p_request_id, 'review', payload_hash, proposal_row.id, review_row.id
  );
  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, request_id
  ) values (
    actor_id, 'identity_proposal_review', 'identity_proposal', proposal_row.id,
    'identity_review', p_request_id::text
  );

  return query select proposal_row.id, p_decision, resulting_status::text,
    proposal_row.proposed_animal_id;
end;
$$;

revoke all on function public.service_submit_ai_identity_proposal(uuid, uuid, text, text, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_identity_proposal(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.review_identity_proposal(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_identity_proposal(uuid, uuid, text, uuid)
  to authenticated;
grant execute on function public.review_identity_proposal(uuid, text, text, uuid)
  to authenticated;
grant execute on function public.service_submit_ai_identity_proposal(uuid, uuid, text, text, jsonb, uuid)
  to service_role;

comment on function public.service_submit_ai_identity_proposal(uuid, uuid, text, text, jsonb, uuid) is
  'Service-role-only, idempotent AI candidate insertion path. It accepts broad bands and bounded safe reasons, never scores or vectors.';
comment on function public.submit_identity_proposal(uuid, uuid, text, uuid) is
  'Owner-bound, idempotent contributor path for manual-search or new-animal tentative identity proposals. AI provenance is service-only.';
comment on function public.review_identity_proposal(uuid, text, text, uuid) is
  'Independent trusted-reviewer path that atomically records a review and, only on confirmation, links an unassigned sighting.';
comment on table private.identity_requests is
  'Private idempotency ledger for authenticated identity proposal and review mutations.';

commit;
