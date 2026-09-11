begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','create_community_comment_reply',array['uuid','text','uuid'],'child comment creation exists');
select has_function('public','list_community_comment_replies',array['uuid','uuid','integer'],'child comment list exists');
select has_function('public','get_community_comment_context',array['uuid'],'safe child comment context exists');

set local session_replication_role=replica;
insert into auth.users(id,email,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000004103','child-avatar@example.test',now(),now());
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
select is((select "replyCount" from public.get_public_community_post('00000000-0000-4000-8000-000000004110')),0,'deleted parent and child do not leak through detail count');
select is((select "replyCount" from public.list_public_community_posts(null,20,'comments-test',null) where "postId"='00000000-0000-4000-8000-000000004110'),0,'deleted parent and child do not leak through feed count');
select is_empty($$select * from public.get_community_comment_context(current_setting('test.comment_child')::uuid)$$,'deleted parent hides child notification context');
reset role;

select * from public.reserve_profile_avatar_upload('00000000-0000-4000-8000-000000004103',repeat('b',64),1024,128,128);
select set_config('test.comment_avatar_job',(select id::text from private.profile_avatar_upload_jobs where owner_id='00000000-0000-4000-8000-000000004103'),true);
select set_config('test.comment_avatar_path',(select object_path from private.profile_avatar_upload_jobs where owner_id='00000000-0000-4000-8000-000000004103'),true);
select public.finalize_profile_avatar_upload('00000000-0000-4000-8000-000000004103',current_setting('test.comment_avatar_job')::uuid);
select is(private.can_read_profile_avatar('profile-avatars',current_setting('test.comment_avatar_path'),null),false,'hidden child cannot authorize avatar storage access');
select is_empty($$select * from public.get_public_community_avatars('community_reply',array[current_setting('test.comment_child')::uuid])$$,'hidden child does not project an avatar path');
update public.community_replies set deleted_at=null,moderation_hidden_at=now() where id=current_setting('test.comment_parent')::uuid;
select is(private.can_read_profile_avatar('profile-avatars',current_setting('test.comment_avatar_path'),null),false,'moderated parent also hides child avatar access');

select * from finish();
rollback;
