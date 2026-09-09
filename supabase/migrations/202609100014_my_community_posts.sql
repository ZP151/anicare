begin;

create index community_posts_owner_cursor_idx
 on public.community_posts(author_id,created_at desc,id desc) where deleted_at is null;

create function public.list_my_community_posts(p_cursor uuid default null,p_limit integer default 20)
returns table("postId" uuid,body text,"catId" uuid,"communitySlug" text,"createdAt" timestamptz,author jsonb,"replyCount" integer,"canDelete" boolean,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_cursor is not null then
  select p.created_at,p.id into v_created,v_id from public.community_posts p
   where p.id=p_cursor and p.author_id=v_actor and private.community_post_available(p.id,v_actor);
  if not found then raise exception 'invalid_community_cursor' using errcode='P0001'; end if;
 end if;
 -- Reuse the public projection: ownership does not bypass cat visibility,
 -- moderation, deletion or blocked reply filtering.
 return query select item.* from public.community_posts p
 cross join lateral public.get_public_community_post(p.id) item
 where p.author_id=v_actor and p.deleted_at is null
  and (p_cursor is null or (p.created_at,p.id)<(v_created,v_id))
 order by p.created_at desc,p.id desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

revoke all on function public.list_my_community_posts(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_community_posts(uuid,integer) to authenticated;
commit;
