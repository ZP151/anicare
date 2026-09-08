begin;
-- Public building/project names are opt-in report context. No precise coordinate projection.
create function public.get_public_sighting_places(p_sighting_ids uuid[])
returns table ("sightingId" uuid,"residenceType" text,"residenceName" text)
language sql stable security definer set search_path=pg_catalog as $$
 select s.id,s.traits->'public_place'->>'residenceType',btrim(s.traits->'public_place'->>'name')
 from public.sightings s
 where cardinality(p_sighting_ids) between 1 and 50 and s.id=any(p_sighting_ids)
   and s.visibility='public'::public.record_visibility and s.visible_at<=now()
   and s.risk<>'critical'::public.risk_tier
   and private.is_public_cat_available(s.animal_id,auth.uid())
   and private.current_care_risk(s.animal_id)<>'critical'::public.risk_tier
   and (auth.uid() is null or s.reporter_id is null or not exists (
     select 1 from public.user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=s.reporter_id)
       or (b.blocker_id=s.reporter_id and b.blocked_id=auth.uid())))
   and jsonb_typeof(s.traits->'public_place')='object'
   and s.traits->'public_place'->>'residenceType' in ('hdb','condo','other')
   and jsonb_typeof(s.traits->'public_place'->'name')='string'
   and char_length(btrim(s.traits->'public_place'->>'name')) between 1 and 100
   and s.traits->'public_place'->>'name' !~ '[[:cntrl:]]'
 order by s.id;
$$;
revoke all on function public.get_public_sighting_places(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_public_sighting_places(uuid[]) to anon,authenticated;
comment on function public.get_public_sighting_places(uuid[]) is 'Reporter-provided public building/project context for an already visible delayed sighting; not a verified cat residence.';

create function public.list_public_cat_community_activity(p_animal_id uuid)
returns table ("publicCellId" text,"timeBucket" text,"residenceType" text,"residenceName" text)
language sql stable security definer set search_path=pg_catalog as $$
 select s.public_cell_id,
   case when s.visible_at>=date_trunc('day',now()) then 'today' when s.visible_at>=date_trunc('day',now())-interval '6 days' then 'this_week' else 'earlier' end,
   place."residenceType",place."residenceName"
 from public.sightings s
 left join lateral public.get_public_sighting_places(array[s.id]) place on true
 where s.animal_id=p_animal_id and s.visibility='public'::public.record_visibility and s.visible_at<=now()
   and s.risk<>'critical'::public.risk_tier
   and private.is_public_cat_available(s.animal_id,auth.uid())
   and private.current_care_risk(s.animal_id)<>'critical'::public.risk_tier
   and (auth.uid() is null or s.reporter_id is null or not exists (
     select 1 from public.user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=s.reporter_id)
       or (b.blocker_id=s.reporter_id and b.blocked_id=auth.uid())))
 order by s.visible_at desc,s.id desc limit 10;
$$;
revoke all on function public.list_public_cat_community_activity(uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_public_cat_community_activity(uuid) to anon,authenticated;
commit;
