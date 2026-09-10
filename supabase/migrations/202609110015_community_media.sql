begin;

alter table public.community_posts add column if not exists title text;
alter table public.community_posts add constraint community_posts_title_check check (title is null or pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 120);

create table private.community_media_jobs (
 id uuid primary key default extensions.gen_random_uuid(),
 owner_id uuid references public.user_profiles(id) on delete set null,
 request_id uuid not null,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 thumb_sha256 text not null check(thumb_sha256 ~ '^[a-f0-9]{64}$'),
 thumb_byte_length integer not null check(thumb_byte_length between 1 and 524288),
 thumb_width integer not null check(thumb_width between 1 and 480),
 thumb_height integer not null check(thumb_height between 1 and 480),
 display_sha256 text not null check(display_sha256 ~ '^[a-f0-9]{64}$'),
 display_byte_length integer not null check(display_byte_length between 1 and 4194304),
 display_width integer not null check(display_width between 1 and 2048),
 display_height integer not null check(display_height between 1 and 2048),
 thumb_path text generated always as ('media/'||id::text||'/thumb.jpg') stored unique,
 display_path text generated always as ('media/'||id::text||'/display.jpg') stored unique,
 reservation_expires_at timestamptz not null,
 upload_token_expires_at timestamptz not null,
 status text not null default 'reserved' check(status in ('reserved','finalized','attached','deletion_pending','completed')),
 finalized_at timestamptz,
 attached_at timestamptz,
 created_at timestamptz not null default pg_catalog.now(),
 unique(owner_id,request_id),
 check(reservation_expires_at>created_at and reservation_expires_at<=created_at+interval '15 minutes'),
 check(upload_token_expires_at>created_at and upload_token_expires_at<=created_at+interval '2 hours 15 minutes')
);
alter table private.community_media_jobs enable row level security;
revoke all on private.community_media_jobs from public,anon,authenticated,service_role;

create table private.community_post_media (
 post_id uuid not null references public.community_posts(id) on delete cascade,
 media_id uuid not null references private.community_media_jobs(id) on delete restrict,
 position smallint not null check(position between 0 and 5),
 primary key(post_id,media_id), unique(post_id,position)
);
alter table private.community_post_media enable row level security;
revoke all on private.community_post_media from public,anon,authenticated,service_role;

create table private.community_media_cleanup_jobs (
 id uuid primary key default extensions.gen_random_uuid(),
 media_id uuid not null unique references private.community_media_jobs(id) on delete cascade,
 owner_id uuid not null,
 status text not null default 'pending' check(status in ('pending','completed')),
 not_before timestamptz not null,
 claimed_at timestamptz,
 claim_id uuid,
 created_at timestamptz not null default pg_catalog.now(),
 completed_at timestamptz
);
alter table private.community_media_cleanup_jobs enable row level security;
revoke all on private.community_media_cleanup_jobs from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('community-media','community-media',false,4194304,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.reserve_community_media_upload(
 p_owner_id uuid,p_request_id uuid,p_thumb_sha256 text,p_thumb_byte_length integer,p_thumb_width integer,p_thumb_height integer,
 p_display_sha256 text,p_display_byte_length integer,p_display_width integer,p_display_height integer)
returns table(job_id uuid,reservation_expires_at timestamptz,thumb_path text,display_path text)
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare prior private.community_media_jobs%rowtype; v_hash text; v_id uuid:=extensions.gen_random_uuid();
begin
 if p_owner_id is null or p_request_id is null or p_thumb_sha256 !~ '^[a-f0-9]{64}$' or p_display_sha256 !~ '^[a-f0-9]{64}$'
  or p_thumb_byte_length not between 1 and 524288 or p_thumb_width not between 1 and 480 or p_thumb_height not between 1 and 480
  or p_display_byte_length not between 1 and 4194304 or p_display_width not between 1 and 2048 or p_display_height not between 1 and 2048 then raise exception 'invalid_community_media_reservation' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(jsonb_build_object('thumb',jsonb_build_object('sha256',p_thumb_sha256,'byteLength',p_thumb_byte_length,'width',p_thumb_width,'height',p_thumb_height),'display',jsonb_build_object('sha256',p_display_sha256,'byteLength',p_display_byte_length,'width',p_display_width,'height',p_display_height))::text,'sha256'),'hex');
 perform 1 from public.user_profiles where id=p_owner_id for update;
 if not found or not private.community_mutation_eligible(p_owner_id) then raise exception 'community_media_not_available' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text||':'||p_request_id::text,0));
 select * into prior from private.community_media_jobs where owner_id=p_owner_id and request_id=p_request_id for update;
 if found then
  if prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
  if prior.status<>'reserved' or prior.reservation_expires_at<=now() then raise exception 'community_media_not_available' using errcode='P0001'; end if;
  return query select prior.id,prior.reservation_expires_at,prior.thumb_path,prior.display_path; return;
 end if;
 if (select count(*) from private.community_media_jobs job where job.owner_id=p_owner_id and job.status='reserved' and job.reservation_expires_at>now())>=12 then raise exception 'community_media_quota_exceeded' using errcode='42901'; end if;
 insert into private.community_media_jobs(id,owner_id,request_id,payload_hash,thumb_sha256,thumb_byte_length,thumb_width,thumb_height,display_sha256,display_byte_length,display_width,display_height,reservation_expires_at,upload_token_expires_at)
 values(v_id,p_owner_id,p_request_id,v_hash,p_thumb_sha256,p_thumb_byte_length,p_thumb_width,p_thumb_height,p_display_sha256,p_display_byte_length,p_display_width,p_display_height,now()+interval '10 minutes',now()+interval '2 hours 10 minutes');
 insert into private.community_media_cleanup_jobs(media_id,owner_id,not_before) values(v_id,p_owner_id,now()+interval '2 hours 15 minutes');
 return query select job.id,job.reservation_expires_at,job.thumb_path,job.display_path from private.community_media_jobs job where job.id=v_id;
