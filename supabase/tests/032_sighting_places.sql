begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_function('public','get_public_sighting_places',array['uuid[]'],'building context has a narrow projection');
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000003201','Place author',now()),
 ('00000000-0000-4000-8000-000000003202','Place viewer',now());
set local session_replication_role=origin;
insert into public.animals(id,primary_alias,visibility,verification,identity_origin_required) values
 ('00000000-0000-4000-8000-000000003210','Place cat','public','reported',false),
 ('00000000-0000-4000-8000-000000003211','Critical cat','public','reported',false);
insert into public.sightings(id,animal_id,reporter_id,occurred_at,public_cell_id,time_bucket,risk,visibility,visible_at,traits,client_dedupe_key)
select ('00000000-0000-4000-8000-'||lpad((3230+n)::text,12,'0'))::uuid,case when n=3 then '00000000-0000-4000-8000-000000003211' else '00000000-0000-4000-8000-000000003210' end::uuid,'00000000-0000-4000-8000-000000003201',now()-interval '3 hours','896526add03ffff','morning',
 case when n=3 then 'critical' else 'normal' end::public.risk_tier,
 case when n in (2,3) then 'hidden' else 'public' end::public.record_visibility,
 case when n=3 then null when n=1 then now()+interval '1 hour' else now()-interval '1 hour' end,
 '{"public_place":{"residenceType":"hdb","name":"Block 123 Test Street","latitude":1.3},"private_note":"never project"}'::jsonb,'sg-place-'||n
from generate_series(0,3) n;
set local role anon;
select is((select count(*) from public.get_public_sighting_places(array['00000000-0000-4000-8000-000000003230','00000000-0000-4000-8000-000000003231','00000000-0000-4000-8000-000000003232','00000000-0000-4000-8000-000000003233']::uuid[])),1::bigint,'only delayed visible noncritical context is returned');
select is((select "residenceName" from public.get_public_sighting_places(array['00000000-0000-4000-8000-000000003230']::uuid[])),'Block 123 Test Street','the building name is retained');
select is((select count(*) from public.list_public_cat_community_activity('00000000-0000-4000-8000-000000003210')),1::bigint,'cat activity includes only the visible delayed record');
select is((select count(*) from public.get_public_sighting_places(array_fill('00000000-0000-4000-8000-000000003230'::uuid,array[51]))),0::bigint,'oversized batches are bounded');
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000003201','00000000-0000-4000-8000-000000003202');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003202',true);
select is((select count(*) from public.get_public_sighting_places(array['00000000-0000-4000-8000-000000003230']::uuid[])),0::bigint,'reverse block suppresses the location context');
select is((select count(*) from public.list_public_cat_community_activity('00000000-0000-4000-8000-000000003210')),0::bigint,'cat community activity respects reverse blocks too');
reset role;
select * from finish(); rollback;
