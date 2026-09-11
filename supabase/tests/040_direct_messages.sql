begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','get_community_author',array['text','uuid'],'visible content author projection exists');
select has_function('public','create_direct_message_request',array['text','uuid','text','uuid'],'anchored DM request exists');
select has_function('public','respond_direct_message_request',array['uuid','boolean','uuid'],'DM request response exists');
select has_function('public','list_my_direct_conversations',array['uuid','integer'],'conversation list exists');
select has_function('public','list_direct_messages',array['uuid','uuid','integer'],'message list exists');
select has_function('public','send_direct_message',array['uuid','text','uuid'],'DM sender exists');
select has_function('public','get_direct_conversation',array['uuid'],'single conversation reader exists');
select has_function('public','mark_direct_conversation_read',array['uuid','uuid'],'anchored DM read marker exists');
select has_function('public','block_direct_conversation',array['uuid','uuid'],'conversation blocker exists');

set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000004001','DM sender',now()),
 ('00000000-0000-4000-8000-000000004002','DM recipient',now()),
 ('00000000-0000-4000-8000-000000004003','DM stranger',now());
set local session_replication_role=origin;
insert into public.community_posts(id,author_id,body,community_slug) values
 ('00000000-0000-4000-8000-000000004010','00000000-0000-4000-8000-000000004002','Messageable post','dm-test');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004001',true);
select is((select author->>'name' from public.get_community_author('community_post','00000000-0000-4000-8000-000000004010')),'DM recipient','content anchor projects author without an ID');
select ok((select "canMessage" from public.get_community_author('community_post','00000000-0000-4000-8000-000000004010')),'visible other author is messageable');
select set_config('test.dm_conversation',(select "conversationId"::text from public.create_direct_message_request('community_post','00000000-0000-4000-8000-000000004010','Hello there','00000000-0000-4000-8000-000000004011')),true);
select set_config('test.dm_message',(select "messageId"::text from public.create_direct_message_request('community_post','00000000-0000-4000-8000-000000004010','Hello there','00000000-0000-4000-8000-000000004011')),true);
select is((select "conversationId" from public.get_community_author('community_post','00000000-0000-4000-8000-000000004010')),current_setting('test.dm_conversation')::uuid,'author projection returns the existing conversation route');
select is((select "canMessage" from public.get_community_author('community_post','00000000-0000-4000-8000-000000004010')),false,'existing conversation suppresses another first-contact request');
select throws_ok($$select * from public.create_direct_message_request('community_post','00000000-0000-4000-8000-000000004010','Changed','00000000-0000-4000-8000-000000004011')$$,'P0001','idempotency_conflict','request ID rejects changed body');
select throws_ok($$select * from public.send_direct_message(current_setting('test.dm_conversation')::uuid,'Too early','00000000-0000-4000-8000-000000004012')$$,'P0001','direct_message_not_available','pending request cannot send a second message');
reset role;
select is((select count(*) from private.direct_messages where conversation_id=current_setting('test.dm_conversation')::uuid),1::bigint,'request retry creates one opening message');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004003',true);
select throws_ok($$select * from public.respond_direct_message_request(current_setting('test.dm_conversation')::uuid,true,'00000000-0000-4000-8000-000000004013')$$,'P0001','direct_message_request_not_available','third party cannot accept a request');
select throws_ok($$select * from public.list_direct_messages(current_setting('test.dm_conversation')::uuid,null,50)$$,'P0001','direct_message_not_available','third party cannot list messages');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004002',true);
select is((select status from public.respond_direct_message_request(current_setting('test.dm_conversation')::uuid,true,'00000000-0000-4000-8000-000000004014')),'accepted','recipient accepts request');
select set_config('test.dm_accepted_at',(select "updatedAt"::text from public.respond_direct_message_request(current_setting('test.dm_conversation')::uuid,true,'00000000-0000-4000-8000-000000004014')),true);
select set_config('test.dm_reply',(select "messageId"::text from public.send_direct_message(current_setting('test.dm_conversation')::uuid,'Welcome','00000000-0000-4000-8000-000000004015')),true);
select is((select "requestId" from public.list_direct_messages(current_setting('test.dm_conversation')::uuid,null,50) where "messageId"=current_setting('test.dm_reply')::uuid),'00000000-0000-4000-8000-000000004015','own request ID supports outbox reconciliation');
select is((select count(*) from public.mark_direct_conversation_read(current_setting('test.dm_conversation')::uuid,current_setting('test.dm_reply')::uuid)),1::bigint,'member advances read cursor from a message anchor');
reset role;
update private.direct_conversations set updated_at=now()+interval '1 day' where id=current_setting('test.dm_conversation')::uuid;
set local role authenticated;
select is((select "updatedAt" from public.respond_direct_message_request(current_setting('test.dm_conversation')::uuid,true,'00000000-0000-4000-8000-000000004014')),current_setting('test.dm_accepted_at')::timestamptz,'response retry preserves timestamp after later conversation activity');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004001',true);
select is((select status from public.create_direct_message_request('community_post','00000000-0000-4000-8000-000000004010','Hello there','00000000-0000-4000-8000-000000004011')),'pending','opening-request retry preserves its original pending result after acceptance');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004001',true);
select is((select "requestId" is null from public.list_direct_messages(current_setting('test.dm_conversation')::uuid,null,50) where "messageId"=current_setting('test.dm_reply')::uuid),true,'other member request IDs remain private');
select lives_ok($$select public.block_direct_conversation(current_setting('test.dm_conversation')::uuid,'00000000-0000-4000-8000-000000004016')$$,'member can block through conversation');
select is_empty($$select * from public.get_direct_conversation(current_setting('test.dm_conversation')::uuid)$$,'block makes conversation inaccessible');
select throws_ok($$select * from public.send_direct_message(current_setting('test.dm_conversation')::uuid,'After block','00000000-0000-4000-8000-000000004017')$$,'P0001','direct_message_not_available','blocked sender cannot create another message');
select throws_ok($$select * from public.create_direct_message_request('community_post','00000000-0000-4000-8000-000000004010','Hello there','00000000-0000-4000-8000-000000004011')$$,'P0001','direct_message_target_not_available','blocked request replay does not disclose the old result');
reset role;
select is((select count(*) from private.direct_conversations where id=current_setting('test.dm_conversation')::uuid),1::bigint,'block does not retain a client-visible route');
select lives_ok($$delete from public.user_profiles where id='00000000-0000-4000-8000-000000004002'$$,'account erasure purges recipient conversations');
select is((select count(*) from private.direct_conversations where id=current_setting('test.dm_conversation')::uuid),0::bigint,'erasure cascades conversation deletion');

select * from finish();
rollback;
