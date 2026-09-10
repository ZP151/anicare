begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','list_my_community_activity',array['uuid','integer'],'activity inbox reader exists');
select has_function('public','mark_community_activity_read',array['uuid[]'],'activity read marker exists');

set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000003801','Post owner',now()),
 ('00000000-0000-4000-8000-000000003802','Reply actor',now()),
 ('00000000-0000-4000-8000-000000003803','Other owner',now());
set local session_replication_role=origin;
insert into public.community_posts(id,author_id,body,community_slug) values('00000000-0000-4000-8000-000000003810','00000000-0000-4000-8000-000000003801','Activity target','clementi');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003802',true);
select set_config('test.activity_reply',(select public.create_community_reply('00000000-0000-4000-8000-000000003810','A real reply','00000000-0000-4000-8000-000000003811')::text),true);
select * from public.set_community_post_like('00000000-0000-4000-8000-000000003810',true);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003801',true);
select is((select count(*) from public.list_my_community_activity(null,20)),2::bigint,'other users create one comment and one like event');
select is((select array_agg(kind order by kind) from (select kind from public.list_my_community_activity(null,20)) activity),array['comment','like']::text[],'inbox has only real interaction kinds');
select is((select actor->>'name' from public.list_my_community_activity(null,20) where kind='comment'),'Reply actor','actor summary contains only public identity');
select set_config('test.activity_event',(select "eventId"::text from public.list_my_community_activity(null,20) where kind='comment'),true);
select set_config('test.activity_cursor',(select cursor::text from public.list_my_community_activity(null,20) where kind='comment'),true);
select is((select count(*) from public.mark_community_activity_read(array[current_setting('test.activity_event')::uuid])),1::bigint,'recipient marks own event read');
select ok((select "readAt" is not null from public.list_my_community_activity(null,20) where "eventId"=current_setting('test.activity_event')::uuid),'read marker persists for recipient');
select public.create_community_reply('00000000-0000-4000-8000-000000003810','Self reply','00000000-0000-4000-8000-000000003812');
select is((select count(*) from public.list_my_community_activity(null,20)),2::bigint,'self reply creates no event');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003802',true);
select * from public.set_community_post_like('00000000-0000-4000-8000-000000003810',false);
select is_empty($$select * from public.mark_community_activity_read(array[current_setting('test.activity_event')::uuid])$$,'another account cannot mark owner activity');
select throws_ok($$select * from public.list_my_community_activity(current_setting('test.activity_cursor')::uuid,20)$$,'P0001','invalid_community_activity_cursor','another owner cursor reveals nothing');
select * from public.set_community_post_like('00000000-0000-4000-8000-000000003810',true);
select public.delete_community_content('community_reply',current_setting('test.activity_reply')::uuid,'00000000-0000-4000-8000-000000003814');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003801',true);
select is((select count(*) from public.list_my_community_activity(null,20)),1::bigint,'like replay stays idempotent and deleted reply hides its event');
select public.block_user('00000000-0000-4000-8000-000000003802','00000000-0000-4000-8000-000000003813');
select is_empty($$select * from public.list_my_community_activity(null,20)$$,'blocked reply actor is hidden from inbox');
reset role;
select lives_ok($$delete from public.user_profiles where id='00000000-0000-4000-8000-000000003802'$$,'account erasure removes actor activity records');
select is((select count(*) from private.community_activity where actor_id='00000000-0000-4000-8000-000000003802'),0::bigint,'account erasure leaves no retained interaction actor');

set local role anon;
select throws_ok($$select * from public.list_my_community_activity(null,20)$$,'42501',null,'anonymous inbox access is denied');
reset role;
select * from finish();
rollback;
