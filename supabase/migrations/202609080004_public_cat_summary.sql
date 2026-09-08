begin;

-- A lost origin stays required: ON DELETE SET NULL must not publish a new profile.
alter table public.animals add column identity_origin_required boolean not null default false;
alter table public.animals add column identity_origin_sighting_id uuid references public.sightings(id) on delete set null;
create index animals_identity_origin_idx on public.animals(identity_origin_sighting_id) where identity_origin_sighting_id is not null;
update public.animals animals set identity_origin_required=true, identity_origin_sighting_id=proposals.sighting_id
from private.identity_profile_completions completions join public.identity_proposals proposals on proposals.id=completions.proposal_id
where animals.id=completions.animal_id;

create function private.is_public_cat_available(p_animal_id uuid,p_caller_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
 select exists (
  select 1 from public.animals animal where animal.id=p_animal_id
    and animal.visibility='public'::public.record_visibility and animal.archived_at is null
    and (not animal.identity_origin_required or exists (
      select 1 from public.sightings origin where origin.id=animal.identity_origin_sighting_id
        and origin.animal_id=animal.id
        and origin.visibility='public'::public.record_visibility
        and origin.visible_at is not null and origin.visible_at<=pg_catalog.now()
        and origin.risk<>'critical'::public.risk_tier
        and (p_caller_id is null or origin.reporter_id is null or not exists (
          select 1 from public.user_blocks block
          where (block.blocker_id=p_caller_id and block.blocked_id=origin.reporter_id)
             or (block.blocker_id=origin.reporter_id and block.blocked_id=p_caller_id)
        ))
    ))
 );
$$;
revoke all on function private.is_public_cat_available(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_public_cat_summary(p_animal_id uuid)
returns table ("animalId" uuid,"primaryAlias" text,verification text,"timeBucket" text)
language sql stable security definer set search_path=pg_catalog
as $$
 select animal.id,animal.primary_alias,animal.verification::text,
   case when activity.visible_at is null then null
     when activity.visible_at>=pg_catalog.date_trunc('day',pg_catalog.now()) then 'today'
     when activity.visible_at>=pg_catalog.date_trunc('day',pg_catalog.now())-interval '6 days' then 'this_week'
     else 'earlier' end
 from public.animals animal
 left join lateral (
   select sighting.visible_at from public.sightings sighting
   where sighting.animal_id=animal.id and sighting.visibility='public'::public.record_visibility
     and sighting.visible_at is not null and sighting.visible_at<=pg_catalog.now()
     and sighting.risk<>'critical'::public.risk_tier
     and (auth.uid() is null or sighting.reporter_id is null or not exists (
       select 1 from public.user_blocks block
       where (block.blocker_id=auth.uid() and block.blocked_id=sighting.reporter_id)
          or (block.blocker_id=sighting.reporter_id and block.blocked_id=auth.uid())
     ))
   order by sighting.visible_at desc,sighting.id desc limit 1
 ) activity on true
 where animal.id=p_animal_id and private.is_public_cat_available(animal.id,auth.uid());
$$;
revoke all on function public.get_public_cat_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_public_cat_summary(uuid) to anon,authenticated;
comment on function public.get_public_cat_summary(uuid) is 'Public by-ID identity summary with nullable coarse activity. Missing, withdrawn and unavailable profiles return no rows.';

create or replace function public.confirm_new_animal_identity(
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
  insert into public.animals(primary_alias, profile_created_by, lifecycle, visibility, identity_origin_required, identity_origin_sighting_id)
    values (alias_text, v_actor_id, 'unknown', case when (select visibility from public.sightings where id = context_row.sighting_id) = 'hidden'::public.record_visibility
      or (select risk from public.sightings where id = context_row.sighting_id) <> 'normal'::public.risk_tier
      then 'hidden'::public.record_visibility else 'public'::public.record_visibility end, true, context_row.sighting_id)
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

create or replace function public.list_public_sighting_feed(
  p_cursor uuid default null,
  p_limit integer default 20
)
returns table (
  "sightingId" uuid,
  "animalId" uuid,
  "primaryAlias" text,
  "verification" text,
  "publicCellId" text,
  "timeBucket" text,
  "coverMediaId" uuid,
  "cursor" uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  caller_id uuid := auth.uid();
  cursor_visible_at timestamptz;
  cursor_id uuid;
  page_size integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_cursor is not null then
    select s.visible_at, s.id
      into cursor_visible_at, cursor_id
      from public.sightings s
      join public.animals a on a.id = s.animal_id
     where s.id = p_cursor
       and s.visibility = 'public'
       and s.visible_at is not null
       and s.visible_at <= pg_catalog.now()
       and s.risk <> 'critical'
       and private.is_public_cat_available(a.id, caller_id)
       and (
         caller_id is null
         or s.reporter_id is null
         or not exists (
           select 1
           from public.user_blocks b
           where (b.blocker_id = caller_id and b.blocked_id = s.reporter_id)
              or (b.blocker_id = s.reporter_id and b.blocked_id = caller_id)
         )
       );
    if not found then
      raise exception 'invalid_feed_cursor' using errcode = 'P0001';
    end if;
  end if;

  return query
  select
    s.id,
    a.id,
    a.primary_alias,
    a.verification::text,
    s.public_cell_id,
    case
      when s.visible_at >= pg_catalog.date_trunc('day', pg_catalog.now()) then 'today'
      when s.visible_at >= pg_catalog.date_trunc('day', pg_catalog.now()) - interval '6 days' then 'this_week'
      else 'earlier'
    end::text,
    null::uuid,
    s.id
  from public.sightings s
  join public.animals a on a.id = s.animal_id
  where s.visibility = 'public'
    and s.visible_at is not null
    and s.visible_at <= pg_catalog.now()
    and s.risk <> 'critical'
    and private.is_public_cat_available(a.id, caller_id)
    and (
      cursor_id is null
      or (s.visible_at, s.id) < (cursor_visible_at, cursor_id)
    )
    and (
      caller_id is null
      or s.reporter_id is null
      or not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = caller_id and b.blocked_id = s.reporter_id)
           or (b.blocker_id = s.reporter_id and b.blocked_id = caller_id)
      )
    )
  order by s.visible_at desc, s.id desc
  limit page_size;
end;
$$;

create or replace function public.submit_identity_proposal(
  p_sighting_id uuid, p_proposed_animal_id uuid, p_source text, p_request_id uuid
)
returns table ("proposalId" uuid, "source" text, "status" text)
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  sighting_row public.sightings%rowtype;
  prior private.identity_requests%rowtype;
  proposal_row public.identity_proposals%rowtype;
  payload_hash text;
begin
  if v_actor_id is null or not public.is_adult_contributor() then
    raise exception 'adult_contributor_required' using errcode = '42501';
  end if;
  if p_sighting_id is null or p_request_id is null or p_source is null
    or p_source not in ('manual_search', 'new_animal')
    or (p_source = 'manual_search' and p_proposed_animal_id is null)
    or (p_source = 'new_animal' and p_proposed_animal_id is not null) then
    raise exception 'invalid_identity_proposal' using errcode = '22023';
  end if;
  payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object(
    'sightingId', p_sighting_id, 'proposedAnimalId', p_proposed_animal_id, 'source', p_source
  )::text, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor_id::text || ':' || p_request_id::text, 0));
  select * into prior from private.identity_requests requests where requests.actor_id = v_actor_id and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'submit' or prior.payload_hash <> payload_hash then raise exception 'idempotency_conflict' using errcode = 'P0001'; end if;
    select * into proposal_row from public.identity_proposals proposals where proposals.id = prior.proposal_id;
    if not found then raise exception 'identity_proposal_outcome_unavailable' using errcode = 'P0001'; end if;
    return query select proposal_row.id, proposal_row.source, proposal_row.status::text;
    return;
  end if;
  select * into sighting_row from public.sightings sightings where sightings.id = p_sighting_id for update;
  if not found or sighting_row.reporter_id is distinct from v_actor_id then raise exception 'identity_sighting_owner_required' using errcode = '42501'; end if;
  if sighting_row.animal_id is not null then raise exception 'identity_sighting_already_linked' using errcode = 'P0001'; end if;
  if exists (select 1 from public.identity_proposals proposals where proposals.sighting_id = p_sighting_id and proposals.status = 'tentative'::public.identity_proposal_status) then
    raise exception 'identity_proposal_already_active' using errcode = 'P0001';
  end if;
  if p_proposed_animal_id is not null and not exists (
    select 1 from public.sightings candidate
    join public.animals animal on animal.id = candidate.animal_id
    where candidate.animal_id = p_proposed_animal_id
      and candidate.visibility = 'public'::public.record_visibility
      and candidate.visible_at is not null and candidate.visible_at <= pg_catalog.now()
      and candidate.risk <> 'critical'::public.risk_tier
      and private.is_public_cat_available(animal.id, v_actor_id)
      and (candidate.reporter_id is null or not exists (
        select 1 from public.user_blocks block where (block.blocker_id = v_actor_id and block.blocked_id = candidate.reporter_id)
          or (block.blocker_id = candidate.reporter_id and block.blocked_id = v_actor_id)
      ))
  ) then raise exception 'identity_animal_not_available' using errcode = 'P0001'; end if;
  insert into public.identity_proposals (sighting_id, proposed_animal_id, proposer_id, source, status, model_version, confidence_band, reasons, reviewed_at)
  values (p_sighting_id, p_proposed_animal_id, v_actor_id, p_source, 'tentative'::public.identity_proposal_status, null, null, '[]'::jsonb, null)
  returning * into proposal_row;
  insert into private.identity_requests (actor_id, request_id, operation, payload_hash, proposal_id)
  values (v_actor_id, p_request_id, 'submit', payload_hash, proposal_row.id);
  insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, request_id)
  values (v_actor_id, 'identity_proposal_submit', 'identity_proposal', proposal_row.id, 'identity_review', p_request_id::text);
  return query select proposal_row.id, proposal_row.source, proposal_row.status::text;
end;
$$;

create or replace function public.get_my_identity_result(p_sighting_id uuid)
returns table ("proposalId" uuid, status text, decision text, "animalId" uuid, "requestId" uuid)
language sql stable security definer set search_path = pg_catalog
as $$
  select proposals.id, proposals.status::text, reviews.decision,
    case when proposals.status = 'confirmed'::public.identity_proposal_status
           and animals.id is not null and animals.archived_at is null
           and private.is_public_cat_available(animals.id, auth.uid())
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

commit;
