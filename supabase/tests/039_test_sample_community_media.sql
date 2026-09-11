begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private','test_sample_community_media','synthetic community media ledger exists');
select col_is_null('private','community_media_cleanup_jobs','owner_id','anonymous fixture cleanup does not require a profile owner');

insert into public.community_posts(id,author_id,body,community_slug) values
 ('00000000-0000-4000-8000-000000003901',null,'[Test sample C09] Anonymous media fixture','bukit-batok');
insert into private.community_media_jobs(
 id,owner_id,request_id,payload_hash,thumb_sha256,thumb_byte_length,thumb_width,thumb_height,
 display_sha256,display_byte_length,display_width,display_height,reservation_expires_at,upload_token_expires_at,status,finalized_at,attached_at
) values (
 '00000000-0000-4000-8000-000000003902',null,'00000000-0000-4000-8000-000000003903',repeat('a',64),repeat('b',64),100,48,48,
 repeat('c',64),1000,480,320,now()+interval '10 minutes',now()+interval '2 hours 10 minutes','attached',now(),now()
);
insert into private.community_post_media(post_id,media_id,position) values
 ('00000000-0000-4000-8000-000000003901','00000000-0000-4000-8000-000000003902',0);
insert into private.community_media_cleanup_jobs(media_id,owner_id,status,not_before,completed_at) values
 ('00000000-0000-4000-8000-000000003902',null,'completed',now()+interval '2 hours 15 minutes',now());
insert into private.test_sample_community_media(fixture_key,position,post_id,media_id,source_file,display_sha256,thumb_sha256) values
 ('ios26-c09',0,'00000000-0000-4000-8000-000000003901','00000000-0000-4000-8000-000000003902','garden-pair.jpg',repeat('c',64),repeat('b',64));

select is((select count(*) from public.get_public_community_post_extras(array['00000000-0000-4000-8000-000000003901'::uuid])),1::bigint,'anonymous fixture uses the normal public extras projection');
update public.community_posts set deleted_at=now() where id='00000000-0000-4000-8000-000000003901';
select is((select status from private.community_media_cleanup_jobs where media_id='00000000-0000-4000-8000-000000003902'),'pending','deleting an anonymous fixture queues its media cleanup');
update private.community_media_cleanup_jobs set not_before=now()-interval '1 second' where media_id='00000000-0000-4000-8000-000000003902';
select set_config('test.cleanup_job',job_id::text,true),set_config('test.cleanup_claim',claim_id::text,true) from public.claim_community_media_cleanup_jobs(1);
select ok(current_setting('test.cleanup_job',true) is not null,'anonymous fixture cleanup is claimable after its delay');
select lives_ok($$select public.complete_community_media_cleanup_job(current_setting('test.cleanup_job')::uuid,current_setting('test.cleanup_claim')::uuid)$$,'claimed anonymous cleanup completes');
select is((select status from private.community_media_cleanup_jobs where media_id='00000000-0000-4000-8000-000000003902'),'completed','anonymous cleanup completion is recorded');

select * from finish();
rollback;
