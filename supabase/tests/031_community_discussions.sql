begin;
select plan(13);

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

select * from finish();
rollback;
