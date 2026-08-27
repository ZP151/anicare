begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000911', 'Legacy Unicode Owner', now()),
  ('00000000-0000-4000-8000-000000000912', 'Foreign Prefix Owner', now());
set local session_replication_role = origin;

insert into public.media_assets (id, uploader_id, storage_bucket, storage_path, sha256, redaction_confirmed_at) values
  ('00000000-0000-4000-8000-000000000913', '00000000-0000-4000-8000-000000000911', 'public-media', '00000000-0000-4000-8000-000000000911/My photo 猫.jpg', repeat('a', 64), now()),
  ('00000000-0000-4000-8000-000000000914', '00000000-0000-4000-8000-000000000911', 'private-evidence', '00000000-0000-4000-8000-000000000911/证据 文件.jpg', repeat('b', 64), now()),
  ('00000000-0000-4000-8000-000000000915', '00000000-0000-4000-8000-000000000911', 'public-media', '00000000-0000-4000-8000-000000000912/foreign-prefix.jpg', repeat('c', 64), now()),
  ('00000000-0000-4000-8000-000000000916', '00000000-0000-4000-8000-000000000911', 'private-evidence', '00000000-0000-4000-8000-000000000911/../escape.jpg', repeat('d', 64), now());

select lives_ok(
  $$delete from public.user_profiles where id = '00000000-0000-4000-8000-000000000911'$$,
  'legacy foreign-prefix and traversal metadata cannot abort account erasure'
);
select is(
  (select count(*) from private.legacy_media_deletion_jobs where media_id between '00000000-0000-4000-8000-000000000913' and '00000000-0000-4000-8000-000000000916'),
  4::bigint,
  'every legacy asset has a durable cleanup or manual-review row'
);
select is(
  (select count(*) from private.legacy_media_deletion_jobs
    where media_id between '00000000-0000-4000-8000-000000000913' and '00000000-0000-4000-8000-000000000916'
      and expected_owner_id = '00000000-0000-4000-8000-000000000911'),
  4::bigint,
  'outbox retains the immutable uploader identity used for path authorization'
);
select is(
  (select count(*) from private.legacy_media_deletion_jobs
    where media_id in ('00000000-0000-4000-8000-000000000913', '00000000-0000-4000-8000-000000000914')
      and status = 'pending'),
  2::bigint,
  'owner-prefixed legacy paths with spaces and Unicode remain cleanup eligible'
);
select is(
  (select count(*) from private.legacy_media_deletion_jobs
    where media_id in ('00000000-0000-4000-8000-000000000915', '00000000-0000-4000-8000-000000000916')
      and status = 'terminal_failure' and terminal_reason = 'unsafe_legacy_storage_target'),
  2::bigint,
  'foreign-prefix and traversal targets become durable manual-review rows'
);
select is(
  (select count(*) from public.media_assets
    where id between '00000000-0000-4000-8000-000000000913' and '00000000-0000-4000-8000-000000000916'
      and uploader_id is null),
  4::bigint,
  'ownership clears even when historical metadata is unsafe'
);
select is(
  (select count(*) from public.claim_legacy_media_deletion_jobs(10)),
  2::bigint,
  'scheduler claims only the two trusted owner-prefixed legacy targets'
);
select is(
  (select count(*) from private.legacy_media_deletion_jobs
    where media_id in ('00000000-0000-4000-8000-000000000915', '00000000-0000-4000-8000-000000000916')
      and cleanup_claim_id is null),
  2::bigint,
  'unsafe legacy targets are never claimed for Storage deletion'
);
select is(
  (select count(*) from private.legacy_media_deletion_jobs
    where media_id in ('00000000-0000-4000-8000-000000000913', '00000000-0000-4000-8000-000000000914')
      and cleanup_claim_id is not null),
  2::bigint,
  'trusted legacy targets carry scheduler claims after account deletion'
);

select * from finish();
rollback;
