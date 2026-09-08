begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values('00000000-0000-4000-8000-000000003301','Singapore neighbour',now());
insert into public.animals(id,primary_alias,visibility,verification,identity_origin_required) values('00000000-0000-4000-8000-000000003310','Northern cat','public','reported',false);
insert into public.sightings(animal_id,reporter_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,client_dedupe_key)
values('00000000-0000-4000-8000-000000003310','00000000-0000-4000-8000-000000003301',now()-interval '4 hours','896526349cbffff','morning','normal','public',now()-interval '2 hours','{}','singapore-north-discovery');
set local session_replication_role=origin;
set local role anon;
select lives_ok(format('select * from public.list_public_cat_discovery(%L,null,null,20)',cell),'picker area is accepted: '||cell)
from unnest(array['896520ca163ffff','89652636d87ffff','896526add03ffff','896526349cbffff','89652634107ffff','896526362cbffff','89652636287ffff','896520d9073ffff','896520d83c3ffff','896526acebbffff','896526ad803ffff','896520cb1cfffff','896520ca673ffff']) cell;
select is((select count(*) from public.list_public_cat_discovery('896526349cbffff',null,null,20)),1::bigint,'Woodlands discovery returns the visible northern cat');
select throws_ok($$select * from public.list_public_cat_discovery('bad',null,null,20)$$,'22023','invalid_discovery_filter','invalid area still fails');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003301',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$select * from public.record_completed_care('00000000-0000-4000-8000-000000003310','water',now()-interval '1 minute','896526349cbffff','00000000-0000-4000-8000-000000003320')$$,'neighbour can record completed care in Woodlands');
reset role;
set local role anon;
select is((select count(*) from public.list_public_care_history('00000000-0000-4000-8000-000000003310',null,20)),0::bigint,'new care keeps its normal visibility delay');
reset role;
update public.animals set visibility='hidden' where id='00000000-0000-4000-8000-000000003310';
set local role anon;
select is((select count(*) from public.list_public_cat_discovery('896526349cbffff',null,null,20)),0::bigint,'hiding a cat still removes it from new-area discovery');
reset role;
select * from finish();
rollback;
