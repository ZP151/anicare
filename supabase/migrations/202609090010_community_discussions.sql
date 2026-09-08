begin;

alter table public.user_profiles add column if not exists avatar_key text not null default 'cat' check (avatar_key in ('cat','paw','leaf','sun','moon','heart'));
alter table private.safety_requests drop constraint if exists safety_requests_operation_check;
alter table private.safety_requests add constraint safety_requests_operation_check check (operation in ('report','block','unblock','community_post','community_reply','community_delete'));

create table public.community_posts (
 id uuid primary key default extensions.gen_random_uuid(), author_id uuid references public.user_profiles(id) on delete set null,
 body text not null check (pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 2000),
 cat_id uuid references public.animals(id) on delete set null,
 community_slug text check (community_slug is null or community_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 created_at timestamptz not null default pg_catalog.now(), deleted_at timestamptz,
 constraint community_post_scope check (cat_id is not null or community_slug is not null)
);
create table public.community_replies (
 id uuid primary key default extensions.gen_random_uuid(), post_id uuid not null references public.community_posts(id) on delete cascade,
 author_id uuid references public.user_profiles(id) on delete set null,
 body text not null check (pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 2000),
 created_at timestamptz not null default pg_catalog.now(), deleted_at timestamptz
);
create index community_posts_public_cursor_idx on public.community_posts(created_at desc,id desc) where deleted_at is null;
create index community_posts_community_cursor_idx on public.community_posts(community_slug,created_at desc,id desc) where deleted_at is null;
create index community_posts_cat_cursor_idx on public.community_posts(cat_id,created_at desc,id desc) where deleted_at is null;
create index community_replies_post_cursor_idx on public.community_replies(post_id,created_at asc,id asc) where deleted_at is null;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
revoke all on table public.community_posts,public.community_replies from public,anon,authenticated;
grant select,insert,update,delete on table public.community_posts,public.community_replies to service_role;

alter table public.moderation_reports drop constraint if exists moderation_reports_content_type_check;
alter table public.moderation_reports add constraint moderation_reports_content_type_check check (content_type in ('sighting','user','community_post','community_reply'));

create or replace function private.community_target_available(p_type text,p_id uuid,p_actor uuid) returns table(author_id uuid) language sql stable security definer set search_path=pg_catalog as $$
 select p.author_id from public.community_posts p where p_type='community_post' and p.id=p_id and p.deleted_at is null
 and (p.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=p_actor and b.blocked_id=p.author_id) or (b.blocker_id=p.author_id and b.blocked_id=p_actor)))
 union all
 select r.author_id from public.community_replies r join public.community_posts p on p.id=r.post_id where p_type='community_reply' and r.id=p_id and r.deleted_at is null and p.deleted_at is null
 and (r.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=p_actor and b.blocked_id=r.author_id) or (b.blocker_id=r.author_id and b.blocked_id=p_actor)));
$$;

create function public.list_public_community_posts(p_cursor uuid default null,p_limit integer default 20,p_community_slug text default null,p_cat_id uuid default null)
returns table("postId" uuid,body text,"catId" uuid,"communitySlug" text,"createdAt" timestamptz,author jsonb,"replyCount" integer,"canDelete" boolean,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if p_community_slug is not null and p_community_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'invalid_community_scope' using errcode='22023'; end if;
 if p_cursor is not null then select created_at,id into v_created,v_id from public.community_posts where id=p_cursor and deleted_at is null; if not found then raise exception 'invalid_community_cursor' using errcode='P0001'; end if; end if;
 return query select p.id,p.body,p.cat_id,p.community_slug,p.created_at,
  jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'cat')),
  (select count(*)::integer from public.community_replies r where r.post_id=p.id and r.deleted_at is null),(v_actor is not null and p.author_id=v_actor),p.id
 from public.community_posts p left join public.user_profiles profile on profile.id=p.author_id
 where p.deleted_at is null and (p_community_slug is null or p.community_slug=p_community_slug) and (p_cat_id is null or p.cat_id=p_cat_id)
 and (v_actor is null or p.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_actor and b.blocked_id=p.author_id) or (b.blocker_id=p.author_id and b.blocked_id=v_actor)))
 and (p_cursor is null or (p.created_at,p.id)<(v_created,v_id)) order by p.created_at desc,p.id desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

