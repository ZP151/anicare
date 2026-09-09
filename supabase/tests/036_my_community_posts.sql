begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000003601','Owner',now()),
 ('00000000-0000-4000-8000-000000003602','Other',now());
set local session_replication_role=origin;
insert into public.community_posts(id,author_id,body,community_slug,created_at) values
 ('00000000-0000-4000-8000-000000003610','00000000-0000-4000-8000-000000003601','Older own post','clementi','2026-09-08T00:00:00Z'),
 ('00000000-0000-4000-8000-000000003611','00000000-0000-4000-8000-000000003601','Newest own post','clementi','2026-09-09T00:00:00Z'),
 ('00000000-0000-4000-8000-000000003612','00000000-0000-4000-8000-000000003602','Someone else','clementi','2026-09-10T00:00:00Z');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003601',true);
select is((select count(*) from public.list_my_community_posts()),2::bigint,'only own posts');
select is((select body from public.list_my_community_posts(null,1)),'Newest own post','newest first and bounded page');
select is((select body from public.list_my_community_posts('00000000-0000-4000-8000-000000003611',1)),'Older own post','cursor reaches older own posts');
select ok((select bool_and("canDelete") from public.list_my_community_posts()),'own items can be managed');
select throws_ok($$select * from public.list_my_community_posts('00000000-0000-4000-8000-000000003612')$$,'P0001','invalid_community_cursor','foreign cursor rejected');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003602',true);
select is((select count(*) from public.list_my_community_posts()),1::bigint,'account switch changes collection');
select throws_ok($$select * from public.list_my_community_posts('00000000-0000-4000-8000-000000003611')$$,'P0001','invalid_community_cursor','prior account cursor rejected');
reset role;
update public.community_posts set moderation_hidden_at=now() where id='00000000-0000-4000-8000-000000003611';
update public.community_posts set deleted_at=now() where id='00000000-0000-4000-8000-000000003610';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003601',true);
select is_empty($$select * from public.list_my_community_posts()$$,'deleted and hidden content stays unavailable');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select * from public.list_my_community_posts()$$,'42501','authentication_required','missing subject rejected');
reset role;
set local role anon;
select throws_ok($$select * from public.list_my_community_posts()$$,'42501',null,'anonymous execution denied');
reset role;
select * from finish();
rollback;
