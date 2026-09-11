begin;

alter table public.community_replies add column parent_reply_id uuid references public.community_replies(id) on delete cascade;
create index community_replies_parent_cursor_idx on public.community_replies(parent_reply_id,created_at,id) where deleted_at is null;

create table private.direct_conversations (
 id uuid primary key default extensions.gen_random_uuid(),
 member_low_id uuid not null references public.user_profiles(id) on delete cascade,
 member_high_id uuid not null references public.user_profiles(id) on delete cascade,
 requested_by uuid not null references public.user_profiles(id) on delete cascade,
 status text not null check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default pg_catalog.now(),
 updated_at timestamptz not null default pg_catalog.now(),
 check(member_low_id<member_high_id), check(requested_by=member_low_id or requested_by=member_high_id),
 unique(member_low_id,member_high_id)
);
create table private.direct_conversation_members (
 conversation_id uuid not null references private.direct_conversations(id) on delete cascade,
 member_id uuid not null references public.user_profiles(id) on delete cascade,
 last_read_message_id uuid, last_read_at timestamptz,
 primary key(conversation_id,member_id)
);
create table private.direct_messages (
 id uuid primary key default extensions.gen_random_uuid(),
 conversation_id uuid not null references private.direct_conversations(id) on delete cascade,
 sender_id uuid not null references public.user_profiles(id) on delete cascade,
 body text not null check(pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 2000),
 request_id uuid not null,
 created_at timestamptz not null default pg_catalog.now(),
 unique(sender_id,request_id)
);
alter table private.direct_conversation_members add constraint direct_conversation_members_last_read_fk foreign key(last_read_message_id) references private.direct_messages(id) on delete set null;
create index direct_messages_conversation_cursor_idx on private.direct_messages(conversation_id,created_at,id);
create table private.direct_message_requests (
 actor_id uuid not null references public.user_profiles(id) on delete cascade,
 request_id uuid not null, operation text not null check(operation in ('request','respond','send','block')),
 payload_hash text not null, result_conversation_id uuid references private.direct_conversations(id) on delete set null,
 result_message_id uuid references private.direct_messages(id) on delete set null,
 primary key(actor_id,request_id)
);
alter table private.direct_conversations enable row level security;
alter table private.direct_conversation_members enable row level security;
alter table private.direct_messages enable row level security;
alter table private.direct_message_requests enable row level security;
revoke all on table private.direct_conversations,private.direct_conversation_members,private.direct_messages,private.direct_message_requests from public,anon,authenticated,service_role;

create or replace function private.direct_conversation_available(p_conversation_id uuid,p_actor uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select p_actor is not null and exists(select 1 from private.direct_conversations c join private.direct_conversation_members m on m.conversation_id=c.id and m.member_id=p_actor
  where c.id=p_conversation_id
    and not exists(select 1 from private.account_erasure_requests e where e.target_subject_id in (c.member_low_id,c.member_high_id) and e.status<>'completed')
    and not exists(select 1 from public.user_blocks b where (b.blocker_id=c.member_low_id and b.blocked_id=c.member_high_id) or (b.blocker_id=c.member_high_id and b.blocked_id=c.member_low_id)));
$$;

create or replace function private.purge_direct_messages_for_erasure() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 delete from private.direct_conversations where member_low_id=old.id or member_high_id=old.id;
 return old;
end $$;
create trigger zzz_purge_direct_messages_for_erasure before delete on public.user_profiles for each row execute function private.purge_direct_messages_for_erasure();

drop function if exists public.get_community_author(text,uuid);
create function public.get_community_author(p_content_type text,p_content_id uuid)
returns table(author jsonb,"canMessage" boolean,"conversationId" uuid) language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_author uuid; v_conversation uuid;
begin
 select author_id into v_author from private.community_target_available(p_content_type,p_content_id,v_actor);
 if not found then return; end if;
 if v_actor is not null and v_author is not null and v_author<>v_actor then select c.id into v_conversation from private.direct_conversations c where c.member_low_id=least(v_actor,v_author) and c.member_high_id=greatest(v_actor,v_author) and private.direct_conversation_available(c.id,v_actor); end if;
 return query select jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),
  coalesce(v_conversation is null and v_actor is not null and v_author is not null and v_author<>v_actor and not exists(select 1 from private.account_erasure_requests e where e.target_subject_id in (v_actor,v_author) and e.status<>'completed') and not exists(select 1 from public.user_blocks b where (b.blocker_id=v_actor and b.blocked_id=v_author) or (b.blocker_id=v_author and b.blocked_id=v_actor)),false),v_conversation
 from public.user_profiles profile where profile.id=v_author;
