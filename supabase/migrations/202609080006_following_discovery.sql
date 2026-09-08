begin;

create table private.follow_requests (
 actor_id uuid not null references public.user_profiles(id) on delete cascade,
 request_id uuid not null,
 operation text not null check(operation in ('follow','unfollow')),
 animal_id uuid not null,
 payload_hash text not null,
 following boolean not null,
 followed_at timestamptz,
 created_at timestamptz not null default pg_catalog.now(),
 primary key(actor_id,request_id)
);
revoke all on table public.follows from public,anon,authenticated;
alter table private.follow_requests enable row level security;
revoke all on table private.follow_requests from public,anon,authenticated,service_role;
create index follows_follower_created_idx on public.follows(follower_id,created_at desc,id desc) where animal_id is not null;

create function private.follow_target_available(p_animal_id uuid,p_actor_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select private.is_public_cat_available(p_animal_id,p_actor_id)
$$;
revoke all on function private.follow_target_available(uuid,uuid) from public,anon,authenticated,service_role;

create function public.follow_animal(p_animal_id uuid,p_request_id uuid)
returns table("animalId" uuid,following boolean,"followedAt" timestamptz)
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_request private.follow_requests%rowtype; v_animal public.animals%rowtype; v_follow public.follows%rowtype; v_hash text;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_animal_id is null or p_request_id is null then raise exception 'invalid_follow_request' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('animalId',p_animal_id)::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0));
 perform 1 from public.user_profiles where id=v_actor for key share;
 if not found then raise exception 'authentication_required' using errcode='42501'; end if;
 select * into v_request from private.follow_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then
  if v_request.operation<>'follow' or v_request.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
  if not private.follow_target_available(v_request.animal_id,v_actor) then raise exception 'follow_animal_not_available' using errcode='P0001'; end if;
  return query select v_request.animal_id,true,v_request.followed_at; return;
 end if;
 select * into v_animal from public.animals where id=p_animal_id for update;
 if not found or not private.follow_target_available(p_animal_id,v_actor) then raise exception 'follow_animal_not_available' using errcode='P0001'; end if;
 insert into public.follows(follower_id,animal_id) values(v_actor,p_animal_id) on conflict(follower_id,animal_id,public_cell_id) do nothing;
 select * into v_follow from public.follows where follower_id=v_actor and animal_id=p_animal_id for update;
 insert into private.follow_requests(actor_id,request_id,operation,animal_id,payload_hash,following,followed_at) values(v_actor,p_request_id,'follow',p_animal_id,v_hash,true,v_follow.created_at);
 insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(v_actor,'follow','animal',p_animal_id,'community_follow',p_request_id::text);
 return query select p_animal_id,true,v_follow.created_at;
end $$;

create function public.unfollow_animal(p_animal_id uuid,p_request_id uuid)
returns table("animalId" uuid,following boolean,"followedAt" timestamptz)
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_request private.follow_requests%rowtype; v_animal public.animals%rowtype; v_hash text;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_animal_id is null or p_request_id is null then raise exception 'invalid_follow_request' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('animalId',p_animal_id)::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0));
 perform 1 from public.user_profiles where id=v_actor for key share; if not found then raise exception 'authentication_required' using errcode='42501'; end if;
 select * into v_request from private.follow_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then
  if v_request.operation<>'unfollow' or v_request.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
  if not exists(select 1 from public.animals where id=v_request.animal_id) then raise exception 'follow_animal_not_available' using errcode='P0001'; end if;
  return query select v_request.animal_id,false,null::timestamptz; return;
 end if;
 -- Do not require public eligibility for an existing owner follow after hiding;
 -- an unfollow request must not turn hidden/deleted targets into an existence oracle.
 select * into v_animal from public.animals where id=p_animal_id for update;
 if not found then raise exception 'follow_animal_not_available' using errcode='P0001'; end if;
 if not private.follow_target_available(p_animal_id,v_actor)
    and not exists(select 1 from public.follows where follower_id=v_actor and animal_id=p_animal_id) then
   raise exception 'follow_animal_not_available' using errcode='P0001';
 end if;
 delete from public.follows where follower_id=v_actor and animal_id=p_animal_id;
 insert into private.follow_requests(actor_id,request_id,operation,animal_id,payload_hash,following) values(v_actor,p_request_id,'unfollow',p_animal_id,v_hash,false);
 insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(v_actor,'unfollow','animal',p_animal_id,'community_follow',p_request_id::text);
 return query select p_animal_id,false,null::timestamptz;
end $$;