create function public.block_community_author(p_content_type text,p_content_id uuid,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_author uuid;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_content_type not in ('community_post','community_reply') or p_content_id is null or p_request_id is null then raise exception 'invalid_community_block' using errcode='22023'; end if;
 select author_id into v_author from private.community_target_available(p_content_type,p_content_id,v_actor); if not found or v_author is null or v_author=v_actor then raise exception 'target_not_available' using errcode='P0001'; end if;
 perform public.block_user(v_author,p_request_id); return p_request_id;
end $$;

create function public.list_public_community_replies(p_post_id uuid,p_cursor uuid default null,p_limit integer default 30)
returns table("replyId" uuid,body text,"createdAt" timestamptz,author jsonb,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if not exists(select 1 from public.community_posts p where p.id=p_post_id and p.deleted_at is null) then raise exception 'community_post_not_available' using errcode='P0001'; end if;
 if p_cursor is not null then select created_at,id into v_created,v_id from public.community_replies where id=p_cursor and post_id=p_post_id and deleted_at is null; if not found then raise exception 'invalid_community_cursor' using errcode='P0001'; end if; end if;
 return query select r.id,r.body,r.created_at,jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'cat')),r.id
 from public.community_replies r left join public.user_profiles profile on profile.id=r.author_id where r.post_id=p_post_id and r.deleted_at is null
 and (v_actor is null or r.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_actor and b.blocked_id=r.author_id) or (b.blocker_id=r.author_id and b.blocked_id=v_actor)))
 and (p_cursor is null or (r.created_at,r.id)>(v_created,v_id)) order by r.created_at asc,r.id asc limit least(greatest(coalesce(p_limit,30),1),50);
end $$;

