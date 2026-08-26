begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_table('private', 'media_upload_jobs', 'upload jobs are private');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.media_assets'::regclass),
  'media assets retain RLS'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_assets' and column_name = 'status'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_assets' and column_name = 'reviewed_at'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'media_assets' and column_name = 'client_media_id'
  ),
  'media rows carry server-reviewed quarantine and idempotency fields'
);
select is(
  (select public from storage.buckets where id = 'media-staging'),
  false,
  'media staging bucket is private'
);
select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') like '%media-staging%' or coalesce(with_check, '') like '%media-staging%')$$,
  'media staging has no direct client storage policy in either USING or WITH CHECK'
);
select is_empty(
  $$select policyname from pg_policies
    where schemaname = 'public' and tablename = 'media_assets'
      and (coalesce(qual, '') <> '' or coalesce(with_check, '') <> '')$$,
  'media assets have no direct client row policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.media_assets', 'select'),
  'authenticated clients cannot select raw media rows'
);
select ok(
  to_regclass('public.public_animal_feed') is null,
  'legacy feed view exposing a storage path is removed'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.media_upload_jobs'::regclass
      and contype = 'f' and confdeltype = 'n'
      and pg_get_constraintdef(oid) like '%uploader_id%'
  ) and exists (
    select 1 from pg_attribute
    where attrelid = 'private.media_upload_jobs'::regclass
      and attname = 'uploader_id' and not attnotnull
  ),
  'profile deletion nulls retained service jobs instead of deleting their cleanup record'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000111', true);

select throws_ok(
  $$insert into public.media_assets (
      sighting_id, uploader_id, storage_bucket, storage_path, sha256,
      redaction_confirmed_at, client_media_id, status, reviewed_at
    ) values (
      '00000000-0000-0000-0000-000000000222',
      '00000000-0000-0000-0000-000000000111',
      'public-media', 'forged.jpg', repeat('a', 64), now(),
      'media-123456', 'quarantined', now()
    )$$,
  '42501',
  null,
  'authenticated callers cannot insert public media rows or forge review fields'
);
select throws_ok(
  $$update public.media_assets set status = 'quarantined', reviewed_at = now()$$,
  '42501',
  null,
  'authenticated callers cannot forge a reviewed timestamp or status'
);
select throws_ok(
  $$delete from public.media_assets$$,
  '42501',
  null,
  'authenticated callers cannot directly delete media rows'
);
select throws_ok(
  $$select public.reserve_media_upload_job(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64), 42, 1, 1,
      'jpeg-srgb-2048-q88.v1',
      '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
      now()
    )$$,
  '42501',
  null,
  'authenticated callers cannot invoke the service-only reservation RPC'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('public-media', '00000000-0000-0000-0000-000000000111/forged.jpg')$$,
  '42501',
  null,
  'authenticated callers cannot directly write the former public media bucket'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('media-staging', 'arbitrary/not-derived.jpg')$$,
  '42501',
  null,
  'authenticated callers cannot write arbitrary private staging paths'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select * from public.media_assets$$,
  '42501',
  null,
  'anon callers cannot select raw media rows'
);
reset role;

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at)
values ('00000000-0000-0000-0000-000000000111', 'Media Test Contributor', now());
set local session_replication_role = origin;
insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
) values (
  '00000000-0000-0000-0000-000000000222',
  '00000000-0000-0000-0000-000000000111',
  now(), '8928308280fffff', 'morning', 'normal', 'limited', 'media-finalize-001'
);
select throws_ok(
  $$insert into public.media_assets (
      sighting_id, uploader_id, storage_bucket, storage_path, sha256,
      redaction_confirmed_at, client_media_id, status, reviewed_at
    ) values (
      '00000000-0000-0000-0000-000000000222',
      '00000000-0000-0000-0000-000000000111',
      'media-staging', 'jobs/not-a-server-job.jpg', repeat('9', 64), now(),
      'receipt-null-1', 'quarantined', now()
    )$$,
  '23514',
  null,
  'a client media id cannot bypass required reviewed receipt fields with NULL values'
);

