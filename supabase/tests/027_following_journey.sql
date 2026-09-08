begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','follow_animal',array['uuid','uuid'],'follow command exists');
select has_function('public','unfollow_animal',array['uuid','uuid'],'unfollow command exists');
select has_function('public','get_my_follow_state',array['uuid'],'owner follow state exists');
select has_function('public','list_my_followed_cats',array['uuid','integer'],'owner followed-cat list exists');
select has_function('public','list_public_cat_discovery',array['text','text[]','uuid','integer'],'server discovery exists');
select ok(not has_table_privilege('authenticated','public.follows','insert, update, delete'),'raw follows writes stay revoked');
select ok(has_function_privilege('authenticated','public.follow_animal(uuid,uuid)','execute'),'authenticated may follow through the narrow command');
select ok(has_function_privilege('anon','public.list_public_cat_discovery(text,text[],uuid,integer)','execute'),'anonymous discovery projection is read-only');
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000002701','Follow owner',now()),('00000000-0000-4000-8000-000000002702','Follow viewer',now());
insert into public.animals(id,primary_alias,visibility,verification) values
 ('00000000-0000-4000-8000-000000002710','Followable cat','public','reported'),
 ('00000000-0000-4000-8000-000000002711','Hidden cat','hidden','reported');
insert into public.sightings(id,animal_id,reporter_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,client_dedupe_key) values
 ('00000000-0000-4000-8000-000000002720','00000000-0000-4000-8000-000000002710','00000000-0000-4000-8000-000000002701',now()-interval '4 hours','89652636d87ffff','morning','normal','public',now()-interval '3 hours','{}','follow-source');
set local session_replication_role=origin;
set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002701',true);
select lives_ok($$select * from public.follow_animal('00000000-0000-4000-8000-000000002710','00000000-0000-4000-8000-000000002731')$$,'owner follows an eligible cat');
select is((select count(*) from public.follow_animal('00000000-0000-4000-8000-000000002710','00000000-0000-4000-8000-000000002731')),1::bigint,'lost-response replay returns one result');
select throws_ok($$select * from public.follow_animal('00000000-0000-4000-8000-000000002711','00000000-0000-4000-8000-000000002731')$$,'P0001','idempotency_conflict','same request cannot target another cat');
select is((select following from public.get_my_follow_state('00000000-0000-4000-8000-000000002710')),true,'owner reads current follow state');
select is((select count(*) from public.list_my_followed_cats(null,20)),1::bigint,'owner reopens followed public cat');
select lives_ok($$select * from public.unfollow_animal('00000000-0000-4000-8000-000000002710','00000000-0000-4000-8000-000000002732')$$,'owner unfollows');
select is((select count(*) from public.list_my_followed_cats(null,20)),0::bigint,'unfollow removes private list entry');
select throws_ok($$select * from public.follow_animal('00000000-0000-4000-8000-000000002711','00000000-0000-4000-8000-000000002733')$$,'P0001','follow_animal_not_available','hidden cat cannot be followed');
reset role;
select is((select count(*) from public.list_public_cat_discovery('89652636d87ffff',array['reported'],null,20)),1::bigint,'discovery applies server-side cell and verification filters');
-- C06 includes reopening the target and reading M2 history through the same cat ID.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002702',true);
select is((select count(*) from public.list_my_followed_cats(null,20)),0::bigint,'other owner never sees private follows');
select lives_ok($$select * from public.record_completed_care('00000000-0000-4000-8000-000000002710','water',now()-interval '4 hours','89652636d87ffff','00000000-0000-4000-8000-000000002740')$$,'second contributor records care');
reset role;
update public.care_events set visible_at=now()-interval '1 hour' where actor_id='00000000-0000-4000-8000-000000002702';
set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002701',true);
select lives_ok($$select * from public.follow_animal('00000000-0000-4000-8000-000000002710','00000000-0000-4000-8000-000000002741')$$,'owner follows again with new operation');
select is((select count(*) from public.list_public_care_history((select "animalId" from public.list_my_followed_cats(null,20)),null,20)),1::bigint,'followed cat reopens M2 history');
select throws_ok($$select * from public.follow_animal(null,'00000000-0000-4000-8000-000000002742')$$,'22023','invalid_follow_request','null target rejected');
select throws_ok($$select * from public.list_public_cat_discovery(null,array[null]::text[],null,20)$$,'22023','invalid_discovery_filter','null filter element rejected');
select throws_ok($$select * from public.unfollow_animal('00000000-0000-4000-8000-000000002711','00000000-0000-4000-8000-000000002743')$$,'P0001','follow_animal_not_available','hidden unknown target cannot be probed by unfollow');
reset role;
insert into public.animals(id,primary_alias,visibility,verification) values
 ('00000000-0000-4000-8000-000000002712','Second cat','public','community_confirmed');
