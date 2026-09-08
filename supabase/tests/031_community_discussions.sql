begin;
select plan(22);

select has_table('public','community_posts','discussion posts exist');
select has_table('public','community_replies','discussion replies exist');
select has_function('public','list_public_community_posts',array['uuid','integer','text','uuid'],'anonymous post projection exists');
select has_function('public','list_public_community_replies',array['uuid','uuid','integer'],'anonymous reply projection exists');
select has_function('public','create_community_post',array['text','uuid','text','uuid'],'adult post write exists');
select has_function('public','create_community_reply',array['uuid','text','uuid'],'adult reply write exists');
select has_function('public','delete_community_content',array['text','uuid','uuid'],'owner deletion exists');
select has_function('public','block_community_author',array['text','uuid','uuid'],'block-by-content preserves author privacy');
select col_is_null('public','community_posts','author_id','post attribution can be erased');
select col_is_null('public','community_replies','author_id','reply attribution can be erased');
select ok(not has_table_privilege('anon','public.community_posts','select,insert,update,delete'),'anon has no table bypass');
select ok(has_function_privilege('anon','public.list_public_community_posts(uuid,integer,text,uuid)','execute'),'anonymous browsing uses narrow RPC');
select ok(has_function_privilege('authenticated','public.create_community_post(text,uuid,text,uuid)','execute'),'authenticated writing uses RPC');
select ok(has_function_privilege('authenticated','public.block_community_author(text,uuid,uuid)','execute'),'authenticated block-by-content has no profile projection bypass');
select ok(has_function_privilege('authenticated','public.admin_resolve_community_moderation_report(uuid,text,text,uuid)','execute'),'admin community resolution is constrained RPC only');
select ok(not has_table_privilege('authenticated','public.community_replies','select,insert,update,delete'),'reply table has no direct read or write bypass');
select ok(exists(select 1 from pg_constraint where conrelid='public.user_profiles'::regclass and pg_get_constraintdef(oid) like '%avatar_key%'),'avatar key is constrained at the database boundary');
select ok(pg_get_functiondef('public.list_public_community_posts(uuid,integer,text,uuid)'::regprocedure) like '%user_blocks%','post feed enforces block filtering');
select ok(pg_get_functiondef('public.create_community_post(text,uuid,text,uuid)'::regprocedure) like '%pg_advisory_xact_lock%','post creation serializes idempotent requests');
select ok(pg_get_functiondef('public.create_community_reply(uuid,text,uuid)'::regprocedure) like '%adult_contributor_required%','reply creation rejects unauthorised writers');
select ok((select confdeltype='n' from pg_constraint where conrelid='public.community_posts'::regclass and conname like '%author_id%'),'post author attribution is set null on erasure');
select ok(pg_get_functiondef('public.create_moderation_report(text,uuid,text,text,uuid)'::regprocedure) like '%community_post%','report pipeline accepts community post targets');

select * from finish();
rollback;