end $$;

create or replace function public.create_direct_message_request(p_content_type text,p_content_id uuid,p_body text,p_request_id uuid)
returns table("conversationId" uuid,"messageId" uuid,status text,"createdAt" timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_target uuid; v_body text:=nullif(pg_catalog.btrim(p_body),''); v_hash text; v_prior private.direct_message_requests%rowtype; v_conversation private.direct_conversations%rowtype; v_message private.direct_messages%rowtype;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if v_body is null or pg_catalog.char_length(v_body)>2000 or p_request_id is null then raise exception 'invalid_direct_message_request' using errcode='22023'; end if;
 select author_id into v_target from private.community_target_available(p_content_type,p_content_id,v_actor);
 if not found or v_target is null or v_target=v_actor or exists(select 1 from private.account_erasure_requests e where e.target_subject_id in (v_actor,v_target) and e.status<>'completed') then raise exception 'direct_message_target_not_available' using errcode='P0001'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('contentType',p_content_type,'contentId',p_content_id,'body',v_body)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.direct_message_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation<>'request' or v_prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; select * into v_conversation from private.direct_conversations where id=v_prior.result_conversation_id; select * into v_message from private.direct_messages where id=v_prior.result_message_id; return query select v_conversation.id,v_message.id,v_conversation.status,v_message.created_at; return; end if;
 select * into v_conversation from private.direct_conversations where member_low_id=least(v_actor,v_target) and member_high_id=greatest(v_actor,v_target) for update;
 if found then raise exception 'direct_message_request_not_available' using errcode='P0001'; end if;
 insert into private.direct_conversations(member_low_id,member_high_id,requested_by,status) values(least(v_actor,v_target),greatest(v_actor,v_target),v_actor,'pending') returning * into v_conversation;
 insert into private.direct_conversation_members(conversation_id,member_id) values(v_conversation.id,v_actor),(v_conversation.id,v_target);
 insert into private.direct_messages(conversation_id,sender_id,body,request_id) values(v_conversation.id,v_actor,v_body,p_request_id) returning * into v_message;
 insert into private.direct_message_requests(actor_id,request_id,operation,payload_hash,result_conversation_id,result_message_id) values(v_actor,p_request_id,'request',v_hash,v_conversation.id,v_message.id);
 return query select v_conversation.id,v_message.id,v_conversation.status,v_message.created_at;
end $$;

create or replace function public.respond_direct_message_request(p_conversation_id uuid,p_accept boolean,p_request_id uuid)
returns table("conversationId" uuid,status text,"updatedAt" timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_hash text; v_prior private.direct_message_requests%rowtype; v_conversation private.direct_conversations%rowtype;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_conversation_id is null or p_accept is null or p_request_id is null then raise exception 'invalid_direct_message_response' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('conversationId',p_conversation_id,'accept',p_accept)::text,'sha256'),'hex'); perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.direct_message_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation<>'respond' or v_prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; select * into v_conversation from private.direct_conversations where id=v_prior.result_conversation_id; return query select v_conversation.id,v_conversation.status,v_conversation.updated_at; return; end if;
 select * into v_conversation from private.direct_conversations where id=p_conversation_id for update;
 if not found or not private.direct_conversation_available(p_conversation_id,v_actor) or v_conversation.status<>'pending' or v_conversation.requested_by=v_actor then raise exception 'direct_message_request_not_available' using errcode='P0001'; end if;
 update private.direct_conversations set status=case when p_accept then 'accepted' else 'rejected' end,updated_at=now() where id=p_conversation_id returning * into v_conversation;
 insert into private.direct_message_requests(actor_id,request_id,operation,payload_hash,result_conversation_id) values(v_actor,p_request_id,'respond',v_hash,v_conversation.id);
 return query select v_conversation.id,v_conversation.status,v_conversation.updated_at;