end $$;

create or replace function public.get_community_media_upload_job(p_owner_id uuid,p_job_id uuid)
returns table(status text,reservation_expires_at timestamptz,thumb_path text,thumb_sha256 text,thumb_byte_length integer,thumb_width integer,thumb_height integer,display_path text,display_sha256 text,display_byte_length integer,display_width integer,display_height integer)
language sql stable security definer set search_path=pg_catalog as $$
 select status,reservation_expires_at,thumb_path,thumb_sha256,thumb_byte_length,thumb_width,thumb_height,display_path,display_sha256,display_byte_length,display_width,display_height from private.community_media_jobs where id=p_job_id and owner_id=p_owner_id;
$$;

create or replace function public.finalize_community_media_upload(p_owner_id uuid,p_job_id uuid)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare job private.community_media_jobs%rowtype;
begin
 select * into job from private.community_media_jobs where id=p_job_id for update;
 if not found or job.owner_id is distinct from p_owner_id or exists(select 1 from private.account_erasure_requests where target_subject_id=p_owner_id and status<>'completed') then raise exception 'community_media_not_available' using errcode='42501'; end if;
 if job.status='finalized' then return job.id; end if;
 if job.status<>'reserved' or job.reservation_expires_at<=now() then raise exception 'community_media_not_available' using errcode='P0001'; end if;
 update private.community_media_jobs set status='finalized',finalized_at=now() where id=job.id;
 return job.id;
end $$;

create or replace function public.create_community_post_with_media(p_body text,p_title text,p_cat_id uuid,p_community_slug text,p_media_ids uuid[],p_request_id uuid)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_body text:=nullif(btrim(p_body),''); v_title text:=nullif(btrim(p_title),''); v_hash text; prior private.safety_requests%rowtype; post_id uuid; v_media_id uuid; position integer:=0;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if not private.community_mutation_eligible(v_actor) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 if v_body is null or char_length(v_body)>2000 or (v_title is not null and char_length(v_title)>120) or p_request_id is null or coalesce(cardinality(p_media_ids),0)>6 or cardinality(p_media_ids)<>cardinality(array(select distinct value from unnest(coalesce(p_media_ids,'{}'::uuid[])) value)) or (p_community_slug is not null and p_community_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$') or (p_cat_id is null and p_community_slug is null) then raise exception 'invalid_community_post' using errcode='22023'; end if;
 if p_cat_id is not null and not private.is_public_cat_available(p_cat_id,v_actor) then raise exception 'community_cat_not_available' using errcode='P0001'; end if;
 perform 1 from public.user_profiles where id=v_actor for update;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_request_id::text,0));
 v_hash:=encode(extensions.digest(jsonb_build_object('body',v_body,'title',v_title,'catId',p_cat_id,'communitySlug',p_community_slug,'mediaIds',coalesce(p_media_ids,'{}'::uuid[]))::text,'sha256'),'hex');
 select * into prior from private.safety_requests request_row where request_row.actor_id=v_actor and request_row.request_id=p_request_id for update;
 if found then if prior.operation<>'community_post' or prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return prior.result_id; end if;
 perform 1 from private.community_media_jobs j where j.id=any(coalesce(p_media_ids,'{}'::uuid[])) order by j.id for update;
 if (select count(*) from private.community_media_jobs j where j.id=any(coalesce(p_media_ids,'{}'::uuid[])) and j.owner_id=v_actor and j.status='finalized' and j.reservation_expires_at>now())<>coalesce(cardinality(p_media_ids),0) then raise exception 'community_media_not_available' using errcode='P0001'; end if;
 insert into public.community_posts(author_id,body,title,cat_id,community_slug) values(v_actor,v_body,v_title,p_cat_id,p_community_slug) returning id into post_id;
 foreach v_media_id in array coalesce(p_media_ids,'{}'::uuid[]) loop
  insert into private.community_post_media(post_id,media_id,position) values(post_id,v_media_id,position);
  update private.community_media_jobs set status='attached',attached_at=now() where id=v_media_id;
  update private.community_media_cleanup_jobs cleanup set status='completed',completed_at=now(),claimed_at=null,claim_id=null where cleanup.media_id=v_media_id and cleanup.status='pending';
  position:=position+1;
 end loop;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash,result_id) values(v_actor,p_request_id,'community_post',post_id,v_hash,post_id);
 return post_id;
