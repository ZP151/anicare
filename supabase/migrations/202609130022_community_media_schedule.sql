begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

drop function public.claim_community_media_cleanup_jobs(integer);
create function public.claim_community_media_cleanup_jobs(p_limit integer default 25)
returns table(job_id uuid,media_id uuid,thumb_path text,display_path text,claim_id uuid) language plpgsql volatile security definer set search_path=pg_catalog as $$
begin
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid_cleanup_limit' using errcode='22023'; end if;
 return query with candidates as (select cleanup.id from private.community_media_cleanup_jobs cleanup join private.community_media_jobs media on media.id=cleanup.media_id where cleanup.status='pending' and cleanup.not_before<=now() and (cleanup.claimed_at is null or cleanup.claimed_at<=now()-interval '5 minutes') and (media.status='deletion_pending' or (media.status in ('reserved','finalized') and media.reservation_expires_at<=now())) order by cleanup.created_at limit p_limit for update of cleanup skip locked), claimed as (update private.community_media_cleanup_jobs c set claimed_at=now(),claim_id=extensions.gen_random_uuid() from candidates x where c.id=x.id returning c.*)
 select c.id,c.media_id,j.thumb_path,j.display_path,c.claim_id from claimed c join private.community_media_jobs j on j.id=c.media_id;
end $$;
revoke all on function public.claim_community_media_cleanup_jobs(integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_community_media_cleanup_jobs(integer) to service_role;

create function private.invoke_community_media_cleanup() returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare capability text; request_id bigint; issued text; nonce text; signature text;
begin
 select decrypted_secret into capability from vault.decrypted_secrets where name='animalhelper-community-media-cleanup-v1';
 if capability is null or capability !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
 issued := floor(extract(epoch from clock_timestamp()))::bigint::text;
 nonce := extensions.gen_random_uuid()::text;
 signature := encode(extensions.hmac(convert_to(E'animalhelper-community-media-cleanup-v1\n'||issued||E'\n'||nonce||E'\n{}','UTF8'),convert_to(capability,'UTF8'),'sha256'),'hex');
 select net.http_post(
   url := 'https://fhugdtpjbgiatqhvjioy.supabase.co/functions/v1/cleanup-community-media',
   body := '{}'::jsonb,
   headers := jsonb_build_object('Content-Type','application/json','x-cleanup-time',issued,'x-cleanup-nonce',nonce,'x-cleanup-signature',signature),
   timeout_milliseconds := 30000
 ) into request_id;
 return request_id;
end $$;
revoke all on function private.invoke_community_media_cleanup() from public,anon,authenticated,service_role;
select cron.schedule('animalhelper-community-media-cleanup-v1','*/15 * * * *','select private.invoke_community_media_cleanup()');
commit;