set local session_replication_role=replica;
insert into public.sightings(id,animal_id,reporter_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,client_dedupe_key) values
 ('00000000-0000-4000-8000-000000002721','00000000-0000-4000-8000-000000002712','00000000-0000-4000-8000-000000002702',now()-interval '5 hours','896520ca163ffff','morning','normal','public',now()-interval '4 hours','{}','follow-source2'),
 ('00000000-0000-4000-8000-000000002722','00000000-0000-4000-8000-000000002710','00000000-0000-4000-8000-000000002702',now()-interval '5 hours','89652636d87ffff','morning','normal','public',now()-interval '4 hours','{}','follow-duplicate');
set local session_replication_role=origin;
set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002701',true);
select is((select count(*) from public.list_public_cat_discovery(null,null,null,20)),2::bigint,'multiple sightings of one cat are deduplicated before paging');
select is((select count(*) from public.list_public_cat_discovery(null,null,(select cursor from public.list_public_cat_discovery(null,null,null,1)),1)),1::bigint,'next discovery page reaches second distinct cat');
select throws_ok($$select * from public.list_public_cat_discovery('89652636d87ffff',null,'00000000-0000-4000-8000-000000002721',20)$$,'P0001','invalid_discovery_cursor','cursor from another region rejected');
select lives_ok($$select * from public.follow_animal('00000000-0000-4000-8000-000000002712','00000000-0000-4000-8000-000000002744')$$,'second cat followed');
select is((select count(*) from public.list_my_followed_cats((select cursor from public.list_my_followed_cats(null,1)),1)),1::bigint,'following keyset reaches second row');
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000002701','00000000-0000-4000-8000-000000002702');
set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002701',true);
select is((select count(*) from public.list_my_followed_cats(null,20)),2::bigint,'blocked activity does not erase otherwise public empty cat profiles from owner follows');
select is((select "timeBucket" from public.list_my_followed_cats(null,20) where "animalId"='00000000-0000-4000-8000-000000002712'),null,'blocked-only activity stays empty');
select throws_ok($$select * from public.list_public_cat_discovery(null,null,'00000000-0000-4000-8000-000000002721',20)$$,'P0001','invalid_discovery_cursor','blocked source cannot serve as discovery cursor');
reset role;
update public.animals set visibility='hidden' where id='00000000-0000-4000-8000-000000002710';
set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002701',true);
select is((select count(*) from public.list_my_followed_cats(null,20) where "animalId"='00000000-0000-4000-8000-000000002710'),0::bigint,'hidden followed target is suppressed');
select lives_ok($$select * from public.unfollow_animal('00000000-0000-4000-8000-000000002710','00000000-0000-4000-8000-000000002745')$$,'hidden target can still be unfollowed by actual owner');
reset role;
delete from public.sightings where animal_id='00000000-0000-4000-8000-000000002712';
delete from public.animals where id='00000000-0000-4000-8000-000000002712';
set local role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002701',true);
select throws_ok($$select * from public.follow_animal('00000000-0000-4000-8000-000000002712','00000000-0000-4000-8000-000000002744')$$,'P0001','follow_animal_not_available','deleted target replay never resurrects a follow');
reset role;
select * from finish(); rollback;