select lives_ok(
  $$select public.reserve_media_upload_job(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64), 42, 1, 1,
      'jpeg-srgb-2048-q88.v1',
      '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
      now()
    )$$,
  'first matching reservation succeeds'
);
select lives_ok(
  $$select public.reserve_media_upload_job(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64), 42, 1, 1,
      'jpeg-srgb-2048-q88.v1',
      '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
      now()
    )$$,
  'matching reservation retry succeeds'
);
select is(
  (select count(*) from private.media_upload_jobs
    where uploader_id = '00000000-0000-0000-0000-000000000111' and media_id = 'media-123456'),
  1::bigint,
  'matching reservation retries create one upload job'
);
select throws_ok(
  $$select public.reserve_media_upload_job(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('b', 64), 42, 1, 1,
      'jpeg-srgb-2048-q88.v1',
      '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb,
      now()
    )$$,
  'P0001',
  'idempotency_conflict',
  'conflicting reuse of a stable media id fails closed'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.media_upload_jobs'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%uploader_id, media_id%'
  ),
  'a unique database constraint makes concurrent duplicate reservations safe'
);
select lives_ok($test$
do $body$
declare job uuid; first_usable_until timestamptz; reminted_usable_until timestamptz;
begin
  select id into job from private.media_upload_jobs
  where uploader_id = '00000000-0000-0000-0000-000000000111' and media_id = 'media-123456';
  first_usable_until := public.record_media_upload_token_expiry(
    job, '00000000-0000-0000-0000-000000000111', now() + interval '2 hours 1 minute'
  );
  reminted_usable_until := public.record_media_upload_token_expiry(
    job, '00000000-0000-0000-0000-000000000111', now() + interval '2 hours 4 minutes'
  );
  if reminted_usable_until <= first_usable_until or reminted_usable_until is distinct from
      (select upload_token_expires_at from private.media_upload_jobs where id = job) then
    raise exception 'remint did not monotonically extend credential usability';
  end if;
end
$body$;
$test$, 'a later signed-token remint monotonically extends the stored usable-until time');
select lives_ok(
  $$select public.finalize_media_upload_job(
      (select id from private.media_upload_jobs
        where uploader_id = '00000000-0000-0000-0000-000000000111' and media_id = 'media-123456'),
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64)
    )$$,
  'first finalized mapping succeeds'
);
select lives_ok(
  $$select public.finalize_media_upload_job(
      (select id from private.media_upload_jobs
        where uploader_id = '00000000-0000-0000-0000-000000000111' and media_id = 'media-123456'),
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000222',
      'media-123456', repeat('a', 64)
    )$$,
  'duplicate finalization is idempotent'
);
select is(
  (select count(*) from public.media_assets
    where uploader_id = '00000000-0000-0000-0000-000000000111' and client_media_id = 'media-123456'
      and status = 'quarantined' and reviewed_at is not null),
  1::bigint,
  'duplicate finalization maps to one quarantined media row with a server review timestamp'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_assets'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%uploader_id, client_media_id%'
  ),
  'a unique media-row constraint makes concurrent finalization safe'
);
select ok(
  position(
    'p_uploader_id is null' in
    pg_get_functiondef('public.finalize_media_upload_job(uuid,uuid,uuid,text,text)'::regprocedure)
  ) > 0,
  'finalization explicitly rejects a null uploader before row comparison'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.media_assets'::regclass
      and pg_get_constraintdef(oid) like '%recipe_version is not null%'
      and pg_get_constraintdef(oid) like '%detector_versions is not null%'
  ),
  'review receipt fields cannot bypass NULL checks when a client media id is present'
);

