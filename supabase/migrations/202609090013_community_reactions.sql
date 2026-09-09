begin;
create table private.community_post_likes (
 post_id uuid not null references public.community_posts(id) on delete cascade,
 actor_id uuid not null references public.user_profiles(id) on delete cascade,
 created_at timestamptz not null default pg_catalog.now(),
 primary key(post_id,actor_id)
);
alter table private.community_post_likes enable row level security;
revoke all on private.community_post_likes from public,anon,authenticated,service_role;
create index community_post_likes_actor_idx on private.community_post_likes(actor_id,post_id);

create function public.get_community_post_reactions(p_post_ids uuid[])
returns table("postId" uuid,"likeCount" integer,liked boolean)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if coalesce(cardinality(p_post_ids),0)>50 then raise exception 'invalid_reaction_request' using errcode='22023'; end if;
 return query select p.id,count(l.actor_id)::integer,coalesce(bool_or(l.actor_id=auth.uid()),false)
 from public.community_posts p left join private.community_post_likes l on l.post_id=p.id
 and (auth.uid() is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=l.actor_id) or (b.blocker_id=l.actor_id and b.blocked_id=auth.uid())))
 where p.id=any(coalesce(p_post_ids,'{}'::uuid[])) and private.community_post_available(p.id,auth.uid()) group by p.id;
end $$;
create function public.set_community_post_like(p_post_id uuid,p_liked boolean)
returns table("postId" uuid,"likeCount" integer,liked boolean)
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_post_id is null or p_liked is null then raise exception 'invalid_community_like' using errcode='22023'; end if;
 perform 1 from public.user_profiles where id=v_actor for share;
 if not private.community_mutation_eligible(v_actor) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 perform 1 from public.community_posts where id=p_post_id for update;
 if not found or not private.community_post_available(p_post_id,v_actor) then raise exception 'community_post_not_available' using errcode='P0001'; end if;
 if p_liked then insert into private.community_post_likes(post_id,actor_id) values(p_post_id,v_actor) on conflict do nothing;
 else delete from private.community_post_likes where post_id=p_post_id and actor_id=v_actor; end if;
 return query select * from public.get_community_post_reactions(array[p_post_id]);
end $$;
revoke all on function public.get_community_post_reactions(uuid[]),public.set_community_post_like(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_community_post_reactions(uuid[]) to anon,authenticated;
grant execute on function public.set_community_post_like(uuid,boolean) to authenticated;
commit;
