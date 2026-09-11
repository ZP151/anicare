begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','create_community_comment_reply',array['uuid','text','uuid'],'child comment creation exists');
select has_function('public','list_community_comment_replies',array['uuid','uuid','integer'],'child comment list exists');
select has_function('public','get_community_comment_context',array['uuid'],'safe child comment context exists');

set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000004101','Comment post author',now()),
 ('00000000-0000-4000-8000-000000004102','Comment parent author',now()),
 ('00000000-0000-4000-8000-000000004103','Comment child author',now());
set local session_replication_role=origin;
insert into public.community_posts(id,author_id,body,community_slug) values('00000000-0000-4000-8000-000000004110','00000000-0000-4000-8000-000000004101','Comment root','comments-test');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004102',true);
select set_config('test.comment_parent',(select public.create_community_reply('00000000-0000-4000-8000-000000004110','Top comment','00000000-0000-4000-8000-000000004111')::text),true);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004103',true);
select set_config('test.comment_child',(select public.create_community_comment_reply(current_setting('test.comment_parent')::uuid,'A child comment','00000000-0000-4000-8000-000000004112')::text),true);
select is((select count(*) from public.list_community_comment_replies(current_setting('test.comment_parent')::uuid,null,30)),1::bigint,'child reply has a separate list');
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select is((select count(*) from public.list_public_community_replies('00000000-0000-4000-8000-000000004110',null,30)),1::bigint,'existing top-level reply API excludes child replies');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004101',true);
select is((select kind from public.list_my_community_activity(null,20) where "replyId"=current_setting('test.comment_child')::uuid),'comment','child activity maps to the established comment kind');
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select is((select "parentReplyId" from public.get_community_comment_context(current_setting('test.comment_child')::uuid)),current_setting('test.comment_parent')::uuid,'anonymous context is safe for a notification route');
reset role;
update public.community_replies set deleted_at=now() where id=current_setting('test.comment_parent')::uuid;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select throws_ok($$select * from public.list_community_comment_replies(current_setting('test.comment_parent')::uuid,null,30)$$,'P0001','community_reply_not_available','deleted parent hides its children');
reset role;

select * from finish();
rollback;