end $$;

create or replace function public.list_my_direct_conversations(p_cursor uuid default null,p_limit integer default 20)
returns table("conversationId" uuid,status text,"isIncoming" boolean,"otherMember" jsonb,"lastMessagePreview" text,"lastMessageAt" timestamptz,"unreadCount" integer,"createdAt" timestamptz,cursor uuid) language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_direct_message_limit' using errcode='22023'; end if;
 if p_cursor is not null then select c.updated_at,c.id into v_created,v_id from private.direct_conversations c where c.id=p_cursor and private.direct_conversation_available(c.id,v_actor); if not found then raise exception 'invalid_direct_message_cursor' using errcode='P0001'; end if; end if;
 return query select c.id,c.status,c.requested_by<>v_actor,jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),last_message.body,last_message.created_at,(select count(*)::integer from private.direct_messages unread where unread.conversation_id=c.id and unread.sender_id<>v_actor and (member.last_read_at is null or unread.created_at>member.last_read_at)),c.created_at,c.id
 from private.direct_conversations c join private.direct_conversation_members member on member.conversation_id=c.id and member.member_id=v_actor join public.user_profiles profile on profile.id=case when c.member_low_id=v_actor then c.member_high_id else c.member_low_id end left join lateral(select m.body,m.created_at from private.direct_messages m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1) last_message on true
 where private.direct_conversation_available(c.id,v_actor) and (p_cursor is null or (c.updated_at,c.id)<(v_created,v_id)) order by c.updated_at desc,c.id desc limit p_limit;
end $$;
create or replace function public.get_direct_conversation(p_conversation_id uuid)
returns table("conversationId" uuid,status text,"isIncoming" boolean,"otherMember" jsonb,"lastMessagePreview" text,"lastMessageAt" timestamptz,"unreadCount" integer,"createdAt" timestamptz,cursor uuid) language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 return query select c.id,c.status,c.requested_by<>v_actor,jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),last_message.body,last_message.created_at,(select count(*)::integer from private.direct_messages unread where unread.conversation_id=c.id and unread.sender_id<>v_actor and (member.last_read_at is null or unread.created_at>member.last_read_at)),c.created_at,c.id
 from private.direct_conversations c join private.direct_conversation_members member on member.conversation_id=c.id and member.member_id=v_actor join public.user_profiles profile on profile.id=case when c.member_low_id=v_actor then c.member_high_id else c.member_low_id end left join lateral(select m.body,m.created_at from private.direct_messages m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1) last_message on true where c.id=p_conversation_id and private.direct_conversation_available(c.id,v_actor);
end $$;

create or replace function public.list_direct_messages(p_conversation_id uuid,p_cursor uuid default null,p_limit integer default 50)
returns table("messageId" uuid,body text,"sentAt" timestamptz,"isMine" boolean,"requestId" text,cursor uuid) language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_limit is null or p_limit not between 1 and 50 or not private.direct_conversation_available(p_conversation_id,v_actor) then raise exception 'direct_message_not_available' using errcode='P0001'; end if;
 if p_cursor is not null then select m.created_at,m.id into v_created,v_id from private.direct_messages m where m.id=p_cursor and m.conversation_id=p_conversation_id; if not found then raise exception 'invalid_direct_message_cursor' using errcode='P0001'; end if; end if;
 return query select page.id,page.body,page.created_at,page.sender_id=v_actor,case when page.sender_id=v_actor then page.request_id::text else null end,page.id from (select m.* from private.direct_messages m where m.conversation_id=p_conversation_id and (p_cursor is null or (m.created_at,m.id)<(v_created,v_id)) order by m.created_at desc,m.id desc limit p_limit) page order by page.created_at,page.id;
