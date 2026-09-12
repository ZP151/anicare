begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','list_my_community_photos',array['jsonb','integer'],'independent owner photo projection');
insert into auth.users(id) values ('00000000-0000-4000-8000-000000004201'),('00000000-0000-4000-8000-000000004202');
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000004201','Photo owner',now()),
 ('00000000-0000-4000-8000-000000004202','Other owner',now());
set local session_replication_role=origin;
insert into public.community_posts(id,author_id,body,community_slug,created_at) values
 ('00000000-0000-4000-8000-000000004210','00000000-0000-4000-8000-000000004201','Six photos','clementi','2026-09-10T01:00:00.123456Z'),
 ('00000000-0000-4000-8000-000000004211','00000000-0000-4000-8000-000000004202','Other photos','clementi','2026-09-10T01:00:00.123456Z');
insert into public.community_posts(author_id,body,community_slug,created_at)
 select '00000000-0000-4000-8000-000000004201','Newer text '||n,'clementi','2026-09-11T00:00:00Z' from generate_series(1,25) n;
insert into private.community_media_jobs(id,owner_id,request_id,payload_hash,thumb_sha256,thumb_byte_length,thumb_width,thumb_height,display_sha256,display_byte_length,display_width,display_height,reservation_expires_at,upload_token_expires_at,status)
 select format('00000000-0000-4000-8000-%s',lpad((4230+n)::text,12,'0'))::uuid,
 case when n<6 then '00000000-0000-4000-8000-000000004201'::uuid else '00000000-0000-4000-8000-000000004202'::uuid end,
 extensions.gen_random_uuid(),repeat('a',64),repeat('b',64),100,48,48,repeat('c',64),1000,480,640,now()+interval '10 minutes',now()+interval '2 hours','attached' from generate_series(0,6) n;
insert into private.community_post_media(post_id,media_id,position)
 select case when n<6 then '00000000-0000-4000-8000-000000004210'::uuid else '00000000-0000-4000-8000-000000004211'::uuid end,
 format('00000000-0000-4000-8000-%s',lpad((4230+n)::text,12,'0'))::uuid,case when n<6 then n else 0 end from generate_series(0,6) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004201',true);
select is((select count(*) from public.list_my_community_photos()),6::bigint,'finds all photos behind 25 text posts, excludes foreign media');
select results_eq($$select position::integer from public.list_my_community_photos(null,3)$$,array[0,1,2],'within-post ordering and bounded page');
select set_config('test.photo_cursor',(select cursor::text from public.list_my_community_photos(null,3) offset 2 limit 1),true);
select results_eq($$select position::integer from public.list_my_community_photos(current_setting('test.photo_cursor')::jsonb,3)$$,array[3,4,5],'photo cursor resumes within a six-photo post');
select throws_ok($$select * from public.list_my_community_photos('{}'::jsonb)$$,'22023','invalid_profile_photo_cursor','bad cursor rejected');
select throws_ok($$select * from public.list_my_community_photos(null,100)$$,'22023','invalid_profile_photo_limit','read size bounded');
select lives_ok($$update public.user_profiles set neighbourhood_id='sg-clsz05' where id=auth.uid()$$,'owner saves stable neighbourhood');
select is((select neighbourhood_id from public.user_profiles where id=auth.uid()),'sg-clsz05','neighbourhood persisted');
select throws_ok($$update public.user_profiles set neighbourhood_id='invented-area' where id=auth.uid()$$,'23503',null,'unknown stable IDs rejected by database');
select lives_ok($$update public.user_profiles set neighbourhood_id=null where id=auth.uid()$$,'owner can clear neighbourhood');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004202',true);
update public.user_profiles set neighbourhood_id='clementi' where id='00000000-0000-4000-8000-000000004201';
select is((select count(*) from public.list_my_community_photos()),1::bigint,'account switch returns only new owner photos');
select is_empty($$select * from public.list_my_community_photos(current_setting('test.photo_cursor')::jsonb)$$,'old cursor never leaks previous account photos');
reset role;
select is((select neighbourhood_id from public.user_profiles where id='00000000-0000-4000-8000-000000004201'),null::text,'foreign update cannot change neighbourhood');
update public.community_posts set moderation_hidden_at=now() where id='00000000-0000-4000-8000-000000004210';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004201',true);
select is_empty($$select * from public.list_my_community_photos()$$,'owner does not bypass moderation');
reset role;
update public.community_posts set moderation_hidden_at=null,deleted_at=now() where id='00000000-0000-4000-8000-000000004210';
set local role authenticated;
select is_empty($$select * from public.list_my_community_photos()$$,'deleted post media removed from album');
select lives_ok($$select * from public.list_my_community_photos(current_setting('test.photo_cursor')::jsonb)$$,'deleted boundary does not break continuation');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select * from public.list_my_community_photos()$$,'42501','authentication_required','missing owner rejected');
reset role;
set local role anon;
select throws_ok($$select * from public.list_my_community_photos()$$,'42501',null,'anonymous album denied');
reset role;
select * from finish();
rollback;
