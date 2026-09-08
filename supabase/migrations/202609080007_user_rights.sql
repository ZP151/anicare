begin;

create table private.user_rights_requests (
 id uuid primary key default extensions.gen_random_uuid(),
 owner_id uuid not null references public.user_profiles(id) on delete cascade,
 request_id uuid not null,
 kind text not null check(kind in ('identity_correction','duplicate_cat','appeal','access','correction','withdrawal')),
 animal_id uuid references public.animals(id) on delete set null,
 detail text check(detail is null or pg_catalog.char_length(detail)<=1000),
 status text not null default 'received' check(status in ('received','reviewing','needs_new_proposal','closed')),
 created_at timestamptz not null default pg_catalog.now(), updated_at timestamptz not null default pg_catalog.now(),
 unique(owner_id,request_id),
 unique(request_id)
);
create table private.account_erasure_requests (
 id uuid primary key default extensions.gen_random_uuid(),
 request_id uuid not null unique,
 subject_id uuid references auth.users(id) on delete set null,
 target_subject_id uuid,
 status text not null default 'received' check(status in ('received','processing','retryable','cleanup_pending','completed')),
 claim_id uuid, claimed_at timestamptz, attempts integer not null default 0 check(attempts>=0),
 auth_deleted_at timestamptz, created_at timestamptz not null default pg_catalog.now(), updated_at timestamptz not null default pg_catalog.now()
);
create unique index account_erasure_one_active_owner on private.account_erasure_requests(target_subject_id) where status <> 'completed';
create table private.account_erasure_cleanup_links (
 erasure_request_id uuid not null references private.account_erasure_requests(id) on delete cascade,
 cleanup_kind text not null check(cleanup_kind in ('staging','legacy')),
 cleanup_job_id uuid not null,
 primary key(erasure_request_id,cleanup_kind,cleanup_job_id)
);
create table private.user_rights_actions (
 admin_id uuid not null references public.user_profiles(id) on delete cascade,
 action_request_id uuid not null,
 rights_request_id uuid not null references private.user_rights_requests(id) on delete cascade,
 status text not null check(status in ('reviewing','needs_new_proposal','closed')),
 created_at timestamptz not null default pg_catalog.now(), primary key(admin_id,action_request_id)
);
create table private.sighting_block_requests (
 actor_id uuid not null references public.user_profiles(id) on delete cascade,
 request_id uuid not null, sighting_id uuid not null,
 created_at timestamptz not null default pg_catalog.now(), primary key(actor_id,request_id)
);
alter table private.user_rights_requests enable row level security;
alter table private.account_erasure_requests enable row level security;
alter table private.account_erasure_cleanup_links enable row level security;
alter table private.user_rights_actions enable row level security;
alter table private.sighting_block_requests enable row level security;
revoke all on table private.user_rights_requests,private.account_erasure_requests,private.account_erasure_cleanup_links,private.user_rights_actions,private.sighting_block_requests from public,anon,authenticated,service_role;

create function private.active_platform_admin(p_actor_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.role_grants grant_row where grant_row.user_id=p_actor_id and grant_row.role='platform_admin'::public.trust_role and grant_row.revoked_at is null and (grant_row.provisional_until is null or grant_row.provisional_until>pg_catalog.now()))
$$;
create function private.eligible_safety_sighting(p_sighting_id uuid,p_actor_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.sightings sighting join public.animals animal on animal.id=sighting.animal_id
  where sighting.id=p_sighting_id and sighting.visibility='public'::public.record_visibility and sighting.visible_at is not null and sighting.visible_at<=pg_catalog.now() and sighting.risk<>'critical'::public.risk_tier and private.is_public_cat_available(animal.id,p_actor_id)
  and (sighting.reporter_id is null or p_actor_id is null or not exists(select 1 from public.user_blocks block_row where (block_row.blocker_id=p_actor_id and block_row.blocked_id=sighting.reporter_id) or (block_row.blocker_id=sighting.reporter_id and block_row.blocked_id=p_actor_id))))
$$;

