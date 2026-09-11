begin;

alter table private.community_media_cleanup_jobs alter column owner_id drop not null;

create table private.test_sample_community_media (
 fixture_key text not null check (fixture_key ~ '^ios26-c[0-9]{2}$'),
 position smallint not null check (position between 0 and 5),
 post_id uuid not null references public.community_posts(id) on delete cascade,
 media_id uuid not null unique references private.community_media_jobs(id) on delete restrict,
 source_file text not null check (source_file ~ '^[a-z0-9-]+[.]jpg$'),
 display_sha256 text not null check (display_sha256 ~ '^[a-f0-9]{64}$'),
 thumb_sha256 text not null check (thumb_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default pg_catalog.now(),
 primary key (fixture_key,position),
 unique (post_id,position)
);
alter table private.test_sample_community_media enable row level security;
revoke all on table private.test_sample_community_media from public,anon,authenticated,service_role;
grant select,insert,update,delete on table private.test_sample_community_media to service_role;

create or replace function private.queue_deleted_community_post_media() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if old.deleted_at is null and new.deleted_at is not null then
   perform private.queue_community_media_cleanup(j.id,coalesce(j.owner_id,p.author_id),greatest(now(),j.upload_token_expires_at+interval '5 minutes'))
   from private.community_post_media a
   join private.community_media_jobs j on j.id=a.media_id
   join public.community_posts p on p.id=a.post_id
   where a.post_id=new.id and j.status='attached';
 end if;
 return new;
end $$;

commit;
