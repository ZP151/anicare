begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','list_public_cat_stories',array['uuid','jsonb','integer']);
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000004501','Story author A',now()),
 ('00000000-0000-4000-8000-000000004502','Story author B',now()),
 ('00000000-0000-4000-8000-000000004503','Reader',now());
set local session_replication_role=origin;
insert into public.animals(id,primary_alias,visibility) values
 ('00000000-0000-4000-8000-000000004511','Shared cat','public'),
 ('00000000-0000-4000-8000-000000004512','Other cat','public');
insert into public.community_posts(id,author_id,cat_id,body,created_at) values
 ('00000000-0000-4000-8000-000000004521','00000000-0000-4000-8000-000000004501','00000000-0000-4000-8000-000000004511','Older story','2026-09-12T10:00:00Z'),
 ('00000000-0000-4000-8000-000000004522','00000000-0000-4000-8000-000000004502','00000000-0000-4000-8000-000000004511','Another author, equal timestamp','2026-09-12T10:00:00Z'),
 ('00000000-0000-4000-8000-000000004523','00000000-0000-4000-8000-000000004501','00000000-0000-4000-8000-000000004512','Different cat','2026-09-12T11:00:00Z');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is(jsonb_array_length(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')->'items'),2,'two authors appear under the same cat only');
select is(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511',null,1)#>>'{items,0,postId}','00000000-0000-4000-8000-000000004522','equal time uses descending UUID');
select set_config('test.story_cursor',(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511',null,1)->'nextCursor')::text,true);
select is(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')#>'{items,0,media}','[]'::jsonb,'text-only stories remain readable');
select is((select array_agg(k order by k) from jsonb_object_keys(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')#>'{items,0}') k),array['author','body','canEditLink','catId','communitySlug','media','postId','publishedAt','replyCount','title']::text[],'only public story fields');
select throws_ok($$select public.list_public_cat_stories('00000000-0000-4000-8000-000000004511','{"v":1}')$$,'22023','invalid_cat_story_request','malformed cursor denied');
select throws_ok($$select public.list_public_cat_stories('00000000-0000-4000-8000-000000004512',current_setting('test.story_cursor')::jsonb)$$,'22023','invalid_cat_story_request','cross-cat cursor denied');
select throws_ok($$select public.list_public_cat_stories('00000000-0000-4000-8000-000000004511',null,31)$$,'22023','invalid_cat_story_request','page bounded');
select throws_ok($$select public.list_public_cat_stories('00000000-0000-4000-8000-000000004599')$$,'P0001','cat_unavailable','missing cat unavailable');
reset role;
delete from public.community_posts where id='00000000-0000-4000-8000-000000004522';
insert into private.community_media_jobs(id,owner_id,request_id,payload_hash,thumb_sha256,thumb_byte_length,thumb_width,thumb_height,display_sha256,display_byte_length,display_width,display_height,reservation_expires_at,upload_token_expires_at,status)
select media_id::uuid,'00000000-0000-4000-8000-000000004501',request_id::uuid,repeat('a',64),repeat('b',64),100,100,100,repeat('c',64),1000,640,480,now()+interval '10 minutes',now()+interval '2 hours',case when n<3 then 'attached' else 'finalized' end
from (values
 (1,'00000000-0000-4000-8000-000000004541','00000000-0000-4000-8000-000000004551'),
 (2,'00000000-0000-4000-8000-000000004542','00000000-0000-4000-8000-000000004552'),
 (3,'00000000-0000-4000-8000-000000004543','00000000-0000-4000-8000-000000004553')
) fixtures(n,media_id,request_id);
insert into private.community_post_media(post_id,media_id,position) values
 ('00000000-0000-4000-8000-000000004521','00000000-0000-4000-8000-000000004541',1),
 ('00000000-0000-4000-8000-000000004521','00000000-0000-4000-8000-000000004542',0),
 ('00000000-0000-4000-8000-000000004521','00000000-0000-4000-8000-000000004543',2);
insert into public.community_replies(id,post_id,author_id,body) values
 ('00000000-0000-4000-8000-000000004531','00000000-0000-4000-8000-000000004521','00000000-0000-4000-8000-000000004502','Parent');
insert into public.community_replies(id,post_id,parent_reply_id,author_id,body) values
 ('00000000-0000-4000-8000-000000004532','00000000-0000-4000-8000-000000004521','00000000-0000-4000-8000-000000004531','00000000-0000-4000-8000-000000004501','Child');
update public.community_replies set moderation_hidden_at=now() where id='00000000-0000-4000-8000-000000004531';
set local role anon;
select is(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')#>'{items,0,media}','[{"mediaId":"00000000-0000-4000-8000-000000004542","width":640,"height":480},{"mediaId":"00000000-0000-4000-8000-000000004541","width":640,"height":480}]'::jsonb,'only attached public media, ordered without private paths');
select throws_ok($$select * from private.community_post_media$$,'42501',null,'anonymous cannot read private attachment table');
select ok(has_function_privilege('anon','public.list_public_cat_stories(uuid,jsonb,integer)','EXECUTE'),'anonymous can call public projection');
select ok(has_function_privilege('authenticated','public.list_public_cat_stories(uuid,jsonb,integer)','EXECUTE'),'signed-in can call public projection');
select throws_ok(format('select public.list_public_cat_stories(%L::uuid,%L::jsonb)','00000000-0000-4000-8000-000000004511',(current_setting('test.story_cursor')::jsonb||'{"extra":true}'::jsonb)::text),'22023','invalid_cat_story_request','extra cursor field denied');
select throws_ok(format('select public.list_public_cat_stories(%L::uuid,%L::jsonb)','00000000-0000-4000-8000-000000004511',(current_setting('test.story_cursor')::jsonb||'{"createdAt":"infinity"}'::jsonb)::text),'22023','invalid_cat_story_request','non-finite timestamp denied');
select throws_ok(format('select public.list_public_cat_stories(%L::uuid,%L::jsonb)','00000000-0000-4000-8000-000000004511',(current_setting('test.story_cursor')::jsonb||'{"postId":"bad"}'::jsonb)::text),'22023','invalid_cat_story_request','bad UUID denied');
select throws_ok(format('select public.list_public_cat_stories(%L::uuid,%L::jsonb)','00000000-0000-4000-8000-000000004511',(current_setting('test.story_cursor')::jsonb||'{"v":2}'::jsonb)::text),'22023','invalid_cat_story_request','unknown cursor version denied');
select throws_ok(format('select public.list_public_cat_stories(%L::uuid,%L::jsonb)','00000000-0000-4000-8000-000000004511',(current_setting('test.story_cursor')::jsonb||'{"catId":"{00000000-0000-4000-8000-000000004511}"}'::jsonb)::text),'22023','invalid_cat_story_request','noncanonical cursor cat UUID denied');
select is(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')#>>'{items,0,replyCount}','0','hidden parent also excludes surviving child from counts');
select is(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511',current_setting('test.story_cursor')::jsonb,1)#>>'{items,0,postId}','00000000-0000-4000-8000-000000004521','deleted anchor does not break continuation');
select is(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511',current_setting('test.story_cursor')::jsonb,1)->'nextCursor','null'::jsonb,'last page has no continuation');
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000004503','00000000-0000-4000-8000-000000004501');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004503',true);
select is(jsonb_array_length(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')->'items'),0,'reader block hides author');
reset role;
delete from public.user_blocks where blocker_id='00000000-0000-4000-8000-000000004503';
insert into public.user_blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000004501','00000000-0000-4000-8000-000000004503');
set local role authenticated;
select is(jsonb_array_length(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')->'items'),0,'author block hides author');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.community_posts set moderation_hidden_at=now() where id='00000000-0000-4000-8000-000000004521';
set local role anon;
select is(jsonb_array_length(public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')->'items'),0,'hidden story excluded');
reset role;
update public.animals set archived_at=now() where id='00000000-0000-4000-8000-000000004511';
set local role anon;
select throws_ok($$select public.list_public_cat_stories('00000000-0000-4000-8000-000000004511')$$,'P0001','cat_unavailable','hidden cat and missing cat share error');
reset role;
select * from finish();
rollback;
