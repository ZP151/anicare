begin;

alter table public.user_profiles drop constraint if exists user_profiles_avatar_key_check;
update public.user_profiles set avatar_key='person' where avatar_key='cat';
alter table public.user_profiles alter column avatar_key set default 'person';
alter table public.user_profiles add constraint user_profiles_avatar_key_check check (avatar_key in (
  'person','human-01','human-02','human-03','human-04','human-05','human-06','human-07',
  'human-08','human-09','human-10','human-11','human-12','human-13','human-14','human-15',
  'cat','paw','leaf','sun','moon','heart'
));
alter table public.user_profiles add column if not exists avatar_object_path text;
alter table public.user_profiles add column if not exists avatar_updated_at timestamptz;

create type private.profile_avatar_job_status as enum ('reserved','finalized','deletion_pending','completed');
create table private.profile_avatar_upload_jobs (
 id uuid primary key default extensions.gen_random_uuid(),
 owner_id uuid references public.user_profiles(id) on delete set null,
 object_path text not null unique,
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 byte_length integer not null check (byte_length between 1 and 2097152),
 width integer not null check (width between 1 and 512),
 height integer not null check (height between 1 and 512),
 status private.profile_avatar_job_status not null default 'reserved',
 reservation_expires_at timestamptz not null,
 upload_token_expires_at timestamptz not null,
 created_at timestamptz not null default pg_catalog.now(),
 finalized_at timestamptz,
 check (object_path = 'avatars/' || id::text || '.jpg'),
 check (reservation_expires_at > created_at and reservation_expires_at <= created_at + interval '15 minutes'),
 check (upload_token_expires_at > created_at and upload_token_expires_at <= created_at + interval '2 hours 15 minutes')
);
alter table private.profile_avatar_upload_jobs enable row level security;
revoke all on private.profile_avatar_upload_jobs from public,anon,authenticated,service_role;

create table private.profile_avatar_cleanup_jobs (
 id uuid primary key default extensions.gen_random_uuid(),
 owner_id uuid not null,
 object_path text not null unique,
 status text not null default 'pending' check(status in ('pending','completed')),
 not_before timestamptz not null default pg_catalog.now(),
 claimed_at timestamptz,
 claim_id uuid,
 created_at timestamptz not null default pg_catalog.now(),
 completed_at timestamptz,
 check (object_path ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$')
);
alter table private.profile_avatar_cleanup_jobs enable row level security;
revoke all on private.profile_avatar_cleanup_jobs from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',false,2097152,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function private.can_read_profile_avatar(p_bucket text,p_name text,p_actor uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select p_bucket='profile-avatars' and exists(
   select 1 from public.user_profiles profile join private.profile_avatar_upload_jobs job on job.object_path=profile.avatar_object_path
   where profile.avatar_object_path=p_name and job.owner_id=profile.id and job.status='finalized'
   and (p_actor=profile.id or exists(select 1 from public.community_posts post where post.author_id=profile.id and private.community_post_available(post.id,p_actor))
     or exists(select 1 from public.community_replies reply where reply.author_id=profile.id and reply.deleted_at is null and reply.moderation_hidden_at is null and private.community_post_available(reply.post_id,p_actor)
       and (p_actor is null or not exists(select 1 from public.user_blocks block_row where (block_row.blocker_id=p_actor and block_row.blocked_id=profile.id) or (block_row.blocker_id=profile.id and block_row.blocked_id=p_actor)))))
 );
$$;
drop policy if exists "profile avatars are visibility-bound" on storage.objects;
create policy "profile avatars are visibility-bound" on storage.objects for select to anon,authenticated using(private.can_read_profile_avatar(bucket_id,name,auth.uid()));

