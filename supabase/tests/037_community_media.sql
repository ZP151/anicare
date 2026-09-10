begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','create_community_post_with_media',array['text','text','uuid','text','uuid[]','uuid'],'atomic community post publication exists');
select has_function('public','get_public_community_post_extras',array['uuid[]'],'batch extras projection exists');
select is((select public from storage.buckets where id='community-media'),false,'community media bucket is private');

set local session_replication_role=replica;
insert into auth.users(id,email,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000003701','community-media-owner@example.test',now(),now()),
 ('00000000-0000-4000-8000-000000003702','community-media-other@example.test',now(),now());
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000003701','Community media owner',now()),
 ('00000000-0000-4000-8000-000000003702','Community media other',now());
set local session_replication_role=origin;

select lives_ok($$select * from public.reserve_community_media_upload('00000000-0000-4000-8000-000000003701','00000000-0000-4000-8000-000000003703',repeat('a',64),100,48,48,repeat('b',64),1000,480,320)$$,'owner reserves a two-variant upload');
select set_config('test.community_media_one',(select id::text from private.community_media_jobs where owner_id='00000000-0000-4000-8000-000000003701'),true);
select is((select thumb_path from private.community_media_jobs where id=current_setting('test.community_media_one')::uuid),'media/'||current_setting('test.community_media_one')||'/thumb.jpg','thumb path is server-derived');
select lives_ok($$select public.finalize_community_media_upload('00000000-0000-4000-8000-000000003701',current_setting('test.community_media_one')::uuid)$$,'owner finalizes validated pair');
select is(public.finalize_community_media_upload('00000000-0000-4000-8000-000000003701',current_setting('test.community_media_one')::uuid),current_setting('test.community_media_one')::uuid,'lost finalize response replays the same media ID');

select lives_ok($$select * from public.reserve_community_media_upload('00000000-0000-4000-8000-000000003701','00000000-0000-4000-8000-000000003710',repeat('c',64),100,48,48,repeat('d',64),1000,480,320)$$,'owner reserves a separately expiring upload');
select set_config('test.community_media_expired',(select id::text from private.community_media_jobs where owner_id='00000000-0000-4000-8000-000000003701' and request_id='00000000-0000-4000-8000-000000003710'),true);
select lives_ok($$select public.finalize_community_media_upload('00000000-0000-4000-8000-000000003701',current_setting('test.community_media_expired')::uuid)$$,'owner finalizes the separately expiring upload');
update private.community_media_jobs set created_at=now()-interval '10 minutes',reservation_expires_at=now()-interval '1 second',upload_token_expires_at=now()+interval '1 hour' where id=current_setting('test.community_media_expired')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003701',true);
select set_config('test.post_zero',(select public.create_community_post_with_media('zero attachments',null,null,'clementi','{}'::uuid[],'00000000-0000-4000-8000-000000003704')::text),true);
select set_config('test.post_one',(select public.create_community_post_with_media('one attachment','Cover',null,'clementi',array[current_setting('test.community_media_one')::uuid],'00000000-0000-4000-8000-000000003705')::text),true);
select throws_ok($$select public.create_community_post_with_media('seven attachments',null,null,'clementi',array_fill(current_setting('test.community_media_one')::uuid,array[7]),'00000000-0000-4000-8000-000000003706')$$,'22023','invalid_community_post','seven attachments are rejected before publication');
select throws_ok($$select public.create_community_post_with_media('duplicate attachments',null,null,'clementi',array[current_setting('test.community_media_one')::uuid,current_setting('test.community_media_one')::uuid],'00000000-0000-4000-8000-000000003707')$$,'22023','invalid_community_post','duplicate attachments are rejected before publication');
reset role;
select is((select jsonb_array_length(media) from public.get_public_community_post_extras(array[current_setting('test.post_zero')::uuid])),0,'text posts retain an empty media array');
select is((select title from public.get_public_community_post_extras(array[current_setting('test.post_one')::uuid])),'Cover','extras expose only the explicit title');
select is((select media->0->>'mediaId' from public.get_public_community_post_extras(array[current_setting('test.post_one')::uuid])),current_setting('test.community_media_one'),'extras preserve attachment order and omit paths');
update private.community_media_cleanup_jobs set not_before=now()-interval '1 second' where media_id=current_setting('test.community_media_one')::uuid;
select is_empty($$select * from public.claim_community_media_cleanup_jobs(25)$$,'attached media cannot be collected as an expired upload orphan');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003702',true);
select throws_ok($$select public.create_community_post_with_media('foreign media',null,null,'clementi',array[current_setting('test.community_media_one')::uuid],'00000000-0000-4000-8000-000000003708')$$,'P0001','community_media_not_available','foreign media cannot publish');
reset role;
select is((select count(*) from public.community_posts where body='foreign media'),0::bigint,'failed attachment validation leaves no partial post');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003701',true);
select throws_ok($$select public.create_community_post_with_media('expired attachment',null,null,'clementi',array[current_setting('test.community_media_expired')::uuid],'00000000-0000-4000-8000-000000003711')$$,'P0001','community_media_expired','expired owned media gives the exact safe-to-reopen recovery error');
reset role;
select is((select count(*) from public.community_posts where body='expired attachment'),0::bigint,'expired media recovery leaves no post');
select is_empty($$select 1 from private.safety_requests where actor_id='00000000-0000-4000-8000-000000003701' and request_id='00000000-0000-4000-8000-000000003711'$$,'expired media recovery leaves no idempotency record');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003701',true);
reset role;
update private.community_media_jobs set created_at=now()-interval '10 minutes',reservation_expires_at=now()-interval '1 second',upload_token_expires_at=now()+interval '1 hour' where id=current_setting('test.community_media_one')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003701',true);
select is(public.create_community_post_with_media('one attachment','Cover',null,'clementi',array[current_setting('test.community_media_one')::uuid],'00000000-0000-4000-8000-000000003705'),current_setting('test.post_one')::uuid,'same ordered attachment publication replays');
select throws_ok($$select public.create_community_post_with_media('one attachment','Changed',null,'clementi',array[current_setting('test.community_media_one')::uuid],'00000000-0000-4000-8000-000000003705')$$,'P0001','idempotency_conflict','changed title conflicts with the replay key');
reset role;
select is((select count(*) from public.get_public_community_post(current_setting('test.post_one')::uuid)),1::bigint,'legacy post response remains available');
select is(public.resolve_public_community_media(current_setting('test.post_one')::uuid,current_setting('test.community_media_one')::uuid,'thumb',null),'media/'||current_setting('test.community_media_one')||'/thumb.jpg','guest can resolve a visible attached thumbnail');
update public.community_posts set deleted_at=now() where id=current_setting('test.post_one')::uuid;
select is(public.resolve_public_community_media(current_setting('test.post_one')::uuid,current_setting('test.community_media_one')::uuid,'thumb',null),null::text,'deleted post invalidates media reads immediately');

select * from finish();
rollback;
