begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

create function pg_temp.c1_races() returns setof text language plpgsql as $test$
declare
 conn text:='host='||host(inet_server_addr())||' port='||current_setting('port')||' dbname='||current_database()||' user='||session_user||' password='||session_user;
 a_pid integer; b_pid integer; deadline timestamptz; blocked boolean; result text; phase integer;
begin
 perform extensions.dblink_connect('c1_a',conn||' application_name=c1_link_a');
 perform extensions.dblink_connect('c1_b',conn||' application_name=c1_link_b');
 perform extensions.dblink_exec('c1_a','set statement_timeout=''10s''');
 perform extensions.dblink_exec('c1_b','set statement_timeout=''10s''');
 select pid into a_pid from extensions.dblink('c1_a','select pg_backend_pid()') as t(pid integer);
 select pid into b_pid from extensions.dblink('c1_b','select pg_backend_pid()') as t(pid integer);
 perform extensions.dblink_exec('c1_a',$setup$
  delete from public.community_posts where id='00000000-0000-4000-8000-000000004721';
  delete from public.animals where id in ('00000000-0000-4000-8000-000000004711','00000000-0000-4000-8000-000000004712');
  delete from public.user_profiles where id='00000000-0000-4000-8000-000000004701';
  set session_replication_role=replica;
  insert into public.user_profiles(id,public_name,adult_confirmed_at) values('00000000-0000-4000-8000-000000004701','Concurrency sample',now());
  set session_replication_role=origin;
  insert into public.animals(id,primary_alias,visibility) values('00000000-0000-4000-8000-000000004711','Race A','public'),('00000000-0000-4000-8000-000000004712','Race B','public');
  insert into public.community_posts(id,author_id,community_slug,body) values('00000000-0000-4000-8000-000000004721','00000000-0000-4000-8000-000000004701','bishan','Original story');
  create or replace function public.__c1_race_link(target integer,revision bigint,request integer) returns text language plpgsql as $helper$
  begin
   perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004701',true);
   return public.change_my_story_cat_link('00000000-0000-4000-8000-000000004721',regexp_replace('00000000-0000-4000-8000-000000000000','0{12}$',lpad(target::text,12,'0'))::uuid,'bishan',revision,regexp_replace('00000000-0000-4000-8000-000000000000','0{12}$',lpad(request::text,12,'0'))::uuid)->>'revision';
  exception when others then return sqlerrm;
  end $helper$;
  create or replace function public.__c1_race_delete() returns text language plpgsql as $helper$
  begin
   perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000004701',true);
   perform public.delete_community_content('community_post','00000000-0000-4000-8000-000000004721','00000000-0000-4000-8000-000000004790');return 'deleted';
  end $helper$;
 $setup$);
 -- Each writer starts after the competing operation holds its real row locks.
 for phase in 1..6 loop
  perform extensions.dblink_exec('c1_a','begin');
  if phase=1 then
   select v into result from extensions.dblink('c1_a','select public.__c1_race_link(4711,0,4731)') as t(v text);
   return next is(result,'1','first device changes revision zero');
   perform extensions.dblink_send_query('c1_b','select public.__c1_race_link(4712,0,4732)');
  elsif phase=2 then
   select v into result from extensions.dblink('c1_a','select public.__c1_race_link(4712,1,4733)') as t(v text);
   return next is(result,'2','link obtains post before concurrent deletion');
   perform extensions.dblink_send_query('c1_b','select public.__c1_race_delete()');
  elsif phase=3 then
   perform extensions.dblink_exec('c1_a',$q$update public.community_posts set deleted_at=now() where id='00000000-0000-4000-8000-000000004721'$q$);
   perform extensions.dblink_send_query('c1_b','select public.__c1_race_link(4711,2,4734)');
  elsif phase=4 then
   perform extensions.dblink_exec('c1_a',$q$update public.community_posts set deleted_at=null,moderation_hidden_at=now() where id='00000000-0000-4000-8000-000000004721'$q$);
   perform extensions.dblink_send_query('c1_b','select public.__c1_race_link(4711,2,4735)');
  elsif phase=5 then
   perform extensions.dblink_exec('c1_a',$q$update public.animals set archived_at=now() where id='00000000-0000-4000-8000-000000004711'$q$);
   perform extensions.dblink_send_query('c1_b','select public.__c1_race_link(4711,2,4736)');
  else
   select v into result from extensions.dblink('c1_a','select public.__c1_race_link(4711,2,4737)') as t(v text);
   return next is(result,'3','link validates an available target under lock');
   perform extensions.dblink_send_query('c1_b',$q$with changed as(update public.animals set archived_at=now() where id='00000000-0000-4000-8000-000000004711' returning id)select 'archived' from changed$q$);
  end if;
  deadline:=clock_timestamp()+interval '3 seconds';blocked:=false;
  loop
   blocked:=a_pid=any(pg_blocking_pids(b_pid));exit when blocked or clock_timestamp()>deadline;perform pg_sleep(0.02);
  end loop;
  return next ok(blocked,'phase '||phase||' waits on the competing transaction');
  perform extensions.dblink_exec('c1_a','commit');
  select v into result from extensions.dblink_get_result('c1_b') as t(v text);
  -- Drain libpq's completion result before reusing this async connection.
  perform * from extensions.dblink_get_result('c1_b') as t(v text);
  return next is(result,case phase when 1 then 'story_link_conflict' when 2 then 'deleted' when 3 then 'story_link_unavailable' when 4 then 'story_link_unavailable' when 5 then 'cat_unavailable' else 'archived' end,'phase '||phase||' resolves to a serial outcome');
  if phase=2 then
   select v into result from extensions.dblink('c1_a','select public.__c1_race_link(4712,1,4733)') as t(v text);
   return next is(result,'story_link_unavailable','deleted post cannot replay a prior successful link');
  elsif phase=4 then
   select v into result from extensions.dblink('c1_a','select public.__c1_race_link(4712,1,4733)') as t(v text);
   return next is(result,'story_link_unavailable','moderated post cannot replay a prior successful link');
   perform extensions.dblink_exec('c1_a',$q$update public.community_posts set deleted_at=null,moderation_hidden_at=null where id='00000000-0000-4000-8000-000000004721'$q$);
  elsif phase=5 then
   perform extensions.dblink_exec('c1_a',$q$update public.animals set archived_at=null where id='00000000-0000-4000-8000-000000004711'$q$);
  end if;
 end loop;
 perform extensions.dblink_exec('c1_a',$cleanup$
  drop function public.__c1_race_link(integer,bigint,integer);drop function public.__c1_race_delete();
  delete from public.community_posts where id='00000000-0000-4000-8000-000000004721';
  delete from public.animals where id in ('00000000-0000-4000-8000-000000004711','00000000-0000-4000-8000-000000004712');
  delete from public.user_profiles where id='00000000-0000-4000-8000-000000004701';
 $cleanup$);
 perform extensions.dblink_disconnect('c1_a');perform extensions.dblink_disconnect('c1_b');
 return;
exception when others then
 begin perform extensions.dblink_disconnect('c1_a');exception when others then null;end;
 begin perform extensions.dblink_disconnect('c1_b');exception when others then null;end;
 -- Disconnect rolls back lock-holding work; setup was committed remotely.
 begin
  perform extensions.dblink_connect('c1_cleanup',conn);
  perform extensions.dblink_exec('c1_cleanup',$cleanup$
   drop function if exists public.__c1_race_link(integer,bigint,integer);drop function if exists public.__c1_race_delete();
   delete from public.community_posts where id='00000000-0000-4000-8000-000000004721';
   delete from public.animals where id in ('00000000-0000-4000-8000-000000004711','00000000-0000-4000-8000-000000004712');
   delete from public.user_profiles where id='00000000-0000-4000-8000-000000004701';
  $cleanup$);
  perform extensions.dblink_disconnect('c1_cleanup');
 exception when others then null;end;
 raise;
end $test$;
select * from pg_temp.c1_races();
select * from finish();
rollback;