create or replace function public.get_public_community_avatars(p_content_type text,p_content_ids uuid[])
returns table("contentId" uuid,"avatarPath" text) language plpgsql stable security definer set search_path=pg_catalog as $$
declare actor_id uuid:=auth.uid();
begin
 if p_content_type not in ('community_post','community_reply') or p_content_ids is null or cardinality(p_content_ids)>50 then raise exception 'invalid_community_avatar_request' using errcode='22023'; end if;
 if p_content_type='community_post' then
   return query select post.id,profile.avatar_object_path from public.community_posts post join public.user_profiles profile on profile.id=post.author_id
   where post.id=any(p_content_ids) and profile.avatar_object_path is not null and exists(select 1 from private.community_target_available('community_post',post.id,actor_id));
 else
   return query select reply.id,profile.avatar_object_path from public.community_replies reply join public.user_profiles profile on profile.id=reply.author_id
   where reply.id=any(p_content_ids) and profile.avatar_object_path is not null and exists(select 1 from private.community_target_available('community_reply',reply.id,actor_id));
 end if;
end $$;
revoke all on function public.get_public_community_avatars(text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_public_community_avatars(text,uuid[]) to anon,authenticated;

create or replace function public.reserve_profile_avatar_upload(p_owner_id uuid,p_sha256 text,p_byte_length integer,p_width integer,p_height integer)
returns table(job_id uuid,object_path text,reservation_expires_at timestamptz) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_id uuid:=extensions.gen_random_uuid();
begin
 if p_owner_id is null or p_sha256 is null or p_byte_length is null or p_width is null or p_height is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_length not between 1 and 2097152 or p_width not between 1 and 512 or p_height not between 1 and 512 then raise exception 'invalid_avatar_reservation' using errcode='22023'; end if;
 perform 1 from public.user_profiles where id=p_owner_id for update;
 if not found or exists(select 1 from private.account_erasure_requests where target_subject_id=p_owner_id and status<>'completed') then raise exception 'avatar_not_available' using errcode='42501'; end if;
 insert into private.profile_avatar_upload_jobs(id,owner_id,object_path,sha256,byte_length,width,height,reservation_expires_at,upload_token_expires_at)
 values(v_id,p_owner_id,'avatars/'||v_id::text||'.jpg',p_sha256,p_byte_length,p_width,p_height,pg_catalog.now()+interval '10 minutes',pg_catalog.now()+interval '2 hours 10 minutes');
 insert into private.profile_avatar_cleanup_jobs(owner_id,object_path,not_before) values(p_owner_id,'avatars/'||v_id::text||'.jpg',pg_catalog.now()+interval '2 hours 15 minutes');
 return query select v_id,'avatars/'||v_id::text||'.jpg',pg_catalog.now()+interval '10 minutes';
end $$;

create or replace function public.finalize_profile_avatar_upload(p_owner_id uuid,p_job_id uuid)
returns text language plpgsql volatile security definer set search_path=pg_catalog as $$
declare job private.profile_avatar_upload_jobs%rowtype; prior_path text;
begin
 select * into job from private.profile_avatar_upload_jobs where id=p_job_id for update;
 if not found or job.owner_id is distinct from p_owner_id or job.status<>'reserved' or job.reservation_expires_at<=pg_catalog.now() or exists(select 1 from private.account_erasure_requests where target_subject_id=p_owner_id and status<>'completed') then raise exception 'avatar_not_available' using errcode='42501'; end if;
 select avatar_object_path into prior_path from public.user_profiles where id=p_owner_id for update;
 if not found then raise exception 'avatar_not_available' using errcode='42501'; end if;
 if prior_path is not null and prior_path<>job.object_path then insert into private.profile_avatar_cleanup_jobs(owner_id,object_path,not_before) values(p_owner_id,prior_path,greatest(pg_catalog.now(),(select upload_token_expires_at+interval '5 minutes' from private.profile_avatar_upload_jobs where object_path=prior_path))) on conflict(object_path) do update set status='pending',not_before=excluded.not_before,claimed_at=null,claim_id=null,completed_at=null; end if;
 perform pg_catalog.set_config('app.avatar_mutation','finalize',true);
 update public.user_profiles set avatar_object_path=job.object_path,avatar_updated_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_owner_id;
 if not found then raise exception 'avatar_not_available' using errcode='42501'; end if;
 update private.profile_avatar_upload_jobs set status='finalized',finalized_at=pg_catalog.now() where id=job.id;
 update private.profile_avatar_cleanup_jobs set status='completed',completed_at=pg_catalog.now() where object_path=job.object_path and status='pending';
 return job.object_path;
end $$;
create or replace function private.reject_profile_avatar_path_mutation() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.avatar_object_path is distinct from (case when tg_op='UPDATE' then old.avatar_object_path else null end)
 and current_user not in ('postgres','supabase_admin','service_role') then
   raise exception 'avatar_path_is_service_managed' using errcode='42501';
 end if;
 if new.avatar_object_path is not null and new.avatar_object_path !~ '^avatars/[0-9a-f-]{36}[.]jpg$' then raise exception 'invalid_avatar_path' using errcode='22023'; end if;
 return new;
end $$;
create trigger reject_profile_avatar_path_mutation before insert or update on public.user_profiles for each row execute function private.reject_profile_avatar_path_mutation();
create or replace function public.set_profile_avatar_preset(p_owner_id uuid,p_avatar_key text) returns void language plpgsql volatile security definer set search_path=pg_catalog as $$
declare prior_path text; begin
 if auth.uid() is distinct from p_owner_id then raise exception 'avatar_not_available' using errcode='42501'; end if;
 if p_avatar_key is null or p_avatar_key not in ('person','human-01','human-02','human-03','human-04','human-05','human-06','human-07','human-08','human-09','human-10','human-11','human-12','human-13','human-14','human-15','cat','paw','leaf','sun','moon','heart') then raise exception 'invalid_avatar_preset' using errcode='22023'; end if;
 select avatar_object_path into prior_path from public.user_profiles where id=p_owner_id for update; if not found or exists(select 1 from private.account_erasure_requests where target_subject_id=p_owner_id and status<>'completed') then raise exception 'avatar_not_available' using errcode='42501'; end if;
 if prior_path is not null then insert into private.profile_avatar_cleanup_jobs(owner_id,object_path,not_before) values(p_owner_id,prior_path,greatest(pg_catalog.now(),(select upload_token_expires_at+interval '5 minutes' from private.profile_avatar_upload_jobs where object_path=prior_path))) on conflict(object_path) do update set status='pending',not_before=excluded.not_before,claimed_at=null,claim_id=null,completed_at=null; end if;
 perform pg_catalog.set_config('app.avatar_mutation','preset',true); update public.user_profiles set avatar_key=p_avatar_key,avatar_object_path=null,avatar_updated_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=p_owner_id;
end $$;
create or replace function public.get_profile_avatar_upload_job(p_owner_id uuid,p_job_id uuid)
returns table(object_path text,sha256 text,byte_length integer,width integer,height integer,status text) language sql stable security definer set search_path=pg_catalog as $$
 select object_path,sha256,byte_length,width,height,status::text from private.profile_avatar_upload_jobs where id=p_job_id and owner_id=p_owner_id;
$$;

create or replace function private.queue_profile_avatar_cleanup() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into private.profile_avatar_cleanup_jobs(owner_id,object_path,not_before)
 select old.id,job.object_path,greatest(pg_catalog.now(),job.upload_token_expires_at+interval '5 minutes')
 from private.profile_avatar_upload_jobs job where job.owner_id=old.id and job.status in ('reserved','finalized')
 on conflict(object_path) do update set status='pending',not_before=greatest(private.profile_avatar_cleanup_jobs.not_before,excluded.not_before),claimed_at=null,claim_id=null,completed_at=null;
 update private.profile_avatar_upload_jobs set status='deletion_pending' where owner_id=old.id and status in ('reserved','finalized');
 return old;
end $$;
create trigger aab_queue_profile_avatar_cleanup before delete on public.user_profiles for each row execute function private.queue_profile_avatar_cleanup();

create or replace function public.claim_profile_avatar_cleanup_jobs(p_limit integer default 25)
returns table(job_id uuid,object_path text,claim_id uuid) language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_cleanup_limit' using errcode='22023'; end if;
 return query with candidates as (select job.id from private.profile_avatar_cleanup_jobs job where job.status='pending' and job.not_before<=pg_catalog.now() and (job.claimed_at is null or job.claimed_at<=pg_catalog.now()-interval '5 minutes') order by job.created_at limit p_limit for update skip locked), claimed as (
 update private.profile_avatar_cleanup_jobs j set claimed_at=pg_catalog.now(),claim_id=extensions.gen_random_uuid() from candidates c where j.id=c.id returning j.*)
 select claimed.id,claimed.object_path,claimed.claim_id from claimed;
end $$;
create or replace function public.complete_profile_avatar_cleanup_job(p_job_id uuid,p_claim_id uuid)
returns void language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 update private.profile_avatar_cleanup_jobs set status='completed',completed_at=pg_catalog.now(),claimed_at=null where id=p_job_id and claim_id=p_claim_id and status='pending';
 if not found then raise exception 'invalid_avatar_cleanup_claim' using errcode='P0001'; end if;
end $$;

alter table private.account_erasure_cleanup_links drop constraint if exists account_erasure_cleanup_links_cleanup_kind_check;
alter table private.account_erasure_cleanup_links add constraint account_erasure_cleanup_links_cleanup_kind_check check(cleanup_kind in ('staging','legacy','profile_avatar'));
create or replace function private.capture_erasure_profile_avatar_links() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into private.account_erasure_cleanup_links(erasure_request_id,cleanup_kind,cleanup_job_id)
 select request_row.id,'profile_avatar',job.id from private.account_erasure_requests request_row join private.profile_avatar_cleanup_jobs job on job.owner_id=old.id
 where request_row.target_subject_id=old.id and request_row.status in ('received','processing','retryable','cleanup_pending') on conflict do nothing;
 return old;
end $$;
create trigger aac_capture_erasure_profile_avatar after delete on public.user_profiles for each row execute function private.capture_erasure_profile_avatar_links();

create or replace function public.finish_account_erasure(p_request_id uuid,p_claim_id uuid) returns table("requestId" uuid,status text) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare request_row private.account_erasure_requests%rowtype; cleanup_done boolean; final_status text; begin
 select * into request_row from private.account_erasure_requests where request_id=p_request_id for update; if not found or p_claim_id is null or request_row.claim_id is distinct from p_claim_id or request_row.claimed_at<=pg_catalog.now()-interval '5 minutes' then raise exception 'invalid_erasure_claim' using errcode='P0001'; end if;
 if exists(select 1 from auth.users user_row where user_row.id=request_row.target_subject_id) then raise exception 'auth_account_not_deleted' using errcode='P0001'; end if;
 select not exists(select 1 from private.account_erasure_cleanup_links link where link.erasure_request_id=request_row.id and ((link.cleanup_kind='staging' and exists(select 1 from private.media_upload_jobs job where job.id=link.cleanup_job_id)) or (link.cleanup_kind='legacy' and not exists(select 1 from private.legacy_media_deletion_jobs job where job.id=link.cleanup_job_id and job.status='completed'::private.legacy_media_deletion_status)) or (link.cleanup_kind='profile_avatar' and not exists(select 1 from private.profile_avatar_cleanup_jobs job where job.id=link.cleanup_job_id and job.status='completed')))) into cleanup_done;
 final_status:=case when cleanup_done then 'completed' else 'cleanup_pending' end; update private.account_erasure_requests set status=final_status,claim_id=null,claimed_at=null,target_subject_id=case when final_status='completed' then null else target_subject_id end,updated_at=pg_catalog.now() where id=request_row.id; return query select request_row.request_id,final_status;
end $$;

revoke all on function public.reserve_profile_avatar_upload(uuid,text,integer,integer,integer),public.finalize_profile_avatar_upload(uuid,uuid),public.get_profile_avatar_upload_job(uuid,uuid),public.set_profile_avatar_preset(uuid,text),public.claim_profile_avatar_cleanup_jobs(integer),public.complete_profile_avatar_cleanup_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_profile_avatar_upload(uuid,text,integer,integer,integer),public.finalize_profile_avatar_upload(uuid,uuid),public.get_profile_avatar_upload_job(uuid,uuid) to service_role;
grant execute on function public.claim_profile_avatar_cleanup_jobs(integer),public.complete_profile_avatar_cleanup_job(uuid,uuid) to service_role;
grant execute on function public.set_profile_avatar_preset(uuid,text) to authenticated;
create or replace function public.list_public_community_posts(p_cursor uuid default null,p_limit integer default 20,p_community_slug text default null,p_cat_id uuid default null)
returns table("postId" uuid,body text,"catId" uuid,"communitySlug" text,"createdAt" timestamptz,author jsonb,"replyCount" integer,"canDelete" boolean,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if p_community_slug is not null and p_community_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'invalid_community_scope' using errcode='22023'; end if;
 if p_cursor is not null then select p.created_at,p.id into v_created,v_id from public.community_posts p where p.id=p_cursor and private.community_post_available(p.id,v_actor); if not found then raise exception 'invalid_community_cursor' using errcode='P0001'; end if; end if;
 return query select p.id,p.body,p.cat_id,p.community_slug,p.created_at,jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),
   (select count(*)::integer from public.community_replies r where r.post_id=p.id and r.deleted_at is null and r.moderation_hidden_at is null and (v_actor is null or r.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_actor and b.blocked_id=r.author_id) or (b.blocker_id=r.author_id and b.blocked_id=v_actor)))),
   coalesce(v_actor is not null and p.author_id=v_actor,false),p.id
 from public.community_posts p left join public.user_profiles profile on profile.id=p.author_id
 where private.community_post_available(p.id,v_actor) and (p_community_slug is null or p.community_slug=p_community_slug) and (p_cat_id is null or p.cat_id=p_cat_id)
 and (p_cursor is null or (p.created_at,p.id)<(v_created,v_id)) order by p.created_at desc,p.id desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

