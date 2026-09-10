begin;

create table private.community_activity (
 id uuid primary key default extensions.gen_random_uuid(),
 kind text not null check(kind in ('comment','like')),
 recipient_id uuid not null references public.user_profiles(id) on delete cascade,
 actor_id uuid not null references public.user_profiles(id) on delete cascade,
 post_id uuid not null references public.community_posts(id) on delete cascade,
 reply_id uuid references public.community_replies(id) on delete cascade,
 event_key text not null unique,
 created_at timestamptz not null default pg_catalog.now(),
 read_at timestamptz,
 check((kind='comment' and reply_id is not null) or (kind='like' and reply_id is null)),
 check(recipient_id<>actor_id)
);
alter table private.community_activity enable row level security;
revoke all on private.community_activity from public,anon,authenticated,service_role;
create index community_activity_recipient_cursor_idx on private.community_activity(recipient_id,created_at desc,id desc);

create or replace function private.record_community_reply_activity() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare recipient uuid;
begin
 select author_id into recipient from public.community_posts where id=new.post_id;
 if recipient is not null and recipient<>new.author_id then
  insert into private.community_activity(kind,recipient_id,actor_id,post_id,reply_id,event_key)
  values('comment',recipient,new.author_id,new.post_id,new.id,'comment:'||new.id::text) on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger community_reply_activity after insert on public.community_replies for each row execute function private.record_community_reply_activity();

create or replace function private.record_community_like_activity() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare recipient uuid;
begin
 select author_id into recipient from public.community_posts where id=new.post_id;
 if recipient is not null and recipient<>new.actor_id then
  insert into private.community_activity(kind,recipient_id,actor_id,post_id,event_key)
  values('like',recipient,new.actor_id,new.post_id,'like:'||new.post_id::text||':'||new.actor_id::text) on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger community_like_activity after insert on private.community_post_likes for each row execute function private.record_community_like_activity();

create or replace function private.community_activity_available(p_event_id uuid,p_recipient uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from private.community_activity event
  join public.user_profiles actor on actor.id=event.actor_id
  where event.id=p_event_id and event.recipient_id=p_recipient
   and private.community_post_available(event.post_id,p_recipient)
   and not exists(select 1 from public.user_blocks block_row where (block_row.blocker_id=p_recipient and block_row.blocked_id=event.actor_id) or (block_row.blocker_id=event.actor_id and block_row.blocked_id=p_recipient))
   and ((event.kind='comment' and exists(select 1 from public.community_replies reply where reply.id=event.reply_id and reply.post_id=event.post_id and reply.author_id=event.actor_id and reply.deleted_at is null and reply.moderation_hidden_at is null))
     or (event.kind='like' and exists(select 1 from private.community_post_likes like_row where like_row.post_id=event.post_id and like_row.actor_id=event.actor_id))));
$$;

create or replace function public.list_my_community_activity(p_cursor uuid default null,p_limit integer default 20)
returns table("eventId" uuid,kind text,"postId" uuid,"replyId" uuid,actor jsonb,"createdAt" timestamptz,"readAt" timestamptz,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare recipient uuid:=auth.uid(); cursor_created timestamptz; cursor_id uuid;
begin
 if recipient is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_community_activity_limit' using errcode='22023'; end if;
 if p_cursor is not null then
  select event.created_at,event.id into cursor_created,cursor_id from private.community_activity event where event.id=p_cursor and event.recipient_id=recipient and private.community_activity_available(event.id,recipient);
  if not found then raise exception 'invalid_community_activity_cursor' using errcode='P0001'; end if;
 end if;
 return query select event.id,event.kind,event.post_id,event.reply_id,jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),event.created_at,event.read_at,event.id
 from private.community_activity event join public.user_profiles profile on profile.id=event.actor_id
 where event.recipient_id=recipient and private.community_activity_available(event.id,recipient)
  and (p_cursor is null or (event.created_at,event.id)<(cursor_created,cursor_id))
 order by event.created_at desc,event.id desc limit p_limit;
end $$;

create or replace function public.mark_community_activity_read(p_event_ids uuid[])
returns table("eventId" uuid,"readAt" timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare recipient uuid:=auth.uid();
begin
 if recipient is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_event_ids is null or cardinality(p_event_ids)>50 then raise exception 'invalid_community_activity_request' using errcode='22023'; end if;
 return query update private.community_activity event set read_at=coalesce(event.read_at,now())
 where event.recipient_id=recipient and event.id=any(p_event_ids) returning event.id,event.read_at;
end $$;

revoke all on function private.community_activity_available(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.list_my_community_activity(uuid,integer),public.mark_community_activity_read(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.list_my_community_activity(uuid,integer),public.mark_community_activity_read(uuid[]) to authenticated;
commit;