create function public.create_community_post(p_body text,p_cat_id uuid,p_community_slug text,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_body text:=nullif(pg_catalog.btrim(p_body),''); v_prior private.safety_requests%rowtype; v_id uuid;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if not exists(select 1 from public.user_profiles where id=v_actor and adult_confirmed_at is not null and adult_confirmed_at<=pg_catalog.now()) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 if v_body is null or pg_catalog.char_length(v_body)>2000 or p_request_id is null or (p_community_slug is not null and p_community_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$') or (p_cat_id is null and p_community_slug is null) then raise exception 'invalid_community_post' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.safety_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation<>'community_post' then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return v_prior.result_id; end if;
 insert into public.community_posts(author_id,body,cat_id,community_slug) values(v_actor,v_body,p_cat_id,p_community_slug) returning id into v_id;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash,result_id) values(v_actor,p_request_id,'community_post',v_id,pg_catalog.encode(extensions.digest(v_body,'sha256'),'hex'),v_id);
 return v_id;
end $$;

create function public.create_community_reply(p_post_id uuid,p_body text,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_body text:=nullif(pg_catalog.btrim(p_body),''); v_prior private.safety_requests%rowtype; v_id uuid;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if not exists(select 1 from public.user_profiles where id=v_actor and adult_confirmed_at is not null and adult_confirmed_at<=pg_catalog.now()) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 if v_body is null or pg_catalog.char_length(v_body)>2000 or p_request_id is null then raise exception 'invalid_community_reply' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.safety_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation<>'community_reply' or v_prior.target_id<>p_post_id then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return v_prior.result_id; end if;
 if not exists(select 1 from public.community_posts where id=p_post_id and deleted_at is null) then raise exception 'community_post_not_available' using errcode='P0001'; end if;
 insert into public.community_replies(post_id,author_id,body) values(p_post_id,v_actor,v_body) returning id into v_id;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash,result_id) values(v_actor,p_request_id,'community_reply',p_post_id,pg_catalog.encode(extensions.digest(v_body,'sha256'),'hex'),v_id);
 return v_id;
end $$;

create function public.delete_community_content(p_content_type text,p_content_id uuid,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_prior private.safety_requests%rowtype;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_content_type not in ('community_post','community_reply') or p_content_id is null or p_request_id is null then raise exception 'invalid_community_delete' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.safety_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation<>'community_delete' or v_prior.target_id<>p_content_id then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return p_request_id; end if;
 if p_content_type='community_post' then update public.community_posts set deleted_at=pg_catalog.now() where id=p_content_id and author_id=v_actor and deleted_at is null; else update public.community_replies set deleted_at=pg_catalog.now() where id=p_content_id and author_id=v_actor and deleted_at is null; end if;
 if not found then raise exception 'community_content_not_available' using errcode='P0001'; end if;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash,result_id) values(v_actor,p_request_id,'community_delete',p_content_id,'',p_request_id); return p_request_id;
end $$;

-- Community content joins the established reporting pipeline. Critical reports hide it immediately; all reports retain the existing recusal, due-time and audit semantics.
create or replace function public.create_moderation_report(p_content_type text,p_content_id uuid,p_reason_code text,p_detail text,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_author uuid; v_detail text:=nullif(pg_catalog.btrim(p_detail),''); v_risk public.risk_tier; v_status public.moderation_status; v_due timestamptz; v_report uuid; v_prior private.safety_requests%rowtype;
begin
 if v_actor is null or not exists(select 1 from public.user_profiles where id=v_actor and adult_confirmed_at is not null and adult_confirmed_at<=pg_catalog.now()) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 if p_content_type not in ('sighting','user','community_post','community_reply') or p_content_id is null or p_reason_code not in ('spam','harassment','unsafe_location','animal_welfare','graphic_content','misinformation','precise_location_exposure','animal_in_immediate_danger') or p_request_id is null or (p_detail is not null and v_detail is null) or pg_catalog.char_length(coalesce(v_detail,''))>1000 then raise exception 'invalid_report_request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.safety_requests where actor_id=v_actor and request_id=p_request_id for update; if found then if v_prior.operation<>'report' or v_prior.target_id<>p_content_id then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return v_prior.result_id; end if;
 if p_content_type in ('community_post','community_reply') then select author_id into v_author from private.community_target_available(p_content_type,p_content_id,v_actor); if not found then raise exception 'target_not_available' using errcode='P0001'; end if; elsif p_content_type='user' then if not exists(select 1 from public.user_profiles where id=p_content_id and id<>v_actor) then raise exception 'target_not_available' using errcode='P0001'; end if; else if not private.eligible_safety_sighting(p_content_id,v_actor) then raise exception 'target_not_available' using errcode='P0001'; end if; select reporter_id into v_author from public.sightings where id=p_content_id; end if;
 v_risk:=case when p_reason_code in ('precise_location_exposure','animal_in_immediate_danger') then 'critical'::public.risk_tier when p_reason_code in ('harassment','unsafe_location','animal_welfare','graphic_content') then 'sensitive'::public.risk_tier else 'normal'::public.risk_tier end; v_status:=case when v_risk='critical' then 'auto_hidden'::public.moderation_status else 'open'::public.moderation_status end; v_due:=pg_catalog.now()+case v_risk when 'critical' then interval '1 hour' when 'sensitive' then interval '24 hours' else interval '72 hours' end;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash) values(v_actor,p_request_id,'report',p_content_id,pg_catalog.encode(extensions.digest(coalesce(v_detail,''),'sha256'),'hex'));
 insert into public.moderation_reports(reporter_id,content_type,content_id,content_author_id,target_user_id,reason,detail,risk,status,due_at,request_id) values(v_actor,p_content_type,p_content_id,v_author,case when p_content_type='user' then p_content_id else null end,p_reason_code,v_detail,v_risk,v_status,v_due,p_request_id) returning id into v_report;
 if v_risk='critical' and p_content_type='community_post' then update public.community_posts set deleted_at=pg_catalog.now() where id=p_content_id; elsif v_risk='critical' and p_content_type='community_reply' then update public.community_replies set deleted_at=pg_catalog.now() where id=p_content_id; elsif v_risk='critical' and p_content_type='sighting' then update public.sightings set visibility='hidden' where id=p_content_id; end if;
 update private.safety_requests set result_id=v_report where actor_id=v_actor and request_id=p_request_id; insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(v_actor,'create_moderation_report','moderation_report',v_report,'community_safety',p_request_id::text); return v_report;
end $$;

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in ('hide_sighting','restore_sighting','remove_community_content','no_action'));
alter table private.admin_moderation_requests drop constraint if exists admin_moderation_requests_action_check;
alter table private.admin_moderation_requests add constraint admin_moderation_requests_action_check check (action is null or action in ('hide_sighting','restore_sighting','remove_community_content','no_action'));

