begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000003101','Author',now()),
 ('00000000-0000-4000-8000-000000003102','Reader',now()),
 ('00000000-0000-4000-8000-000000003103','Reply author',now()),
 ('00000000-0000-4000-8000-000000003104','Moderator',now()),
 ('00000000-0000-4000-8000-000000003105','Reporter one',now()),
 ('00000000-0000-4000-8000-000000003106','Reporter two',now()),
 ('00000000-0000-4000-8000-000000003107','Erased author',now());
set local session_replication_role = origin;
insert into public.role_grants(user_id,role) values ('00000000-0000-4000-8000-000000003104','platform_admin');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003101',true);
select throws_ok($$select public.create_community_post('Unavailable cat', '00000000-0000-4000-8000-000000003999', null, '00000000-0000-4000-8000-000000003200')$$,'P0001','community_cat_not_available','unavailable cat scope is rejected');
select lives_ok($$select public.create_community_post('First body',null,'harbor-cats','00000000-0000-4000-8000-000000003201')$$,'author creates post');
select throws_ok($$select public.create_community_post('Changed body',null,'harbor-cats','00000000-0000-4000-8000-000000003201')$$,'P0001','idempotency_conflict','post retry rejects changed body');
select throws_ok($$select public.create_community_post('First body',null,'different-community','00000000-0000-4000-8000-000000003201')$$,'P0001','idempotency_conflict','post retry rejects changed community');
reset role;
select is((select count(*) from public.community_posts where author_id='00000000-0000-4000-8000-000000003101'),1::bigint,'matching post retry creates one row');
select set_config('test.post_id',(select id::text from public.community_posts where author_id='00000000-0000-4000-8000-000000003101'),true);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003103',true);
select lives_ok($$select public.create_community_reply(current_setting('test.post_id')::uuid,'First reply','00000000-0000-4000-8000-000000003202')$$,'author creates reply');
select throws_ok($$select public.create_community_reply(current_setting('test.post_id')::uuid,'Changed reply','00000000-0000-4000-8000-000000003202')$$,'P0001','idempotency_conflict','reply retry rejects changed body');
reset role;
select set_config('test.reply_id',(select id::text from public.community_replies where post_id=current_setting('test.post_id')::uuid),true);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003101',true);
select set_config('test.delete_post_id',public.create_community_post('Disposable',null,'harbor-cats','00000000-0000-4000-8000-000000003209')::text,true);
select lives_ok($$select public.delete_community_content('community_post',current_setting('test.delete_post_id')::uuid,'00000000-0000-4000-8000-000000003210')$$,'owner can delete a post');
select lives_ok($$select public.delete_community_content('community_post',current_setting('test.delete_post_id')::uuid,'00000000-0000-4000-8000-000000003210')$$,'matching delete double-click is idempotent');
reset role;
select is_empty($$select * from public.get_public_community_post(current_setting('test.delete_post_id')::uuid)$$,'deleted post is not publicly retrievable');

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select is((select array_agg(key order by key) from jsonb_object_keys((select to_jsonb(x) from public.get_public_community_post(current_setting('test.post_id')::uuid) x)) key),array['author','body','canDelete','catId','communitySlug','createdAt','cursor','postId','replyCount']::text[],'by-ID post has feed row shape');
select is((select array_agg(key order by key) from jsonb_object_keys((select to_jsonb(x) from public.list_public_community_replies(current_setting('test.post_id')::uuid,null,30) x)) key),array['author','body','canDelete','createdAt','cursor','replyId']::text[],'reply has safe delete flag');
select is((select count(*) from public.list_public_community_replies(current_setting('test.post_id')::uuid,null,30)),1::bigint,'anon sees reply');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003102',true);
select is((select "canDelete" from public.get_public_community_post(current_setting('test.post_id')::uuid)),false,'non-owner cannot delete post');
select is((select "canDelete" from public.list_public_community_replies(current_setting('test.post_id')::uuid,null,30)),false,'non-owner cannot delete reply');
select lives_ok($$select public.block_community_author('community_post',current_setting('test.post_id')::uuid,'00000000-0000-4000-8000-000000003203')$$,'reader blocks post author');
select lives_ok($$select public.block_community_author('community_post',current_setting('test.post_id')::uuid,'00000000-0000-4000-8000-000000003203')$$,'block retry survives target becoming unavailable');
select throws_ok($$select * from public.list_public_community_replies(current_setting('test.post_id')::uuid,null,30)$$,'P0001','community_post_not_available','blocked parent denies reply access');
reset role;
delete from public.user_blocks where blocker_id='00000000-0000-4000-8000-000000003102';
insert into public.user_blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000003101','00000000-0000-4000-8000-000000003102');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003102',true);
select is_empty($$select * from public.get_public_community_post(current_setting('test.post_id')::uuid)$$,'reverse block hides parent');
select throws_ok($$select public.create_community_reply(current_setting('test.post_id')::uuid,'Blocked parent reply','00000000-0000-4000-8000-000000003204')$$,'P0001','community_post_not_available','blocked parent cannot receive reply');
reset role;
delete from public.user_blocks where blocker_id='00000000-0000-4000-8000-000000003101';

