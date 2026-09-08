begin;

create extension if not exists pgtap with schema extensions;
select plan(51);

select has_function('public', 'record_completed_care', array['uuid','text','timestamp with time zone','text','uuid'], 'completed-care command exists');
select has_function('public', 'list_public_care_history', array['uuid','uuid','integer'], 'public delayed care history exists');
select has_function('public', 'list_my_care_events', array['integer','timestamp with time zone','uuid'], 'owner care list exists');
select has_function('public', 'withdraw_care_event', array['uuid','uuid'], 'owner withdrawal command exists');
select has_function('public', 'correct_care_event', array['uuid','text','timestamp with time zone','text','uuid'], 'owner correction command exists');
select ok(not has_function_privilege('anon', 'public.record_completed_care(uuid,text,timestamptz,text,uuid)', 'execute'), 'anonymous callers cannot record care');
select ok(has_function_privilege('authenticated', 'public.record_completed_care(uuid,text,timestamptz,text,uuid)', 'execute'), 'authenticated callers can record care');
select ok(not has_table_privilege('authenticated', 'public.care_events', 'insert, update, delete'), 'raw care mutations remain revoked');

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000002601', 'Care owner', pg_catalog.now()),
 ('00000000-0000-4000-8000-000000002602', 'Care viewer', pg_catalog.now()),
 ('00000000-0000-4000-8000-000000002603', 'Care minor', null);
insert into public.animals (id, primary_alias, visibility) values
 ('00000000-0000-4000-8000-000000002610', 'Care cat', 'public'),
 ('00000000-0000-4000-8000-000000002611', 'Hidden care cat', 'hidden');
insert into public.sightings (id, animal_id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, visible_at, traits, client_dedupe_key)
 values ('00000000-0000-4000-8000-000000002620','00000000-0000-4000-8000-000000002610','00000000-0000-4000-8000-000000002601',pg_catalog.now()-interval '4 hours','89652636d87ffff','morning','normal','public',pg_catalog.now()-interval '2 hours','{}','care-eligible-source');
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002603',true);
select throws_ok($$select * from public.record_completed_care('00000000-0000-4000-8000-000000002610','feed',pg_catalog.now()-interval '1 hour','89652636d87ffff','00000000-0000-4000-8000-000000002631')$$, 'P0001', 'adult_contributor_required', 'minor cannot record care');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002601',true);
select lives_ok($$select * from public.record_completed_care('00000000-0000-4000-8000-000000002610','feed',pg_catalog.now()-interval '1 hour','89652636d87ffff','00000000-0000-4000-8000-000000002632')$$, 'adult can record an eligible completed care event');
select is((select count(*) from public.record_completed_care('00000000-0000-4000-8000-000000002610','feed',pg_catalog.now()-interval '1 hour','89652636d87ffff','00000000-0000-4000-8000-000000002632')), 1::bigint, 'lost-response retry returns one durable result');
select throws_ok($$select * from public.record_completed_care('00000000-0000-4000-8000-000000002610','water',pg_catalog.now()-interval '1 hour','89652636d87ffff','00000000-0000-4000-8000-000000002632')$$, 'P0001', 'idempotency_conflict', 'same request cannot change payload');
select throws_ok($$select * from public.record_completed_care('00000000-0000-4000-8000-000000002610','feed',pg_catalog.now()+interval '1 hour','89652636d87ffff','00000000-0000-4000-8000-000000002633')$$, '22023', 'invalid_care_completed_at', 'future care cannot be recorded');
select throws_ok($$select * from public.record_completed_care('00000000-0000-4000-8000-000000002611','feed',pg_catalog.now()-interval '1 hour','89652636d87ffff','00000000-0000-4000-8000-000000002634')$$, 'P0001', 'care_animal_not_available', 'hidden cat cannot receive a new public care record');
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)), 0::bigint, 'normal care remains delayed from public history');
select is((select count(*) from public.list_my_care_events(20,null,null)), 1::bigint, 'owner sees own submitted care immediately');
select lives_ok($$select * from public.withdraw_care_event((select "careEventId" from public.list_my_care_events(1,null,null)),'00000000-0000-4000-8000-000000002635')$$, 'owner can withdraw existing care');
select is((select count(*) from public.list_my_care_events(20,null,null) where status='withdrawn'), 1::bigint, 'withdrawal appends an invalidation state without deleting the owner history');
select throws_ok($$select * from public.withdraw_care_event('00000000-0000-4000-8000-000000002632','00000000-0000-4000-8000-000000002636')$$, 'P0001', 'care_event_not_available', 'an owner cannot withdraw another owner event');
select throws_ok($$select * from public.correct_care_event((select "careEventId" from public.list_my_care_events(1,null,null) where status='withdrawn' limit 1),'water',pg_catalog.now()-interval '2 hours','89652636d87ffff','00000000-0000-4000-8000-000000002637')$$, 'P0001', 'care_event_not_available', 'an invalidated fact cannot be corrected again');
reset role;