end $$;

create or replace function public.get_public_community_post_extras(p_post_ids uuid[])
returns table("postId" uuid,title text,media jsonb) language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if p_post_ids is null or cardinality(p_post_ids)>50 then raise exception 'invalid_community_media_request' using errcode='22023'; end if;
 return query select p.id,p.title,coalesce(jsonb_agg(jsonb_build_object('mediaId',j.id,'width',j.display_width,'height',j.display_height) order by a.position) filter(where j.id is not null),'[]'::jsonb)
 from public.community_posts p left join private.community_post_media a on a.post_id=p.id left join private.community_media_jobs j on j.id=a.media_id and j.status='attached'
 where p.id=any(p_post_ids) and private.community_post_available(p.id,auth.uid()) group by p.id,p.title;
end $$;

create or replace function public.resolve_public_community_media(p_post_id uuid,p_media_id uuid,p_variant text,p_actor uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
 select case when p_variant='thumb' then j.thumb_path else j.display_path end from public.community_posts p join private.community_post_media a on a.post_id=p.id join private.community_media_jobs j on j.id=a.media_id
 where p.id=p_post_id and j.id=p_media_id and p_variant in ('thumb','display') and j.status='attached' and private.community_post_available(p.id,p_actor);
$$;

create or replace function private.queue_community_media_cleanup(p_media_id uuid,p_owner_id uuid,p_not_before timestamptz) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into private.community_media_cleanup_jobs(media_id,owner_id,not_before) values(p_media_id,p_owner_id,p_not_before)
 on conflict(media_id) do update set status='pending',not_before=greatest(private.community_media_cleanup_jobs.not_before,excluded.not_before),claimed_at=null,claim_id=null,completed_at=null;
 update private.community_media_jobs set status='deletion_pending' where id=p_media_id and status in ('reserved','finalized','attached');
end $$;
create or replace function private.queue_deleted_community_post_media() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if old.deleted_at is null and new.deleted_at is not null then perform private.queue_community_media_cleanup(j.id,coalesce(j.owner_id,p.author_id),greatest(now(),j.upload_token_expires_at+interval '5 minutes')) from private.community_post_media a join private.community_media_jobs j on j.id=a.media_id join public.community_posts p on p.id=a.post_id where a.post_id=new.id and j.status='attached' and coalesce(j.owner_id,p.author_id) is not null; end if;
 return new;
end $$;
create trigger queue_deleted_community_post_media after update of deleted_at on public.community_posts for each row execute function private.queue_deleted_community_post_media();
create or replace function private.queue_community_media_owner_cleanup() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform private.queue_community_media_cleanup(j.id,old.id,greatest(now(),j.upload_token_expires_at+interval '5 minutes')) from private.community_media_jobs j where j.owner_id=old.id and j.status in ('reserved','finalized','attached');
 update private.community_media_jobs set owner_id=null where owner_id=old.id;
 return old;
end $$;
create trigger aaa_queue_community_media_cleanup before delete on public.user_profiles for each row execute function private.queue_community_media_owner_cleanup();

create or replace function public.claim_community_media_cleanup_jobs(p_limit integer default 25)
returns table(job_id uuid,thumb_path text,display_path text,claim_id uuid) language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_cleanup_limit' using errcode='22023'; end if;
 return query with candidates as (select cleanup.id from private.community_media_cleanup_jobs cleanup join private.community_media_jobs media on media.id=cleanup.media_id where cleanup.status='pending' and cleanup.not_before<=now() and (cleanup.claimed_at is null or cleanup.claimed_at<=now()-interval '5 minutes') and (media.status='deletion_pending' or (media.status in ('reserved','finalized') and media.reservation_expires_at<=now())) order by cleanup.created_at limit p_limit for update of cleanup skip locked), claimed as (update private.community_media_cleanup_jobs c set claimed_at=now(),claim_id=extensions.gen_random_uuid() from candidates x where c.id=x.id returning c.*)
 select c.id,j.thumb_path,j.display_path,c.claim_id from claimed c join private.community_media_jobs j on j.id=c.media_id;
end $$;
create or replace function public.complete_community_media_cleanup_job(p_job_id uuid,p_claim_id uuid) returns void language plpgsql volatile security definer set search_path=pg_catalog as $$
declare media uuid; begin update private.community_media_cleanup_jobs set status='completed',completed_at=now(),claimed_at=null where id=p_job_id and claim_id=p_claim_id and status='pending' returning media_id into media; if not found then raise exception 'invalid_community_media_cleanup_claim' using errcode='P0001'; end if; update private.community_media_jobs set status='completed' where id=media; end $$;

alter table private.account_erasure_cleanup_links drop constraint if exists account_erasure_cleanup_links_cleanup_kind_check;
alter table private.account_erasure_cleanup_links add constraint account_erasure_cleanup_links_cleanup_kind_check check(cleanup_kind in ('staging','legacy','profile_avatar','community_media'));
create or replace function private.capture_erasure_community_media_links() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into private.account_erasure_cleanup_links(erasure_request_id,cleanup_kind,cleanup_job_id)
 select r.id,'community_media',c.id from private.account_erasure_requests r join private.community_media_cleanup_jobs c on c.owner_id=old.id where r.target_subject_id=old.id and r.status in ('received','processing','retryable','cleanup_pending') on conflict do nothing; return old;
end $$;
create trigger aad_capture_erasure_community_media after delete on public.user_profiles for each row execute function private.capture_erasure_community_media_links();
create or replace function public.finish_account_erasure(p_request_id uuid,p_claim_id uuid) returns table("requestId" uuid,status text) language plpgsql volatile security definer set search_path=pg_catalog as $$
declare request_row private.account_erasure_requests%rowtype; cleanup_done boolean; final_status text; begin
 select * into request_row from private.account_erasure_requests where request_id=p_request_id for update; if not found or p_claim_id is null or request_row.claim_id is distinct from p_claim_id or request_row.claimed_at<=now()-interval '5 minutes' then raise exception 'invalid_erasure_claim' using errcode='P0001'; end if;
 if exists(select 1 from auth.users where id=request_row.target_subject_id) then raise exception 'auth_account_not_deleted' using errcode='P0001'; end if;
 select not exists(select 1 from private.account_erasure_cleanup_links l where l.erasure_request_id=request_row.id and ((l.cleanup_kind='staging' and exists(select 1 from private.media_upload_jobs j where j.id=l.cleanup_job_id)) or (l.cleanup_kind='legacy' and not exists(select 1 from private.legacy_media_deletion_jobs j where j.id=l.cleanup_job_id and j.status='completed'::private.legacy_media_deletion_status)) or (l.cleanup_kind='profile_avatar' and not exists(select 1 from private.profile_avatar_cleanup_jobs j where j.id=l.cleanup_job_id and j.status='completed')) or (l.cleanup_kind='community_media' and not exists(select 1 from private.community_media_cleanup_jobs j where j.id=l.cleanup_job_id and j.status='completed')))) into cleanup_done;
 final_status:=case when cleanup_done then 'completed' else 'cleanup_pending' end; update private.account_erasure_requests set status=final_status,claim_id=null,claimed_at=null,target_subject_id=case when final_status='completed' then null else target_subject_id end,updated_at=now() where id=request_row.id; return query select request_row.request_id,final_status;
end $$;

revoke all on function public.reserve_community_media_upload(uuid,uuid,text,integer,integer,integer,text,integer,integer,integer),public.get_community_media_upload_job(uuid,uuid),public.finalize_community_media_upload(uuid,uuid),public.claim_community_media_cleanup_jobs(integer),public.complete_community_media_cleanup_job(uuid,uuid),public.resolve_public_community_media(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_community_post_with_media(text,text,uuid,text,uuid[],uuid),public.get_public_community_post_extras(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.reserve_community_media_upload(uuid,uuid,text,integer,integer,integer,text,integer,integer,integer),public.get_community_media_upload_job(uuid,uuid),public.finalize_community_media_upload(uuid,uuid),public.claim_community_media_cleanup_jobs(integer),public.complete_community_media_cleanup_job(uuid,uuid),public.resolve_public_community_media(uuid,uuid,text,uuid) to service_role;
grant execute on function public.create_community_post_with_media(text,text,uuid,text,uuid[],uuid) to authenticated;
grant execute on function public.get_public_community_post_extras(uuid[]) to anon,authenticated;
commit;