create or replace function public.get_public_community_post(p_post_id uuid)
returns table("postId" uuid,body text,"catId" uuid,"communitySlug" text,"createdAt" timestamptz,author jsonb,"replyCount" integer,"canDelete" boolean,cursor uuid)
language sql stable security definer set search_path=pg_catalog as $$
 select p.id,p.body,p.cat_id,p.community_slug,p.created_at,jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),
  (select count(*)::integer from public.community_replies r where r.post_id=p.id and r.deleted_at is null and r.moderation_hidden_at is null and (auth.uid() is null or r.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=r.author_id) or (b.blocker_id=r.author_id and b.blocked_id=auth.uid())))),
  coalesce(auth.uid() is not null and p.author_id=auth.uid(),false),p.id
 from public.community_posts p left join public.user_profiles profile on profile.id=p.author_id where p.id=p_post_id and private.community_post_available(p.id,auth.uid());
$$;

create or replace function public.list_public_community_replies(p_post_id uuid,p_cursor uuid default null,p_limit integer default 30)
returns table("replyId" uuid,body text,"createdAt" timestamptz,author jsonb,"canDelete" boolean,cursor uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid;
begin
 if not private.community_post_available(p_post_id,v_actor) then raise exception 'community_post_not_available' using errcode='P0001'; end if;
 if p_cursor is not null then select r.created_at,r.id into v_created,v_id from public.community_replies r where r.id=p_cursor and r.post_id=p_post_id and r.deleted_at is null and r.moderation_hidden_at is null and (v_actor is null or r.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_actor and b.blocked_id=r.author_id) or (b.blocker_id=r.author_id and b.blocked_id=v_actor))); if not found then raise exception 'invalid_community_cursor' using errcode='P0001'; end if; end if;
 return query select r.id,r.body,r.created_at,jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),coalesce(v_actor is not null and r.author_id=v_actor,false),r.id
 from public.community_replies r left join public.user_profiles profile on profile.id=r.author_id where r.post_id=p_post_id and r.deleted_at is null and r.moderation_hidden_at is null and (v_actor is null or r.author_id is null or not exists(select 1 from public.user_blocks b where (b.blocker_id=v_actor and b.blocked_id=r.author_id) or (b.blocker_id=r.author_id and b.blocked_id=v_actor))) and (p_cursor is null or (r.created_at,r.id)>(v_created,v_id)) order by r.created_at,r.id limit least(greatest(coalesce(p_limit,30),1),50);
end $$;


commit;
