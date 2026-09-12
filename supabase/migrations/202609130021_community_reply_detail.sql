begin;
-- A minimal direct public read makes a notification target independent of paging.
create or replace function public.get_public_community_reply(p_reply_id uuid)
returns table("replyId" uuid,body text,"createdAt" timestamptz,author jsonb,"canDelete" boolean,cursor uuid)
language sql stable security definer set search_path=pg_catalog as $$
 select r.id,r.body,r.created_at,
 jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),
 coalesce(auth.uid() is not null and r.author_id=auth.uid(),false),r.id
 from public.community_replies r left join public.user_profiles profile on profile.id=r.author_id
 where r.id=p_reply_id and private.community_reply_available(r.id,auth.uid());
$$;
revoke all on function public.get_public_community_reply(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_public_community_reply(uuid) to anon,authenticated;
commit;