create function private.capture_erasure_staging_links() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into private.account_erasure_cleanup_links(erasure_request_id,cleanup_kind,cleanup_job_id)
 select request_row.id,'staging',job.id from private.account_erasure_requests request_row join private.media_upload_jobs job on job.uploader_id=old.id
 where request_row.target_subject_id=old.id and request_row.status in ('received','processing','retryable','cleanup_pending') on conflict do nothing;
 update private.account_erasure_requests set subject_id=null,auth_deleted_at=coalesce(auth_deleted_at,pg_catalog.now()),status='cleanup_pending',updated_at=pg_catalog.now()
 where target_subject_id=old.id and status in ('received','processing','retryable','cleanup_pending') and not exists(select 1 from auth.users u where u.id=old.id);
 return old;
end $$;
create function private.capture_erasure_legacy_links() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into private.account_erasure_cleanup_links(erasure_request_id,cleanup_kind,cleanup_job_id)
 select request_row.id,'legacy',job.id from private.account_erasure_requests request_row join private.legacy_media_deletion_jobs job on job.expected_owner_id=old.id
 where request_row.target_subject_id=old.id and request_row.status in ('received','processing','retryable','cleanup_pending') on conflict do nothing;
 return old;
end $$;
create trigger aaa_capture_erasure_staging before delete on public.user_profiles for each row execute function private.capture_erasure_staging_links();
create trigger zzz_capture_erasure_legacy after delete on public.user_profiles for each row execute function private.capture_erasure_legacy_links();

create or replace function public.create_moderation_report(p_content_type text,p_content_id uuid,p_reason_code text,p_detail text,p_request_id uuid)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor_id uuid:=auth.uid(); normalized_detail text; payload_hash text; prior private.safety_requests%rowtype; author_id uuid; target_user_id uuid; derived_risk public.risk_tier; derived_status public.moderation_status; derived_due_at timestamptz; report_id uuid; should_auto_hide boolean:=false;
begin
 if v_actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if not exists(select 1 from public.user_profiles profile where profile.id=v_actor_id and profile.adult_confirmed_at is not null and profile.adult_confirmed_at<=pg_catalog.now()) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 if p_content_type is null or p_content_type not in ('sighting','user') or p_content_id is null or p_reason_code is null or p_reason_code not in ('spam','harassment','unsafe_location','animal_welfare','graphic_content','misinformation','precise_location_exposure','animal_in_immediate_danger') or p_request_id is null then raise exception 'invalid_report_request' using errcode='22023'; end if;
 normalized_detail:=nullif(pg_catalog.btrim(p_detail),''); if (p_detail is not null and normalized_detail is null) or pg_catalog.char_length(coalesce(normalized_detail,''))>1000 then raise exception 'invalid_report_request' using errcode='22023'; end if;
 payload_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('contentType',p_content_type,'contentId',p_content_id,'reasonCode',p_reason_code,'detail',normalized_detail)::text,'UTF8'),'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor_id::text||':'||p_request_id::text,0));
 select * into prior from private.safety_requests request_row where request_row.actor_id=v_actor_id and request_row.request_id=p_request_id for update;
 if found then if prior.operation<>'report' or prior.target_id<>p_content_id or prior.payload_hash<>payload_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return p_request_id; end if;
 if p_content_type='sighting' then
  select sighting.reporter_id into author_id from public.sightings sighting where sighting.id=p_content_id and private.eligible_safety_sighting(sighting.id,v_actor_id) for update;
  if not found then raise exception 'target_not_available' using errcode='P0001'; end if;
 else
  select profile.id into target_user_id from public.user_profiles profile where profile.id=p_content_id and profile.id<>v_actor_id for key share;
  if not found then insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash) values(v_actor_id,p_request_id,'report',p_content_id,payload_hash); insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(v_actor_id,'create_moderation_report','moderation_target',p_content_id,'community_safety',p_request_id::text); return p_request_id; end if;
 end if;
 derived_risk:=case when p_reason_code in ('precise_location_exposure','animal_in_immediate_danger') then 'critical'::public.risk_tier when p_reason_code in ('harassment','unsafe_location','animal_welfare','graphic_content') then 'sensitive'::public.risk_tier else 'normal'::public.risk_tier end;
 should_auto_hide:=p_content_type='sighting' and derived_risk='critical'::public.risk_tier; derived_status:=case when should_auto_hide then 'auto_hidden'::public.moderation_status else 'open'::public.moderation_status end; derived_due_at:=pg_catalog.now()+case derived_risk when 'critical'::public.risk_tier then interval '1 hour' when 'sensitive'::public.risk_tier then interval '24 hours' else interval '72 hours' end;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash) values(v_actor_id,p_request_id,'report',p_content_id,payload_hash);
 insert into public.moderation_reports(reporter_id,content_type,content_id,content_author_id,target_user_id,reason,detail,risk,status,assigned_reviewer_id,due_at,request_id) values(v_actor_id,p_content_type,p_content_id,author_id,target_user_id,p_reason_code,normalized_detail,derived_risk,derived_status,null,derived_due_at,p_request_id) returning id into report_id;
 if should_auto_hide then update public.sightings set visibility='hidden' where id=p_content_id; insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,reason,request_id) values(v_actor_id,'auto_hide_sighting','sighting',p_content_id,'community_safety',null,p_request_id::text); end if;
 insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,reason,request_id) values(v_actor_id,'create_moderation_report','moderation_report',report_id,'community_safety',null,p_request_id::text);
 update private.safety_requests set result_id=report_id where actor_id=v_actor_id and request_id=p_request_id; return p_request_id;