create function public.get_my_follow_state(p_animal_id uuid)
returns table("animalId" uuid,following boolean)
language sql stable security definer set search_path=pg_catalog as $$
 select animal.id,exists(select 1 from public.follows follow where follow.follower_id=auth.uid() and follow.animal_id=animal.id)
 from public.animals animal where animal.id=p_animal_id and private.follow_target_available(animal.id,auth.uid())
$$;

create function public.list_my_followed_cats(p_cursor uuid default null,p_limit integer default 20)
returns table("animalId" uuid,"primaryAlias" text,verification text,"timeBucket" text,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_cursor is not null then select created_at,id into v_created,v_id from public.follows where id=p_cursor and follower_id=v_actor and animal_id is not null; if not found then raise exception 'invalid_follow_cursor' using errcode='P0001'; end if; end if;
 return query select summary."animalId",summary."primaryAlias",summary.verification,summary."timeBucket",follow.id
 from public.follows follow cross join lateral public.get_public_cat_summary(follow.animal_id) summary
 where follow.follower_id=v_actor and follow.animal_id is not null
  and (p_cursor is null or (follow.created_at,follow.id)<(v_created,v_id))
 order by follow.created_at desc,follow.id desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

create function private.discoverable_cat_rows(p_cell text,p_verifications text[],p_caller uuid)
returns table(animal_id uuid,primary_alias text,verification text,visible_at timestamptz,cursor uuid)
language sql stable security definer set search_path=pg_catalog as $$
 select distinct on (animal.id) animal.id,animal.primary_alias,animal.verification::text,sighting.visible_at,sighting.id
 from public.animals animal join public.sightings sighting on sighting.animal_id=animal.id
 where private.is_public_cat_available(animal.id,p_caller)
  and sighting.visibility='public'::public.record_visibility and sighting.visible_at<=pg_catalog.now()
  and sighting.risk<>'critical'::public.risk_tier
  and (p_cell is null or sighting.public_cell_id=p_cell)
  and (p_verifications is null or animal.verification::text=any(p_verifications))
  and (p_caller is null or sighting.reporter_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=p_caller and b.blocked_id=sighting.reporter_id) or (b.blocker_id=sighting.reporter_id and b.blocked_id=p_caller)))
 order by animal.id,sighting.visible_at desc,sighting.id desc
$$;
revoke all on function private.discoverable_cat_rows(text,text[],uuid) from public,anon,authenticated,service_role;

create function public.list_public_cat_discovery(p_public_cell_id text default null,p_verifications text[] default null,p_cursor uuid default null,p_limit integer default 20)
returns table("animalId" uuid,"primaryAlias" text,verification text,"timeBucket" text,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_caller uuid:=auth.uid(); v_cursor_at timestamptz; v_cursor_id uuid;
begin
 if p_public_cell_id is not null and p_public_cell_id not in ('896520ca163ffff','89652636d87ffff','896526add03ffff') then raise exception 'invalid_discovery_filter' using errcode='22023'; end if;
 if p_verifications is not null and (cardinality(p_verifications)>5 or exists(select 1 from unnest(p_verifications) value where value is null or value not in ('reported','community_confirmed','partner_confirmed','disputed','superseded'))) then raise exception 'invalid_discovery_filter' using errcode='22023'; end if;
 if p_cursor is not null then
  select eligible.visible_at,eligible.cursor into v_cursor_at,v_cursor_id from private.discoverable_cat_rows(p_public_cell_id,p_verifications,v_caller) eligible where eligible.cursor=p_cursor;
  if not found then raise exception 'invalid_discovery_cursor' using errcode='P0001'; end if;
 end if;
 return query select eligible.animal_id,eligible.primary_alias,eligible.verification,
  case when eligible.visible_at>=pg_catalog.date_trunc('day',pg_catalog.now()) then 'today' when eligible.visible_at>=pg_catalog.date_trunc('day',pg_catalog.now())-interval '6 days' then 'this_week' else 'earlier' end,eligible.cursor
 from private.discoverable_cat_rows(p_public_cell_id,p_verifications,v_caller) eligible
 where p_cursor is null or (eligible.visible_at,eligible.cursor)<(v_cursor_at,v_cursor_id)
 order by eligible.visible_at desc,eligible.cursor desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

revoke all on function public.follow_animal(uuid,uuid),public.unfollow_animal(uuid,uuid),public.get_my_follow_state(uuid),public.list_my_followed_cats(uuid,integer),public.list_public_cat_discovery(text,text[],uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.follow_animal(uuid,uuid),public.unfollow_animal(uuid,uuid),public.get_my_follow_state(uuid),public.list_my_followed_cats(uuid,integer) to authenticated;
grant execute on function public.list_public_cat_discovery(text,text[],uuid,integer) to anon,authenticated;
commit;