-- C05: real command -> another viewer -> append correction -> withdrawal.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002601',true);
select set_config('test.m2.first',(select "careEventId"::text from public.record_completed_care('00000000-0000-4000-8000-000000002610','feed',now()-interval '4 hours','89652636d87ffff','00000000-0000-4000-8000-000000002640')),true);
select throws_ok($q$select * from public.record_completed_care('00000000-0000-4000-8000-000000002610',null,now()-interval '1 hour','89652636d87ffff','00000000-0000-4000-8000-000000002641')$q$,'22023','invalid_care_payload','null activity is rejected before mutation');
select throws_ok($q$select * from public.record_completed_care('00000000-0000-4000-8000-000000002610','feed',now()-interval '1 hour',null,'00000000-0000-4000-8000-000000002641')$q$,'22023','invalid_care_payload','null area is rejected');
select throws_ok($q$select * from public.record_completed_care('00000000-0000-4000-8000-000000002610','feed',now()-interval '1 hour','8928308280fffff','00000000-0000-4000-8000-000000002641')$q$,'22023','invalid_care_payload','valid H3 outside the supported care areas is rejected');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002602',true);
select is((select count(*) from public.list_my_care_events(20,null,null)),0::bigint,'viewer cannot see another owner private care history');
select throws_ok($q$select * from public.withdraw_care_event(current_setting('test.m2.first')::uuid,'00000000-0000-4000-8000-000000002642')$q$,'P0001','care_event_not_available','viewer cannot withdraw an actual foreign event');
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),0::bigint,'backdating completed care cannot bypass publication delay');
reset role;
-- Advance only this fixture publication clock; never sleep or reset the database.
update public.care_events set visible_at=now()-interval '1 hour',created_at=now()-interval '3 hours' where id=current_setting('test.m2.first')::uuid;
set local role authenticated;
select is((select activity from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),'feed','C05 second viewer reads eligible completed care');
select is((select count(*) from jsonb_object_keys((select to_jsonb(item) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20) item))),6::bigint,'public care has only six safe fields');
select is((select provenance from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),'reported','completed claim is not implied independently verified');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002601',true);
select throws_ok($q$select * from public.correct_care_event(current_setting('test.m2.first')::uuid,'water',now()+interval '1 hour','89652636d87ffff','00000000-0000-4000-8000-000000002643')$q$,'22023','invalid_care_completed_at','failed correction cannot invalidate the original');
select set_config('test.m2.replacement',(select "replacementCareEventId"::text from public.correct_care_event(current_setting('test.m2.first')::uuid,'water',now()-interval '4 hours','89652636d87ffff','00000000-0000-4000-8000-000000002644')),true);
select is((select "replacementCareEventId"::text from public.correct_care_event(current_setting('test.m2.first')::uuid,'water',now()-interval '4 hours','89652636d87ffff','00000000-0000-4000-8000-000000002644')),current_setting('test.m2.replacement'),'correction replay returns the same replacement');
reset role;
select is((select activity from public.care_events where id=current_setting('test.m2.first')::uuid),'feed','correction never overwrites the original fact');
select is((select count(*) from private.care_event_invalidations where care_event_id=current_setting('test.m2.first')::uuid),1::bigint,'correction appends exactly one invalidation');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002602',true);
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),0::bigint,'old fact disappears immediately and replacement waits its delay');
reset role;
update public.care_events set visible_at=now()-interval '1 hour',created_at=now()-interval '3 hours' where id=current_setting('test.m2.replacement')::uuid;
set local role authenticated;
select is((select activity from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),'water','C05 second viewer now reads the replacement only');
reset role;
update public.sightings set risk='sensitive' where id='00000000-0000-4000-8000-000000002620';
set local role authenticated;
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),0::bigint,'risk upgrade imposes current 24-hour delay');
reset role;
update public.care_events set created_at=now()-interval '25 hours' where id=current_setting('test.m2.replacement')::uuid;
set local role authenticated;
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),1::bigint,'sensitive care becomes readable after current delay');
reset role;
update public.sightings set risk='critical',visibility='hidden' where id='00000000-0000-4000-8000-000000002620';
set local role authenticated;
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),0::bigint,'hidden critical source also suppresses care history');
reset role;
update public.sightings set risk='normal',visibility='public' where id='00000000-0000-4000-8000-000000002620';
insert into public.user_blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000002602','00000000-0000-4000-8000-000000002601');
set local role authenticated;
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),0::bigint,'blocking care author suppresses history');
reset role;
update public.user_blocks set blocker_id='00000000-0000-4000-8000-000000002601',blocked_id='00000000-0000-4000-8000-000000002602' where blocker_id='00000000-0000-4000-8000-000000002602';
set local role authenticated;
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),0::bigint,'author blocking reader suppresses history');
reset role;
delete from public.user_blocks where blocker_id='00000000-0000-4000-8000-000000002601';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000002601',true);
select set_config('test.m2.third',(select "careEventId"::text from public.record_completed_care('00000000-0000-4000-8000-000000002610','observe',now()-interval '1 hour','896526add03ffff','00000000-0000-4000-8000-000000002645')),true);
reset role;
update public.care_events set visible_at=now()-interval '30 minutes' where id=current_setting('test.m2.third')::uuid;
set local role authenticated;
select is((select "careEventId"::text from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,1)),current_setting('test.m2.third'),'public pagination returns newest eligible event first');
select is((select "careEventId"::text from public.list_public_care_history('00000000-0000-4000-8000-000000002610',current_setting('test.m2.third')::uuid,1)),current_setting('test.m2.replacement'),'public cursor advances without duplicate');
select is((select count(*) from public.list_my_care_events(1,null,null)),1::bigint,'owner pagination is bounded');
select throws_ok($q$select * from public.list_public_care_history('00000000-0000-4000-8000-000000002611',current_setting('test.m2.third')::uuid,1)$q$,'P0001','invalid_care_history_cursor','a cursor cannot cross animals');
reset role;
update public.animals set visibility='hidden' where id='00000000-0000-4000-8000-000000002610';
set local role authenticated;
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000002610',null,20)),0::bigint,'hidden target suppresses all care history');
select lives_ok($q$select * from public.withdraw_care_event(current_setting('test.m2.replacement')::uuid,'00000000-0000-4000-8000-000000002646')$q$,'owner can withdraw after target hides');
reset role;
set local session_replication_role=replica;
update public.user_profiles set adult_confirmed_at=null where id='00000000-0000-4000-8000-000000002601';
set local session_replication_role=origin;
set local role authenticated;
select lives_ok($q$select * from public.withdraw_care_event(current_setting('test.m2.third')::uuid,'00000000-0000-4000-8000-000000002647')$q$,'owner withdrawal does not require renewed adult declaration');
reset role;
set local session_replication_role=replica;
update public.user_profiles set adult_confirmed_at=now() where id='00000000-0000-4000-8000-000000002601';
set local session_replication_role=origin;
delete from public.animals where id='00000000-0000-4000-8000-000000002610';
set local role authenticated;
select throws_ok($q$select * from public.withdraw_care_event(current_setting('test.m2.replacement')::uuid,'00000000-0000-4000-8000-000000002646')$q$,'P0001','care_event_not_available','animal deletion cannot make withdrawal replay succeed with null ID');
select throws_ok($q$select * from public.correct_care_event(current_setting('test.m2.first')::uuid,'water',now()-interval '4 hours','89652636d87ffff','00000000-0000-4000-8000-000000002644')$q$,'P0001','care_event_not_available','animal deletion cannot make correction replay succeed with null replacement');
select throws_ok($q$select * from public.record_completed_care('00000000-0000-4000-8000-000000002610','feed',now()-interval '4 hours','89652636d87ffff','00000000-0000-4000-8000-000000002640')$q$,'P0001','care_event_not_available','animal deletion cannot replay an apparently successful record');
reset role;
-- Two real sessions overlap on the same request; no duplicate fact or unique error.
create extension if not exists dblink with schema extensions;
select lives_ok($test$
do $race$
declare
 connection text := 'host='||host(inet_server_addr())||' port='||current_setting('port')||' dbname='||current_database()||' user='||session_user||' password='||session_user;
 command text := format('select * from public.record_completed_care(''00000000-0000-4000-8000-000000026802'',''feed'',%L::timestamptz,''89652636d87ffff'',''00000000-0000-4000-8000-000000026803'')',now()-interval '1 hour');
 first_id uuid; second_id uuid; cleanup text := $clean$
 delete from audit.access_audit where actor_id='00000000-0000-4000-8000-000000026801' and request_id='00000000-0000-4000-8000-000000026803';
 delete from private.care_requests where actor_id='00000000-0000-4000-8000-000000026801';
 delete from public.care_events where animal_id='00000000-0000-4000-8000-000000026802';
 delete from public.animals where id='00000000-0000-4000-8000-000000026802';
 delete from public.user_profiles where id='00000000-0000-4000-8000-000000026801';
 $clean$;
begin
 perform extensions.dblink_connect('m2_setup',connection);
 perform extensions.dblink_exec('m2_setup','set session_replication_role=replica');
 perform extensions.dblink_exec('m2_setup',$seed$
 insert into public.user_profiles(id,public_name,adult_confirmed_at) values('00000000-0000-4000-8000-000000026801','M2 synthetic race',now());
 insert into public.animals(id,primary_alias,visibility) values('00000000-0000-4000-8000-000000026802','M2 synthetic race cat','public');
 $seed$);
 perform extensions.dblink_exec('m2_setup','set session_replication_role=origin');
 perform extensions.dblink_connect('m2_one',connection);
 perform extensions.dblink_connect('m2_two',connection);
 perform extensions.dblink_exec('m2_one','set statement_timeout=''10s''; set role authenticated; set request.jwt.claim.sub=''00000000-0000-4000-8000-000000026801''; begin');
 perform extensions.dblink_exec('m2_two','set statement_timeout=''10s''; set role authenticated; set request.jwt.claim.sub=''00000000-0000-4000-8000-000000026801''');
 select "careEventId" into first_id from extensions.dblink('m2_one',command) as outcome("careEventId" uuid,"visibleAt" timestamptz,status text);
 perform extensions.dblink_send_query('m2_two',command);
 perform pg_sleep(0.05);
 perform extensions.dblink_exec('m2_one','commit');
 select "careEventId" into second_id from extensions.dblink_get_result('m2_two') as outcome("careEventId" uuid,"visibleAt" timestamptz,status text);
 if first_id is null or first_id is distinct from second_id or (select count(*) from public.care_events where animal_id='00000000-0000-4000-8000-000000026802')<>1 then raise exception 'care_race_not_idempotent'; end if;
 perform extensions.dblink_disconnect('m2_one');
 perform extensions.dblink_disconnect('m2_two');
 perform extensions.dblink_exec('m2_setup',cleanup);
 perform extensions.dblink_disconnect('m2_setup');
exception when others then
 if 'm2_one'=any(coalesce(extensions.dblink_get_connections(),'{}'::text[])) then perform extensions.dblink_disconnect('m2_one'); end if;
 if 'm2_two'=any(coalesce(extensions.dblink_get_connections(),'{}'::text[])) then perform extensions.dblink_disconnect('m2_two'); end if;
 if 'm2_setup'=any(coalesce(extensions.dblink_get_connections(),'{}'::text[])) then
  perform extensions.dblink_exec('m2_setup',cleanup);
  perform extensions.dblink_disconnect('m2_setup');
 end if;
 raise;
end $race$;
$test$,'concurrent request replay returns one stable completed-care fact');
select * from finish();
rollback;