end $$;

create function public.list_public_cat_safety_activity(p_animal_id uuid,p_cursor uuid default null,p_limit integer default 20) returns table("sightingId" uuid,"timeBucket" text,cursor uuid) language plpgsql stable security definer set search_path=pg_catalog as $$
declare caller_id uuid:=auth.uid(); cursor_at timestamptz; cursor_id uuid; begin
 if p_animal_id is null then raise exception 'invalid_safety_request' using errcode='22023'; end if;
 if p_cursor is not null then select sighting.visible_at,sighting.id into cursor_at,cursor_id from public.sightings sighting where sighting.id=p_cursor and sighting.animal_id=p_animal_id and private.eligible_safety_sighting(sighting.id,caller_id); if not found then raise exception 'invalid_safety_cursor' using errcode='P0001'; end if; end if;
 return query select sighting.id,case when sighting.visible_at>=pg_catalog.date_trunc('day',pg_catalog.now()) then 'today' when sighting.visible_at>=pg_catalog.date_trunc('day',pg_catalog.now())-interval '6 days' then 'this_week' else 'earlier' end::text,sighting.id from public.sightings sighting where sighting.animal_id=p_animal_id and private.eligible_safety_sighting(sighting.id,caller_id) and (p_cursor is null or (sighting.visible_at,sighting.id)<(cursor_at,cursor_id)) order by sighting.visible_at desc,sighting.id desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

create or replace function public.block_sighting_author(p_sighting_id uuid,p_request_id uuid) returns table("requestId" uuid,blocked boolean) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor_id uuid:=auth.uid(); author_id uuid; prior private.sighting_block_requests%rowtype; begin
 if v_actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_sighting_id is null or p_request_id is null then raise exception 'invalid_block_request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor_id::text||':'||p_request_id::text,0)); perform 1 from public.user_profiles profile where profile.id=v_actor_id for key share; if not found then raise exception 'authentication_required' using errcode='42501'; end if;
 select * into prior from private.sighting_block_requests request_row where request_row.actor_id=v_actor_id and request_row.request_id=p_request_id for update; if found then if prior.sighting_id<>p_sighting_id then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return query select p_request_id,true; return; end if;
 select sighting.reporter_id into author_id from public.sightings sighting where sighting.id=p_sighting_id and private.eligible_safety_sighting(sighting.id,v_actor_id) for update; if not found then raise exception 'target_not_available' using errcode='P0001'; end if;
 insert into private.sighting_block_requests(actor_id,request_id,sighting_id) values(v_actor_id,p_request_id,p_sighting_id); if author_id is not null then perform public.block_user(author_id,p_request_id); end if;
 insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(v_actor_id,'block_sighting_author','sighting',p_sighting_id,'community_safety',p_request_id::text); return query select p_request_id,true;
end $$;