select lives_ok($test$
do $body$
declare claim record;
begin
  perform public.reserve_media_upload_job('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222', 'cleanup-123', repeat('c', 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', now());
  update private.media_upload_jobs set reserved_at = now() - interval '30 minutes', reservation_expires_at = now() - interval '20 minutes', upload_token_expires_at = now() + interval '1 hour', next_cleanup_at = now() - interval '1 second' where media_id = 'cleanup-123';
  select * into claim from public.claim_expired_media_staging_jobs(25) where job_id = (select id from private.media_upload_jobs where media_id = 'cleanup-123');
  if not found or claim.cleanup_action <> 'remove_and_retry' then raise exception 'expected retry action'; end if;
  perform public.complete_media_staging_cleanup(claim.job_id, claim.object_path, claim.cleanup_claim_id, claim.cleanup_action, true);
  if not exists (select 1 from private.media_upload_jobs where media_id = 'cleanup-123') then raise exception 'job was purged before token expiry'; end if;
  update private.media_upload_jobs set upload_token_expires_at = now() - interval '6 minutes', next_cleanup_at = now() - interval '1 second' where media_id = 'cleanup-123';
  select * into claim from public.claim_expired_media_staging_jobs(25) where job_id = (select id from private.media_upload_jobs where media_id = 'cleanup-123');
  if not found or claim.cleanup_action <> 'remove_and_purge' then raise exception 'expected terminal purge action'; end if;
  perform public.complete_media_staging_cleanup(claim.job_id, claim.object_path, claim.cleanup_claim_id, claim.cleanup_action, true);
  if exists (select 1 from private.media_upload_jobs where media_id = 'cleanup-123') then raise exception 'terminal job row remains'; end if;
end
$body$;
$test$, 'unfinalized jobs are retried during token replay and terminally purged afterwards');

select lives_ok($test$
do $body$
declare claim record; asset uuid;
begin
  perform public.reserve_media_upload_job('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222', 'active-123456', repeat('d', 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', now());
  select public.finalize_media_upload_job(id, uploader_id, sighting_id, media_id, sha256) into asset from private.media_upload_jobs where media_id = 'active-123456';
  update private.media_upload_jobs set upload_token_expires_at = now() - interval '6 minutes', next_cleanup_at = now() - interval '1 second' where media_id = 'active-123456';
  select * into claim from public.claim_expired_media_staging_jobs(25) where job_id = (select id from private.media_upload_jobs where media_id = 'active-123456');
  if found then raise exception 'active finalized job was incorrectly scheduled for purge'; end if;
  if not exists (select 1 from private.media_upload_jobs where media_id = 'active-123456') or not exists (select 1 from public.media_assets where id = asset and deleted_at is null and status = 'quarantined') then raise exception 'active media lost its deletion cleanup record'; end if;
  perform public.server_request_media_deletion('00000000-0000-0000-0000-000000000111', asset);
  select * into claim from public.claim_expired_media_staging_jobs(25) where job_id = (select id from private.media_upload_jobs where media_id = 'active-123456');
  if not found or claim.cleanup_action <> 'remove_and_purge' then raise exception 'logical deletion after credential expiry did not create a terminal cleanup action'; end if;
  perform public.complete_media_staging_cleanup(claim.job_id, claim.object_path, claim.cleanup_claim_id, claim.cleanup_action, true);
  if exists (select 1 from private.media_upload_jobs where media_id = 'active-123456') then raise exception 'logical deletion did not purge its retained finalized job'; end if;
end
$body$;
$test$, 'an expired active finalized job is retained until user deletion creates a terminal cleanup action');

select lives_ok($test$
do $body$
declare claim record; asset uuid;
begin
  perform public.reserve_media_upload_job('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222', 'deleted-12345', repeat('e', 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', now());
  select public.finalize_media_upload_job(id, uploader_id, sighting_id, media_id, sha256) into asset from private.media_upload_jobs where media_id = 'deleted-12345';
  update private.media_upload_jobs set upload_token_expires_at = now() + interval '1 hour' where media_id = 'deleted-12345';
  perform public.server_request_media_deletion('00000000-0000-0000-0000-000000000111', asset);
  begin
    perform public.finalize_media_upload_job((select id from private.media_upload_jobs where media_id = 'deleted-12345'), '00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222', 'deleted-12345', repeat('e', 64));
    raise exception 'finalized retry unexpectedly returned active media';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'media_deleted' then raise; end if;
  end;
  update private.media_upload_jobs set next_cleanup_at = now() - interval '1 second' where media_id = 'deleted-12345';
  select * into claim from public.claim_expired_media_staging_jobs(25) where job_id = (select id from private.media_upload_jobs where media_id = 'deleted-12345');
  if not found or claim.cleanup_action <> 'defer_delete' then raise exception 'object deletion was not deferred during replay window'; end if;
  perform public.complete_media_staging_cleanup(claim.job_id, claim.object_path, claim.cleanup_claim_id, claim.cleanup_action, false);
  update private.media_upload_jobs set upload_token_expires_at = now() - interval '6 minutes', next_cleanup_at = now() - interval '1 second' where media_id = 'deleted-12345';
  select * into claim from public.claim_expired_media_staging_jobs(25) where job_id = (select id from private.media_upload_jobs where media_id = 'deleted-12345');
  if not found or claim.cleanup_action <> 'remove_and_purge' then raise exception 'deleted object was not purged after replay window'; end if;
  perform public.complete_media_staging_cleanup(claim.job_id, claim.object_path, claim.cleanup_claim_id, claim.cleanup_action, true);
  if exists (select 1 from private.media_upload_jobs where media_id = 'deleted-12345') then raise exception 'deleted job remains after safe purge'; end if;
end
$body$;
$test$, 'logical deletion defers object removal through token expiry and then purges it');

select lives_ok($test$
do $body$
begin
  perform public.reserve_media_upload_job('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222', 'fair-old-123', repeat('f', 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', now());
  perform public.reserve_media_upload_job('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222', 'fair-new-123', repeat('0', 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', now());
  perform public.reserve_media_upload_job('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000222', 'fair-lease-12', repeat('1', 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', now());
  update private.media_upload_jobs set reserved_at = now() - interval '70 minutes', reservation_expires_at = now() - interval '60 minutes', upload_token_expires_at = now() - interval '30 minutes', next_cleanup_at = now() - interval '50 minutes' where media_id = 'fair-old-123';
  update private.media_upload_jobs set reserved_at = now() - interval '70 minutes', reservation_expires_at = now() - interval '60 minutes', upload_token_expires_at = now() - interval '30 minutes', next_cleanup_at = now() - interval '1 minute' where media_id = 'fair-new-123';
  update private.media_upload_jobs set reserved_at = now() - interval '130 minutes', reservation_expires_at = now() - interval '120 minutes', upload_token_expires_at = now() - interval '30 minutes', next_cleanup_at = now() - interval '2 hours', cleanup_claimed_at = now(), cleanup_claim_id = extensions.gen_random_uuid() where media_id = 'fair-lease-12';
end
$body$;
$test$, 'fair cleanup fixtures are scheduled');
select is(
  (select array_agg(j.media_id order by j.next_cleanup_at, j.id)
   from public.claim_expired_media_staging_jobs(2) c
   join private.media_upload_jobs j on j.id = c.job_id
   where j.media_id in ('fair-old-123', 'fair-new-123', 'fair-lease-12')),
  array['fair-old-123', 'fair-new-123']::text[],
  'next_cleanup_at ordering processes oldest due work while a live lease cannot starve newer rows'
);
select lives_ok($test$
do $body$
declare claim record; job uuid;
begin
  set local session_replication_role = replica;
  insert into public.user_profiles (id, public_name, adult_confirmed_at)
  values ('00000000-0000-0000-0000-000000000333', 'Deletion Test Contributor', now());
  set local session_replication_role = origin;
  insert into public.sightings (id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key)
  values ('00000000-0000-0000-0000-000000000444', '00000000-0000-0000-0000-000000000333', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'profile-delete-media-001');
  perform public.reserve_media_upload_job('00000000-0000-0000-0000-000000000333', '00000000-0000-0000-0000-000000000444', 'profile-delete-1', repeat('2', 64), 42, 1, 1, 'jpeg-srgb-2048-q88.v1', '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}', now());
  update private.media_upload_jobs set reserved_at = now() - interval '130 minutes', reservation_expires_at = now() - interval '120 minutes', upload_token_expires_at = now() - interval '30 minutes', next_cleanup_at = now() - interval '1 second' where media_id = 'profile-delete-1'
  returning id into job;
  delete from public.user_profiles where id = '00000000-0000-0000-0000-000000000333';
  if not exists (select 1 from private.media_upload_jobs where id = job and uploader_id is null) then
    raise exception 'profile deletion destroyed the retained cleanup job instead of nulling ownership';
  end if;
  select * into claim from public.claim_expired_media_staging_jobs(25) where job_id = job;
  if not found or claim.cleanup_action <> 'remove_and_purge' then raise exception 'retained account-deletion job was not available for terminal cleanup'; end if;
  perform public.complete_media_staging_cleanup(claim.job_id, claim.object_path, claim.cleanup_claim_id, claim.cleanup_action, true);
  if exists (select 1 from private.media_upload_jobs where id = job) then raise exception 'retained account-deletion cleanup job was not terminally purged'; end if;
end
$body$;
$test$, 'profile deletion nulls service-job ownership while retaining and later purging cleanup state');
select * from finish();
rollback;
