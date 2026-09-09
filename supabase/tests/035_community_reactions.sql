begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
set local session_replication_role=replica;
insert into public.user_profiles(id,public_name,adult_confirmed_at) values
 ('00000000-0000-4000-8000-000000003501','Author',now()),
 ('00000000-0000-4000-8000-000000003502','Reader',now()),
 ('00000000-0000-4000-8000-000000003503','New member',null);
set local session_replication_role=origin;
insert into public.community_posts(id,author_id,body,community_slug) values('00000000-0000-4000-8000-000000003510','00000000-0000-4000-8000-000000003501','Hello neighbours','clementi');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003502',true);
select lives_ok($$select * from public.set_community_post_like('00000000-0000-4000-8000-000000003510',true)$$,'reader likes a visible post');
select lives_ok($$select * from public.set_community_post_like('00000000-0000-4000-8000-000000003510',true)$$,'retry preserves desired liked state');
select is((select "likeCount" from public.get_community_post_reactions(array['00000000-0000-4000-8000-000000003510'::uuid])),1,'one reaction after two requests');
select is((select liked from public.get_community_post_reactions(array['00000000-0000-4000-8000-000000003510'::uuid])),true,'reader sees own reaction');
select lives_ok($$select * from public.set_community_post_like('00000000-0000-4000-8000-000000003510',false)$$,'reader removes like');
select is((select "likeCount" from public.get_community_post_reactions(array['00000000-0000-4000-8000-000000003510'::uuid])),0,'unlike persists');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003503',true);
select throws_ok($$select * from public.set_community_post_like('00000000-0000-4000-8000-000000003510',true)$$,'42501','adult_contributor_required','ineligible account cannot react');
reset role;
insert into public.user_blocks(blocker_id,blocked_id) values('00000000-0000-4000-8000-000000003501','00000000-0000-4000-8000-000000003502');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000003502',true);
select is_empty($$select * from public.get_community_post_reactions(array['00000000-0000-4000-8000-000000003510'::uuid])$$,'reverse-blocked post has no reaction metadata');
select throws_ok($$select * from public.set_community_post_like('00000000-0000-4000-8000-000000003510',true)$$,'P0001','community_post_not_available','reverse block prevents mutation');
select throws_ok($$select * from public.get_community_post_reactions(array_fill('00000000-0000-4000-8000-000000003510'::uuid,array[51]))$$,'22023','invalid_reaction_request','batch size is bounded');
reset role;
delete from public.user_blocks where blocker_id='00000000-0000-4000-8000-000000003501';
insert into private.community_post_likes(post_id,actor_id) values('00000000-0000-4000-8000-000000003510','00000000-0000-4000-8000-000000003502');
delete from public.community_posts where id='00000000-0000-4000-8000-000000003510';
select is((select count(*) from private.community_post_likes where post_id='00000000-0000-4000-8000-000000003510'),0::bigint,'post deletion removes reactions');
select * from finish();
rollback;