end $$;

create or replace function public.send_direct_message(p_conversation_id uuid,p_body text,p_request_id uuid)
returns table("conversationId" uuid,"messageId" uuid,"sentAt" timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_body text:=nullif(btrim(p_body),''); v_hash text; v_prior private.direct_message_requests%rowtype; v_conversation private.direct_conversations%rowtype; v_message private.direct_messages%rowtype;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_conversation_id is null or v_body is null or char_length(v_body)>2000 or p_request_id is null then raise exception 'invalid_direct_message' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('conversationId',p_conversation_id,'body',v_body)::text,'sha256'),'hex'); perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.direct_message_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation<>'send' or v_prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; select * into v_message from private.direct_messages where id=v_prior.result_message_id; return query select v_prior.result_conversation_id,v_message.id,v_message.created_at; return; end if;
 select * into v_conversation from private.direct_conversations where id=p_conversation_id for update; if not found or v_conversation.status<>'accepted' or not private.direct_conversation_available(p_conversation_id,v_actor) then raise exception 'direct_message_not_available' using errcode='P0001'; end if;
 insert into private.direct_messages(conversation_id,sender_id,body,request_id) values(p_conversation_id,v_actor,v_body,p_request_id) returning * into v_message; update private.direct_conversations set updated_at=v_message.created_at where id=p_conversation_id;
 insert into private.direct_message_requests(actor_id,request_id,operation,payload_hash,result_conversation_id,result_message_id) values(v_actor,p_request_id,'send',v_hash,p_conversation_id,v_message.id); return query select p_conversation_id,v_message.id,v_message.created_at;
end $$;

create or replace function public.mark_direct_conversation_read(p_conversation_id uuid,p_message_id uuid)
returns table("conversationId" uuid,"readAt" timestamptz,"messageId" uuid) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_message private.direct_messages%rowtype; v_read_at timestamptz;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if; if not private.direct_conversation_available(p_conversation_id,v_actor) then raise exception 'direct_message_not_available' using errcode='P0001'; end if; select * into v_message from private.direct_messages where id=p_message_id and conversation_id=p_conversation_id; if not found then raise exception 'direct_message_not_available' using errcode='P0001'; end if;
 update private.direct_conversation_members set last_read_message_id=v_message.id,last_read_at=greatest(coalesce(last_read_at,'epoch'::timestamptz),v_message.created_at) where conversation_id=p_conversation_id and member_id=v_actor returning last_read_at into v_read_at; return query select p_conversation_id,v_read_at,v_message.id;
end $$;