update public.community_replies set moderation_hidden_at=now() where id=current_setting('test.reply_id')::uuid;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select is((select "replyCount" from public.get_public_community_post(current_setting('test.post_id')::uuid)),0,'held reply excluded from count');
select is_empty($$select * from public.list_public_community_replies(current_setting('test.post_id')::uuid,null,30)$$,'held reply excluded from feed');
reset role;

update public.community_replies set moderation_hidden_at=null where id=current_setting('test.reply_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003105',true);
select lives_ok($$select public.create_community_moderation_report('community_reply',current_setting('test.reply_id')::uuid,'animal_in_immediate_danger','Immediate welfare concern.','00000000-0000-4000-8000-000000003205')$$,'first critical report hides reply');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003106',true);
select lives_ok($$select public.create_community_moderation_report('community_reply',current_setting('test.reply_id')::uuid,'animal_in_immediate_danger','Second welfare concern.','00000000-0000-4000-8000-000000003206')$$,'second critical report adds hold');
reset role;
select set_config('test.report_one',(select id::text from public.moderation_reports where request_id='00000000-0000-4000-8000-000000003205'),true);
select set_config('test.report_two',(select id::text from public.moderation_reports where request_id='00000000-0000-4000-8000-000000003206'),true);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003104',true);
select lives_ok($$select * from public.admin_resolve_community_moderation_report(current_setting('test.report_one')::uuid,'no_action','The first report has insufficient evidence.','00000000-0000-4000-8000-000000003207')$$,'admin resolves one critical report');
reset role;
select ok((select moderation_hidden_at is not null from public.community_replies where id=current_setting('test.reply_id')::uuid),'unresolved critical report keeps reply hidden');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003104',true);
select lives_ok($$select * from public.admin_resolve_community_moderation_report(current_setting('test.report_two')::uuid,'no_action','The second report has insufficient evidence.','00000000-0000-4000-8000-000000003208')$$,'admin resolves final critical report');
reset role;
select ok((select moderation_hidden_at is null from public.community_replies where id=current_setting('test.reply_id')::uuid),'final hold release restores visible reply');

insert into public.community_posts(author_id,body,community_slug) values('00000000-0000-4000-8000-000000003107','Erasure post','harbor-cats');
select lives_ok($$delete from public.user_profiles where id='00000000-0000-4000-8000-000000003107'$$,'community-only profile erasure succeeds');
select ok((select author_id is null from public.community_posts where body='Erasure post'),'erasure nulls post author');
select is((select author->>'avatarKey' from public.list_public_community_posts(null,20,'harbor-cats',null) where body='Erasure post'),'cat','erased author has default avatar');

select * from finish();
rollback;
