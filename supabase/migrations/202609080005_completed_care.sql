begin;

-- Care facts are immutable. Commands append a request ledger and an invalidation
-- relation; the original event is never rewritten or removed by an owner action.
alter table public.care_events add column visible_at timestamptz;

create table private.care_requests (
  actor_id uuid not null references public.user_profiles(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (operation in ('record','withdraw','correct')),
  target_id uuid not null,
  payload_hash text not null,
  care_event_id uuid references public.care_events(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (actor_id, request_id)
);
alter table private.care_requests enable row level security;
revoke all on table private.care_requests from public, anon, authenticated, service_role;

create table private.care_event_invalidations (
  id uuid primary key default gen_random_uuid(),
  care_event_id uuid not null references public.care_events(id) on delete cascade,
  actor_id uuid references public.user_profiles(id) on delete set null,
  kind text not null check (kind in ('withdrawn','corrected')),
  replacement_care_event_id uuid references public.care_events(id) on delete set null,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (care_event_id),
  unique (actor_id, request_id)
);
alter table private.care_event_invalidations enable row level security;
revoke all on table private.care_event_invalidations from public, anon, authenticated, service_role;
create index care_events_animal_visible_idx on public.care_events(animal_id, visible_at desc, id desc) where visibility='public';
create index care_events_actor_created_idx on public.care_events(actor_id, created_at desc, id desc);
create index care_invalidations_event_idx on private.care_event_invalidations(care_event_id);

create function private.care_cell_is_supported(p_cell text)
returns boolean language sql immutable security definer set search_path=pg_catalog
as $$ select p_cell in ('896520ca163ffff','89652636d87ffff','896526add03ffff') $$;
revoke all on function private.care_cell_is_supported(text) from public,anon,authenticated,service_role;

create or replace function private.current_care_risk(p_animal_id uuid)
returns public.risk_tier language sql stable security definer set search_path=pg_catalog
as $$
  select case when exists (select 1 from public.sightings sighting where sighting.animal_id=p_animal_id and sighting.risk='critical'::public.risk_tier) then 'critical'::public.risk_tier
              when exists (select 1 from public.sightings sighting where sighting.animal_id=p_animal_id and sighting.risk='sensitive'::public.risk_tier) then 'sensitive'::public.risk_tier
              else 'normal'::public.risk_tier end
$$;
revoke all on function private.current_care_risk(uuid) from public,anon,authenticated,service_role;

create function private.care_is_publicly_available(p_care_event_id uuid,p_caller_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$
 select exists (
  select 1 from public.care_events care
  where care.id=p_care_event_id
    and care.visibility='public'::public.record_visibility
    and care.visible_at is not null and care.visible_at<=pg_catalog.now()
    and not exists (select 1 from private.care_event_invalidations invalidation where invalidation.care_event_id=care.id)
    and private.is_public_cat_available(care.animal_id,p_caller_id)
    and private.current_care_risk(care.animal_id) <> 'critical'::public.risk_tier
    and (private.current_care_risk(care.animal_id) <> 'sensitive'::public.risk_tier or care.created_at <= pg_catalog.now()-interval '24 hours')
    and (care.actor_id is null or p_caller_id is null or not exists (
      select 1 from public.user_blocks block where
       (block.blocker_id=p_caller_id and block.blocked_id=care.actor_id)
       or (block.blocker_id=care.actor_id and block.blocked_id=p_caller_id)
    ))
 )
$$;
revoke all on function private.care_is_publicly_available(uuid,uuid) from public,anon,authenticated,service_role;

create function public.record_completed_care(
  p_animal_id uuid,p_activity text,p_completed_at timestamptz,p_public_cell text,p_request_id uuid
)
returns table ("careEventId" uuid,"visibleAt" timestamptz,status text)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare
  v_actor uuid:=auth.uid(); v_profile public.user_profiles%rowtype; v_animal public.animals%rowtype;
  v_request private.care_requests%rowtype; v_event public.care_events%rowtype;
  v_hash text; v_risk public.risk_tier; v_visible_at timestamptz;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_animal_id is null or p_request_id is null or p_activity is null or p_public_cell is null or p_activity not in ('feed','water','cleanup','observe','companionship')
     or not private.care_cell_is_supported(p_public_cell) then raise exception 'invalid_care_payload' using errcode='22023'; end if;
  if p_completed_at is null or p_completed_at >= pg_catalog.now() or p_completed_at < pg_catalog.now()-interval '30 days' then
    raise exception 'invalid_care_completed_at' using errcode='22023';
  end if;
  v_hash:=encode(extensions.digest(jsonb_build_object('animalId',p_animal_id,'activity',p_activity,'completedAt',p_completed_at,'publicCell',p_public_cell)::text,'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || p_request_id::text,0));
  -- Match the established account -> source -> animal ordering before recording.
  select * into v_profile from public.user_profiles where id=v_actor for key share;
  if not found or v_profile.adult_confirmed_at is null then raise exception 'adult_contributor_required' using errcode='P0001'; end if;
  select * into v_request from private.care_requests where actor_id=v_actor and request_id=p_request_id for update;
  if found then
    if v_request.operation <> 'record' or v_request.payload_hash <> v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    select * into v_event from public.care_events where id=v_request.care_event_id;
    if not found then raise exception 'care_event_not_available' using errcode='P0001'; end if;
    return query select v_event.id,v_event.visible_at,'recorded'::text; return;
  end if;
  select * into v_animal from public.animals where id=p_animal_id for update;
  if not found or not private.is_public_cat_available(v_animal.id,v_actor) then raise exception 'care_animal_not_available' using errcode='P0001'; end if;
  v_risk:=private.current_care_risk(v_animal.id);
  v_visible_at:=case when v_risk='critical'::public.risk_tier then null when v_risk='sensitive'::public.risk_tier then pg_catalog.now()+interval '24 hours' else pg_catalog.now()+interval '2 hours' end;
  insert into public.care_events(animal_id,actor_id,activity,completed_at,public_cell_id,client_dedupe_key,visibility,visible_at)
    values(v_animal.id,v_actor,p_activity,p_completed_at,p_public_cell,p_request_id::text,
      case when v_risk='critical'::public.risk_tier then 'limited'::public.record_visibility else 'public'::public.record_visibility end,v_visible_at)
    returning * into v_event;
  insert into private.care_requests(actor_id,request_id,operation,target_id,payload_hash,care_event_id)
    values(v_actor,p_request_id,'record',v_animal.id,v_hash,v_event.id);
  insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id)
    values(v_actor,'record','care_event',v_event.id,'community_care',p_request_id::text);
  return query select v_event.id,v_event.visible_at,'recorded'::text;
end $$;

create function public.list_public_care_history(p_animal_id uuid,p_cursor uuid default null,p_limit integer default 20)
returns table ("careEventId" uuid,activity text,"publicCellId" text,"completedWindow" text,provenance text,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_caller uuid:=auth.uid(); v_cursor_at timestamptz; v_cursor_id uuid;
begin
 if p_animal_id is null then raise exception 'invalid_care_history_request' using errcode='22023'; end if;
 if p_cursor is not null then
  select care.visible_at,care.id into v_cursor_at,v_cursor_id from public.care_events care
   where care.id=p_cursor and care.animal_id=p_animal_id and private.care_is_publicly_available(care.id,v_caller);
  if not found then raise exception 'invalid_care_history_cursor' using errcode='P0001'; end if;
 end if;
 return query select care.id,care.activity,care.public_cell_id,
   case when care.completed_at>=pg_catalog.date_trunc('day',pg_catalog.now()) then 'today'
        when care.completed_at>=pg_catalog.date_trunc('day',pg_catalog.now())-interval '6 days' then 'this_week' else 'earlier' end,
   'reported'::text,care.id
 from public.care_events care
 where care.animal_id=p_animal_id and private.care_is_publicly_available(care.id,v_caller)
   and (p_cursor is null or (care.visible_at,care.id)<(v_cursor_at,v_cursor_id))
 order by care.visible_at desc,care.id desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

create function public.list_my_care_events(p_limit integer default 20,p_before_created_at timestamptz default null,p_before_care_event_id uuid default null)
returns table ("careEventId" uuid,"animalId" uuid,activity text,"completedAt" timestamptz,"publicCellId" text,"createdAt" timestamptz,status text,"replacementCareEventId" uuid)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_actor uuid:=auth.uid(); v_cursor timestamptz; v_cursor_id uuid;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if (p_before_created_at is null) <> (p_before_care_event_id is null) then raise exception 'invalid_my_care_cursor' using errcode='P0001'; end if;
 if p_before_care_event_id is not null then select created_at,id into v_cursor,v_cursor_id from public.care_events where id=p_before_care_event_id and actor_id=v_actor; if not found then raise exception 'invalid_my_care_cursor' using errcode='P0001'; end if; end if;
 return query select care.id,care.animal_id,care.activity,care.completed_at,care.public_cell_id,care.created_at,
   coalesce(invalidation.kind,'recorded'),invalidation.replacement_care_event_id
 from public.care_events care left join private.care_event_invalidations invalidation on invalidation.care_event_id=care.id
 where care.actor_id=v_actor and (p_before_care_event_id is null or (care.created_at,care.id)<(v_cursor,v_cursor_id))
 order by care.created_at desc,care.id desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

create function public.withdraw_care_event(p_care_event_id uuid,p_request_id uuid)
returns table ("careEventId" uuid,status text)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_actor uuid:=auth.uid(); v_profile public.user_profiles%rowtype; v_event public.care_events%rowtype; v_request private.care_requests%rowtype; v_hash text;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_care_event_id is null or p_request_id is null then raise exception 'invalid_care_withdrawal' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('careEventId',p_care_event_id)::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || p_request_id::text,0));
 select * into v_profile from public.user_profiles where id=v_actor for key share;
 if not found then raise exception 'authentication_required' using errcode='42501'; end if;
 select * into v_request from private.care_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then
   if v_request.operation<>'withdraw' or v_request.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
   if v_request.care_event_id is null or not exists(select 1 from public.care_events where id=v_request.care_event_id) then raise exception 'care_event_not_available' using errcode='P0001'; end if;
   return query select v_request.care_event_id,'withdrawn'::text; return;
 end if;
 select * into v_event from public.care_events where id=p_care_event_id and actor_id=v_actor for update;
 if not found then raise exception 'care_event_not_available' using errcode='P0001'; end if;
 if exists(select 1 from private.care_event_invalidations where care_event_id=v_event.id) then raise exception 'care_event_already_invalidated' using errcode='P0001'; end if;
 insert into private.care_event_invalidations(care_event_id,actor_id,kind,request_id) values(v_event.id,v_actor,'withdrawn',p_request_id);
 insert into private.care_requests(actor_id,request_id,operation,target_id,payload_hash,care_event_id) values(v_actor,p_request_id,'withdraw',v_event.id,v_hash,v_event.id);
 insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(v_actor,'withdraw','care_event',v_event.id,'community_care',p_request_id::text);
 return query select v_event.id,'withdrawn'::text;
end $$;

create function public.correct_care_event(p_care_event_id uuid,p_activity text,p_completed_at timestamptz,p_public_cell text,p_request_id uuid)
returns table ("careEventId" uuid,"replacementCareEventId" uuid,status text)
language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare v_actor uuid:=auth.uid(); v_old public.care_events%rowtype; v_new record; v_request private.care_requests%rowtype; v_hash text;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_care_event_id is null or p_request_id is null then raise exception 'invalid_care_correction' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('careEventId',p_care_event_id,'activity',p_activity,'completedAt',p_completed_at,'publicCell',p_public_cell)::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || p_request_id::text,0));
 select * into v_request from private.care_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then
   if v_request.operation<>'correct' or v_request.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
   if v_request.care_event_id is null or not exists(select 1 from public.care_events where id=v_request.care_event_id)
      or not exists(select 1 from public.care_events where id=p_care_event_id) then raise exception 'care_event_not_available' using errcode='P0001'; end if;
   return query select p_care_event_id,v_request.care_event_id,'corrected'::text; return;
 end if;
 -- Read the source before the guarded record call. That call takes account then animal
 -- locks; we lock the source care fact only afterwards to retain that ordering.
 select * into v_old from public.care_events where id=p_care_event_id and actor_id=v_actor;
 if not found then raise exception 'care_event_not_available' using errcode='P0001'; end if;
 -- Reuse the guarded record path with a deterministic derived request; it checks adult,
 -- availability, supported area and the time window before a replacement is created.
 select * into v_new from public.record_completed_care(v_old.animal_id,p_activity,p_completed_at,p_public_cell,p_request_id);
 -- The nested call owns this request id, so convert its ledger row to correction only after
 -- successful write. Its target remains the replacement event for idempotent replay.
 update private.care_requests set operation='correct',target_id=p_care_event_id,payload_hash=v_hash where actor_id=v_actor and request_id=p_request_id;
 perform 1 from public.care_events where id=p_care_event_id and actor_id=v_actor for update;
 if not found or exists(select 1 from private.care_event_invalidations where care_event_id=p_care_event_id) then raise exception 'care_event_not_available' using errcode='P0001'; end if;
 insert into private.care_event_invalidations(care_event_id,actor_id,kind,replacement_care_event_id,request_id) values(p_care_event_id,v_actor,'corrected',v_new."careEventId",p_request_id);
 return query select p_care_event_id,v_new."careEventId",'corrected'::text;
end $$;

revoke all on function public.record_completed_care(uuid,text,timestamptz,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.list_public_care_history(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.list_my_care_events(integer,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke all on function public.withdraw_care_event(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.correct_care_event(uuid,text,timestamptz,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_completed_care(uuid,text,timestamptz,text,uuid) to authenticated;
grant execute on function public.list_public_care_history(uuid,uuid,integer) to anon,authenticated;
grant execute on function public.list_my_care_events(integer,timestamptz,uuid) to authenticated;
grant execute on function public.withdraw_care_event(uuid,uuid) to authenticated;
grant execute on function public.correct_care_event(uuid,text,timestamptz,text,uuid) to authenticated;

commit;
