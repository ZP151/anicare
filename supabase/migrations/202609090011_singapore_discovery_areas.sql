begin;

-- The same curated Singapore fallback areas serve discovery and completed care.
create or replace function private.care_cell_is_supported(p_cell text)
returns boolean language sql immutable security definer set search_path=pg_catalog
as $$ select p_cell in ('896520ca163ffff','89652636d87ffff','896526add03ffff','896526349cbffff','89652634107ffff','896526362cbffff','89652636287ffff','896520d9073ffff','896520d83c3ffff','896526acebbffff','896526ad803ffff','896520cb1cfffff','896520ca673ffff') $$;
revoke all on function private.care_cell_is_supported(text) from public,anon,authenticated,service_role;

create or replace function public.list_public_cat_discovery(p_public_cell_id text default null,p_verifications text[] default null,p_cursor uuid default null,p_limit integer default 20)
returns table("animalId" uuid,"primaryAlias" text,verification text,"timeBucket" text,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_caller uuid:=auth.uid(); v_cursor_at timestamptz; v_cursor_id uuid;
begin
 if p_public_cell_id is not null and not coalesce(private.care_cell_is_supported(p_public_cell_id),false) then raise exception 'invalid_discovery_filter' using errcode='22023'; end if;
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
commit;