create or replace function public.admin_list_moderation_queue(p_request_id uuid) returns table("reportId" uuid,"contentType" text,"reasonCode" text,risk text,status text,"dueAt" timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_prior private.admin_moderation_requests%rowtype;
begin
 if v_actor is null or not public.admin_has_active_platform_admin() then raise exception 'platform_admin_required' using errcode='42501'; end if; if p_request_id is null then raise exception 'invalid_admin_request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.admin_moderation_requests where actor_id=v_actor and request_id=p_request_id; if found and v_prior.operation<>'queue_read' then raise exception 'idempotency_conflict' using errcode='P0001'; elsif not found then insert into private.admin_moderation_requests(actor_id,request_id,operation) values(v_actor,p_request_id,'queue_read'); end if;
 return query select r.id,r.content_type,r.reason,r.risk::text,r.status::text,r.due_at from public.moderation_reports r where r.content_type in ('sighting','community_post','community_reply') and r.status in ('open','auto_hidden','under_review') order by case r.risk when 'critical' then 0 when 'sensitive' then 1 else 2 end,r.due_at,r.id;
end $$;

create or replace function public.admin_get_moderation_report(p_report_id uuid,p_request_id uuid) returns table("reportId" uuid,"contentType" text,"reasonCode" text,risk text,status text,"dueAt" timestamptz,"createdAt" timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_prior private.admin_moderation_requests%rowtype; v_report public.moderation_reports%rowtype;
begin
 if v_actor is null or not public.admin_has_active_platform_admin() then raise exception 'platform_admin_required' using errcode='42501'; end if; if p_report_id is null or p_request_id is null then raise exception 'invalid_admin_request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.admin_moderation_requests where actor_id=v_actor and request_id=p_request_id; if found and (v_prior.operation<>'report_read' or v_prior.report_id is distinct from p_report_id) then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
 select * into v_report from public.moderation_reports where id=p_report_id and content_type in ('sighting','community_post','community_reply') for key share; if not found then raise exception 'moderation_report_not_available' using errcode='P0001'; end if;
 if not found then null; end if; if v_prior is null then insert into private.admin_moderation_requests(actor_id,request_id,operation,report_id) values(v_actor,p_request_id,'report_read',p_report_id); end if;
 return query select v_report.id,v_report.content_type,v_report.reason,v_report.risk::text,v_report.status::text,v_report.due_at,v_report.created_at;
end $$;

create function public.admin_resolve_community_moderation_report(p_report_id uuid,p_action text,p_rationale text,p_request_id uuid) returns table("reportId" uuid,action text,status text,visibility text) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_report public.moderation_reports%rowtype; v_prior private.admin_moderation_requests%rowtype; v_body text:=pg_catalog.btrim(p_rationale);
begin
 if v_actor is null or not public.admin_has_active_platform_admin() then raise exception 'platform_admin_required' using errcode='42501'; end if; if p_report_id is null or p_request_id is null or p_action not in ('remove_community_content','no_action') or pg_catalog.char_length(coalesce(v_body,'')) not between 10 and 2000 then raise exception 'invalid_moderation_resolution' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.admin_moderation_requests where actor_id=v_actor and request_id=p_request_id for update; if found then if v_prior.operation<>'resolve' or v_prior.report_id<>p_report_id or v_prior.action<>p_action or v_prior.rationale<>v_body then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return query select p_report_id,p_action,'resolved'::text,'hidden'::text; return; end if;
 select * into v_report from public.moderation_reports where id=p_report_id and content_type in ('community_post','community_reply') and status in ('open','auto_hidden','under_review') for update; if not found or v_actor in (v_report.reporter_id,v_report.content_author_id) then raise exception 'moderation_report_not_actionable' using errcode='P0001'; end if;
 if p_action='remove_community_content' and v_report.content_type='community_post' then update public.community_posts set deleted_at=coalesce(deleted_at,pg_catalog.now()) where id=v_report.content_id; elsif p_action='remove_community_content' then update public.community_replies set deleted_at=coalesce(deleted_at,pg_catalog.now()) where id=v_report.content_id; end if;
 insert into private.admin_moderation_requests(actor_id,request_id,operation,report_id,action,rationale) values(v_actor,p_request_id,'resolve',p_report_id,p_action,v_body); update public.moderation_reports set status='resolved',assigned_reviewer_id=v_actor,resolved_at=pg_catalog.now() where id=p_report_id; insert into public.moderation_actions(actor_id,report_id,action,rationale,request_id,resulting_visibility) values(v_actor,p_report_id,p_action,v_body,p_request_id,'hidden');
 return query select p_report_id,p_action,'resolved'::text,'hidden'::text;
end $$;

revoke all on function private.community_target_available(text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.list_public_community_posts(uuid,integer,text,uuid),public.list_public_community_replies(uuid,uuid,integer),public.create_community_post(text,uuid,text,uuid),public.create_community_reply(uuid,text,uuid),public.delete_community_content(text,uuid,uuid),public.block_community_author(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_public_community_posts(uuid,integer,text,uuid),public.list_public_community_replies(uuid,uuid,integer) to anon,authenticated;
grant execute on function public.create_community_post(text,uuid,text,uuid),public.create_community_reply(uuid,text,uuid),public.delete_community_content(text,uuid,uuid),public.block_community_author(text,uuid,uuid),public.create_moderation_report(text,uuid,text,text,uuid) to authenticated;
revoke all on function public.admin_resolve_community_moderation_report(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_resolve_community_moderation_report(uuid,text,text,uuid) to authenticated;
commit;