create or replace function public.block_direct_conversation(p_conversation_id uuid,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_target uuid; v_hash text; v_prior private.direct_message_requests%rowtype;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_conversation_id is null or p_request_id is null then raise exception 'invalid_direct_message_block' using errcode='22023'; end if; v_hash:=encode(extensions.digest(jsonb_build_object('conversationId',p_conversation_id)::text,'sha256'),'hex'); perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.direct_message_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation<>'block' or v_prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return p_request_id; end if;
 select case when member_low_id=v_actor then member_high_id else member_low_id end into v_target from private.direct_conversations where id=p_conversation_id and (member_low_id=v_actor or member_high_id=v_actor); if not found then raise exception 'direct_message_not_available' using errcode='P0001'; end if; perform public.block_user(v_target,p_request_id); insert into private.direct_message_requests(actor_id,request_id,operation,payload_hash,result_conversation_id) values(v_actor,p_request_id,'block',v_hash,p_conversation_id); return p_request_id;
end $$;

create or replace function private.community_reply_available(p_reply_id uuid,p_actor uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.community_replies r where r.id=p_reply_id and r.deleted_at is null and r.moderation_hidden_at is null and private.community_post_available(r.post_id,p_actor) and (r.parent_reply_id is null or exists(select 1 from public.community_replies parent where parent.id=r.parent_reply_id and parent.deleted_at is null and parent.moderation_hidden_at is null)) and (p_actor is null or r.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=p_actor and b.blocked_id=r.author_id) or (b.blocker_id=r.author_id and b.blocked_id=p_actor))));
$$;
create or replace function public.create_community_comment_reply(p_parent_reply_id uuid,p_body text,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_body text:=nullif(btrim(p_body),''); v_parent public.community_replies%rowtype; v_id uuid; v_hash text; v_prior private.safety_requests%rowtype;
begin
 if v_actor is null or not private.community_mutation_eligible(v_actor) then raise exception 'adult_contributor_required' using errcode='42501'; end if; if p_parent_reply_id is null or v_body is null or char_length(v_body)>2000 or p_request_id is null then raise exception 'invalid_community_reply' using errcode='22023'; end if; v_hash:=encode(extensions.digest(jsonb_build_object('parentReplyId',p_parent_reply_id,'body',v_body)::text,'sha256'),'hex'); perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.safety_requests where actor_id=v_actor and request_id=p_request_id for update; if found then if v_prior.operation<>'community_reply' or v_prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return v_prior.result_id; end if;
 select * into v_parent from public.community_replies where id=p_parent_reply_id for update; if not found or v_parent.parent_reply_id is not null or not private.community_reply_available(p_parent_reply_id,v_actor) then raise exception 'community_reply_not_available' using errcode='P0001'; end if; insert into public.community_replies(post_id,parent_reply_id,author_id,body) values(v_parent.post_id,p_parent_reply_id,v_actor,v_body) returning id into v_id; insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash,result_id) values(v_actor,p_request_id,'community_reply',v_parent.post_id,v_hash,v_id); return v_id;
end $$;
create or replace function public.list_community_comment_replies(p_parent_reply_id uuid,p_cursor uuid default null,p_limit integer default 30) returns table("replyId" uuid,body text,"createdAt" timestamptz,author jsonb,"canDelete" boolean,cursor uuid) language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if not private.community_reply_available(p_parent_reply_id,v_actor) then raise exception 'community_reply_not_available' using errcode='P0001'; end if; if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_community_reply_limit' using errcode='22023'; end if; if p_cursor is not null then select r.created_at,r.id into v_created,v_id from public.community_replies r where r.id=p_cursor and r.parent_reply_id=p_parent_reply_id and private.community_reply_available(r.id,v_actor); if not found then raise exception 'invalid_community_cursor' using errcode='P0001'; end if; end if; return query select r.id,r.body,r.created_at,jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),coalesce(v_actor is not null and r.author_id=v_actor,false),r.id from public.community_replies r left join public.user_profiles profile on profile.id=r.author_id where r.parent_reply_id=p_parent_reply_id and private.community_reply_available(r.id,v_actor) and (p_cursor is null or (r.created_at,r.id)>(v_created,v_id)) order by r.created_at,r.id limit p_limit;
end $$;
create or replace function public.get_community_comment_context(p_reply_id uuid) returns table("replyId" uuid,"postId" uuid,"parentReplyId" uuid) language sql stable security definer set search_path=pg_catalog as $$ select r.id,r.post_id,r.parent_reply_id from public.community_replies r where r.id=p_reply_id and private.community_reply_available(r.id,auth.uid()) $$;