create function public.list_my_moderation_status(p_cursor uuid default null,p_limit integer default 20) returns table("requestId" uuid,status text,cursor uuid) language plpgsql stable security definer set search_path=pg_catalog as $$
declare cursor_at timestamptz; cursor_id uuid; begin if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_cursor is not null then select report.created_at,report.id into cursor_at,cursor_id from public.moderation_reports report where report.id=p_cursor and report.reporter_id=auth.uid(); if not found then raise exception 'invalid_moderation_cursor' using errcode='P0001'; end if; end if;
 return query select report.request_id,report.status::text,report.id from public.moderation_reports report where report.reporter_id=auth.uid() and (p_cursor is null or (report.created_at,report.id)<(cursor_at,cursor_id)) order by report.created_at desc,report.id desc limit least(greatest(coalesce(p_limit,20),1),50); end $$;

create function public.request_user_rights(p_kind text,p_animal_id uuid,p_detail text,p_request_id uuid) returns table("requestId" uuid,status text,"receivedAt" timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor_id uuid:=auth.uid(); prior private.user_rights_requests%rowtype; saved private.user_rights_requests%rowtype; normalized_detail text:=nullif(pg_catalog.btrim(p_detail),''); begin
 if v_actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_request_id is null or p_kind is null or p_kind not in ('identity_correction','duplicate_cat','appeal','access','correction','withdrawal') or (p_detail is not null and normalized_detail is null) or pg_catalog.char_length(coalesce(normalized_detail,''))>1000 then raise exception 'invalid_rights_request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor_id::text||':'||p_request_id::text,0)); perform 1 from public.user_profiles profile where profile.id=v_actor_id for key share; if not found then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_animal_id is not null and not private.is_public_cat_available(p_animal_id,v_actor_id) then raise exception 'rights_animal_not_available' using errcode='P0001'; end if;
 select * into prior from private.user_rights_requests request_row where request_row.owner_id=v_actor_id and request_row.request_id=p_request_id for update; if found then if prior.kind<>p_kind or prior.animal_id is distinct from p_animal_id or prior.detail is distinct from normalized_detail then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return query select prior.request_id,prior.status,prior.created_at; return; end if;
 insert into private.user_rights_requests(owner_id,request_id,kind,animal_id,detail) values(v_actor_id,p_request_id,p_kind,p_animal_id,normalized_detail) returning * into saved; insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(v_actor_id,'request_user_rights','user_rights_request',saved.id,'rights',p_request_id::text); return query select saved.request_id,saved.status,saved.created_at;
end $$;

create function public.list_my_rights_requests(p_cursor uuid default null,p_limit integer default 20) returns table("requestId" uuid,kind text,status text,"receivedAt" timestamptz,cursor uuid) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor_id uuid:=auth.uid(); cursor_at timestamptz; cursor_id uuid; begin if v_actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
 perform 1 from auth.users u where u.id=v_actor_id for key share; if not found then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_cursor is not null then select row.created_at,row.id into cursor_at,cursor_id from (select created_at,id from private.user_rights_requests where owner_id=v_actor_id and id=p_cursor union all select created_at,id from private.account_erasure_requests where target_subject_id=v_actor_id and id=p_cursor) row; if not found then raise exception 'invalid_rights_cursor' using errcode='P0001'; end if; end if;
 return query select row.request_id,row.kind,row.status,row.created_at,row.id from (select r.request_id,r.kind,r.status,r.created_at,r.id from private.user_rights_requests r where r.owner_id=v_actor_id union all select e.request_id,'account_erasure'::text,e.status,e.created_at,e.id from private.account_erasure_requests e where e.target_subject_id=v_actor_id) row where p_cursor is null or (row.created_at,row.id)<(cursor_at,cursor_id) order by row.created_at desc,row.id desc limit least(greatest(coalesce(p_limit,20),1),50); end $$;

create function public.request_account_erasure(p_request_id uuid) returns table("requestId" uuid,status text,"receivedAt" timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor_id uuid:=auth.uid(); request_row private.account_erasure_requests%rowtype; begin
 if v_actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_request_id is null then raise exception 'invalid_erasure_request' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account_erasure:'||v_actor_id::text,0)); perform 1 from auth.users user_row where user_row.id=v_actor_id for key share; if not found then raise exception 'authentication_required' using errcode='42501'; end if;
 select * into request_row from private.account_erasure_requests where target_subject_id=v_actor_id and request_id=p_request_id for update; if found then return query select request_row.request_id,request_row.status,request_row.created_at; return; end if;
 if exists(select 1 from private.account_erasure_requests e where e.target_subject_id=v_actor_id and e.status<>'completed') then raise exception 'erasure_already_pending' using errcode='P0001'; end if;
 insert into private.account_erasure_requests(request_id,subject_id,target_subject_id) values(p_request_id,v_actor_id,v_actor_id) returning * into request_row; insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(case when exists(select 1 from public.user_profiles profile where profile.id=v_actor_id) then v_actor_id else null end,'request_account_erasure','account_erasure_request',request_row.id,'rights',p_request_id::text); return query select request_row.request_id,request_row.status,request_row.created_at;
end $$;

create function public.admin_list_user_rights_requests(p_cursor uuid default null,p_limit integer default 20) returns table("requestId" uuid,kind text,detail text,"animalId" uuid,status text,"receivedAt" timestamptz,cursor uuid) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor_id uuid:=auth.uid(); cursor_at timestamptz; cursor_id uuid; begin if v_actor_id is null or not private.active_platform_admin(v_actor_id) then raise exception 'platform_admin_required' using errcode='42501'; end if;
 if p_cursor is not null then select row.created_at,row.id into cursor_at,cursor_id from (select created_at,id from private.user_rights_requests where id=p_cursor union all select created_at,id from private.account_erasure_requests where id=p_cursor) row; if not found then raise exception 'invalid_admin_rights_cursor' using errcode='P0001'; end if; end if;
 insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose) values(v_actor_id,'admin_list_user_rights_requests','user_rights_queue',null,'rights_review');
 return query select row.request_id,row.kind,row.detail,row.animal_id,row.status,row.created_at,row.id from (select r.request_id,r.kind,r.detail,r.animal_id,r.status,r.created_at,r.id from private.user_rights_requests r union all select e.request_id,'account_erasure'::text,null::text,null::uuid,e.status,e.created_at,e.id from private.account_erasure_requests e) row where p_cursor is null or (row.created_at,row.id)<(cursor_at,cursor_id) order by row.created_at desc,row.id desc limit least(greatest(coalesce(p_limit,20),1),50); end $$;

create function public.admin_update_user_rights_request(p_request_id uuid,p_status text,p_action_request_id uuid) returns table("requestId" uuid,status text) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor_id uuid:=auth.uid(); request_row private.user_rights_requests%rowtype; prior private.user_rights_actions%rowtype; begin
 if v_actor_id is null or not private.active_platform_admin(v_actor_id) then raise exception 'platform_admin_required' using errcode='42501'; end if; if p_request_id is null or p_action_request_id is null or p_status not in ('reviewing','needs_new_proposal','closed') then raise exception 'invalid_rights_update' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor_id::text||':'||p_action_request_id::text,0)); select * into prior from private.user_rights_actions action_row where action_row.admin_id=v_actor_id and action_row.action_request_id=p_action_request_id for update;
 if found then select * into request_row from private.user_rights_requests where id=prior.rights_request_id; if not found or request_row.request_id<>p_request_id or prior.status<>p_status then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return query select request_row.request_id,prior.status; return; end if;
 select * into request_row from private.user_rights_requests where request_id=p_request_id for update; if not found or request_row.owner_id=v_actor_id then raise exception 'rights_request_not_available' using errcode='P0001'; end if;
 update private.user_rights_requests set status=p_status,updated_at=pg_catalog.now() where id=request_row.id; insert into private.user_rights_actions(admin_id,action_request_id,rights_request_id,status) values(v_actor_id,p_action_request_id,request_row.id,p_status); insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(v_actor_id,'admin_update_user_rights_request','user_rights_request',request_row.id,'rights_review',p_action_request_id::text); return query select request_row.request_id,p_status;