alter table private.community_activity add column parent_reply_id uuid references public.community_replies(id) on delete cascade;
alter table private.community_activity drop constraint community_activity_kind_check;
alter table private.community_activity add constraint community_activity_kind_check check(kind in ('comment','comment_reply','like'));
alter table private.community_activity drop constraint community_activity_check;
alter table private.community_activity add constraint community_activity_check check((kind in ('comment','comment_reply') and reply_id is not null) or (kind='like' and reply_id is null));
create or replace function private.record_community_reply_activity() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_post_author uuid; v_parent_author uuid;
begin
 select author_id into v_post_author from public.community_posts where id=new.post_id;
 if new.parent_reply_id is null then if v_post_author is not null and v_post_author<>new.author_id then insert into private.community_activity(kind,recipient_id,actor_id,post_id,reply_id,event_key) values('comment',v_post_author,new.author_id,new.post_id,new.id,'comment:'||new.id::text) on conflict(event_key) do nothing; end if;
 else select author_id into v_parent_author from public.community_replies where id=new.parent_reply_id; if v_parent_author is not null and v_parent_author<>new.author_id then insert into private.community_activity(kind,recipient_id,actor_id,post_id,reply_id,parent_reply_id,event_key) values('comment_reply',v_parent_author,new.author_id,new.post_id,new.id,new.parent_reply_id,'comment-reply-parent:'||new.id::text) on conflict(event_key) do nothing; end if; if v_post_author is not null and v_post_author<>new.author_id and v_post_author is distinct from v_parent_author then insert into private.community_activity(kind,recipient_id,actor_id,post_id,reply_id,parent_reply_id,event_key) values('comment',v_post_author,new.author_id,new.post_id,new.id,new.parent_reply_id,'comment-reply-post:'||new.id::text) on conflict(event_key) do nothing; end if; end if; return new;
end $$;
create or replace function private.community_activity_available(p_event_id uuid,p_recipient uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from private.community_activity event join public.user_profiles actor on actor.id=event.actor_id where event.id=p_event_id and event.recipient_id=p_recipient and private.community_post_available(event.post_id,p_recipient) and not exists(select 1 from public.user_blocks block_row where (block_row.blocker_id=p_recipient and block_row.blocked_id=event.actor_id) or (block_row.blocker_id=event.actor_id and block_row.blocked_id=p_recipient)) and ((event.kind in ('comment','comment_reply') and private.community_reply_available(event.reply_id,p_recipient) and (event.parent_reply_id is null or private.community_reply_available(event.parent_reply_id,p_recipient))) or (event.kind='like' and exists(select 1 from private.community_post_likes like_row where like_row.post_id=event.post_id and like_row.actor_id=event.actor_id))));
$$;

revoke all on function private.direct_conversation_available(uuid,uuid),private.purge_direct_messages_for_erasure(),private.community_reply_available(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_community_author(text,uuid),public.create_direct_message_request(text,uuid,text,uuid),public.respond_direct_message_request(uuid,boolean,uuid),public.list_my_direct_conversations(uuid,integer),public.get_direct_conversation(uuid),public.list_direct_messages(uuid,uuid,integer),public.send_direct_message(uuid,text,uuid),public.mark_direct_conversation_read(uuid,uuid),public.block_direct_conversation(uuid,uuid),public.create_community_comment_reply(uuid,text,uuid),public.list_community_comment_replies(uuid,uuid,integer),public.get_community_comment_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_community_author(text,uuid),public.create_direct_message_request(text,uuid,text,uuid),public.respond_direct_message_request(uuid,boolean,uuid),public.list_my_direct_conversations(uuid,integer),public.get_direct_conversation(uuid),public.list_direct_messages(uuid,uuid,integer),public.send_direct_message(uuid,text,uuid),public.mark_direct_conversation_read(uuid,uuid),public.block_direct_conversation(uuid,uuid),public.create_community_comment_reply(uuid,text,uuid),public.list_community_comment_replies(uuid,uuid,integer),public.get_community_comment_context(uuid) to authenticated;
grant execute on function public.get_community_author(text,uuid),public.list_community_comment_replies(uuid,uuid,integer),public.get_community_comment_context(uuid) to anon;
commit;