end $$;

create function public.claim_account_erasure(p_request_id uuid,p_admin_actor_id uuid) returns table("requestId" uuid,"subjectId" uuid,"claimId" uuid,status text) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare request_row private.account_erasure_requests%rowtype; v_claim_id uuid:=extensions.gen_random_uuid(); begin
 if p_request_id is null or p_admin_actor_id is null or not private.active_platform_admin(p_admin_actor_id) then raise exception 'platform_admin_required' using errcode='42501'; end if;
 select * into request_row from private.account_erasure_requests where request_id=p_request_id for update skip locked; if not found or request_row.status='completed' or (request_row.claim_id is not null and request_row.claimed_at>pg_catalog.now()-interval '5 minutes') then return; end if;
 update private.account_erasure_requests set status='processing',claim_id=v_claim_id,claimed_at=pg_catalog.now(),attempts=attempts+1,updated_at=pg_catalog.now() where id=request_row.id; insert into audit.access_audit(actor_id,action,resource_type,resource_id,purpose,request_id) values(p_admin_actor_id,'claim_account_erasure','account_erasure_request',request_row.id,'rights',p_request_id::text); return query select request_row.request_id,request_row.target_subject_id,v_claim_id,'processing'::text;
end $$;

create function public.fail_account_erasure(p_request_id uuid,p_claim_id uuid) returns table("requestId" uuid,status text) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare request_row private.account_erasure_requests%rowtype; begin select * into request_row from private.account_erasure_requests where request_id=p_request_id for update; if not found or p_claim_id is null or request_row.claim_id is distinct from p_claim_id or request_row.claimed_at<=pg_catalog.now()-interval '5 minutes' then raise exception 'invalid_erasure_claim' using errcode='P0001'; end if; update private.account_erasure_requests set status='retryable',claim_id=null,claimed_at=null,updated_at=pg_catalog.now() where id=request_row.id; return query select request_row.request_id,'retryable'::text; end $$;
create function public.finish_account_erasure(p_request_id uuid,p_claim_id uuid) returns table("requestId" uuid,status text) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare request_row private.account_erasure_requests%rowtype; cleanup_done boolean; final_status text; begin
 select * into request_row from private.account_erasure_requests where request_id=p_request_id for update; if not found or p_claim_id is null or request_row.claim_id is distinct from p_claim_id or request_row.claimed_at<=pg_catalog.now()-interval '5 minutes' then raise exception 'invalid_erasure_claim' using errcode='P0001'; end if;
 if exists(select 1 from auth.users user_row where user_row.id=request_row.target_subject_id) then raise exception 'auth_account_not_deleted' using errcode='P0001'; end if;
 select not exists(select 1 from private.account_erasure_cleanup_links link where link.erasure_request_id=request_row.id and ((link.cleanup_kind='staging' and exists(select 1 from private.media_upload_jobs job where job.id=link.cleanup_job_id)) or (link.cleanup_kind='legacy' and not exists(select 1 from private.legacy_media_deletion_jobs job where job.id=link.cleanup_job_id and job.status='completed'::private.legacy_media_deletion_status)))) into cleanup_done;
 final_status:=case when cleanup_done then 'completed' else 'cleanup_pending' end; update private.account_erasure_requests set status=final_status,claim_id=null,claimed_at=null,target_subject_id=case when final_status='completed' then null else target_subject_id end,updated_at=pg_catalog.now() where id=request_row.id; return query select request_row.request_id,final_status;
end $$;

revoke all on function private.active_platform_admin(uuid),private.eligible_safety_sighting(uuid,uuid),private.capture_erasure_staging_links(),private.capture_erasure_legacy_links() from public,anon,authenticated,service_role;
revoke all on function public.create_moderation_report(text,uuid,text,text,uuid),public.list_public_cat_safety_activity(uuid,uuid,integer),public.block_sighting_author(uuid,uuid),public.list_my_moderation_status(uuid,integer),public.request_user_rights(text,uuid,text,uuid),public.list_my_rights_requests(uuid,integer),public.request_account_erasure(uuid),public.admin_list_user_rights_requests(uuid,integer),public.admin_update_user_rights_request(uuid,text,uuid),public.claim_account_erasure(uuid,uuid),public.finish_account_erasure(uuid,uuid),public.fail_account_erasure(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_moderation_report(text,uuid,text,text,uuid),public.block_sighting_author(uuid,uuid),public.list_my_moderation_status(uuid,integer),public.request_user_rights(text,uuid,text,uuid),public.list_my_rights_requests(uuid,integer),public.request_account_erasure(uuid),public.admin_list_user_rights_requests(uuid,integer),public.admin_update_user_rights_request(uuid,text,uuid) to authenticated;
grant execute on function public.list_public_cat_safety_activity(uuid,uuid,integer) to anon,authenticated;
grant execute on function public.claim_account_erasure(uuid,uuid),public.finish_account_erasure(uuid,uuid),public.fail_account_erasure(uuid,uuid) to service_role;
commit;