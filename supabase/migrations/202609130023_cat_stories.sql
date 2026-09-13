begin;

-- A self-contained keyset survives an anchor being removed or reassociated.
-- This is a separate contract; legacy community clients retain their nine fields.
create or replace function public.list_public_cat_stories(p_cat_id uuid,p_cursor jsonb default null,p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 v_actor uuid:=auth.uid(); v_created timestamptz; v_id uuid; v_rows jsonb; v_items jsonb; v_last jsonb;
begin
 if p_cat_id is null or p_limit is null or p_limit not between 1 and 30 then
  raise exception 'invalid_cat_story_request' using errcode='22023';
 end if;
 if p_cursor is not null then
  begin
   if jsonb_typeof(p_cursor) is distinct from 'object' then raise exception 'bad cursor'; end if;
   if (select count(*) from jsonb_object_keys(p_cursor))<>4
    or p_cursor->'v' is distinct from '1'::jsonb
    or jsonb_typeof(p_cursor->'catId') is distinct from 'string'
    or jsonb_typeof(p_cursor->'postId') is distinct from 'string'
    or jsonb_typeof(p_cursor->'createdAt') is distinct from 'string'
    or (p_cursor->>'catId')::uuid is distinct from p_cat_id
    or p_cursor->>'catId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_cursor->>'postId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_cursor->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
   then raise exception 'bad cursor'; end if;
   v_created:=(p_cursor->>'createdAt')::timestamptz;
   v_id:=(p_cursor->>'postId')::uuid;
  exception when others then raise exception 'invalid_cat_story_request' using errcode='22023'; end;
 end if;
 if not private.is_public_cat_available(p_cat_id,v_actor) then raise exception 'cat_unavailable' using errcode='P0001'; end if;
 with page as (
  select p.* from public.community_posts p
  where p.cat_id=p_cat_id and private.community_post_available(p.id,v_actor)
   and (p_cursor is null or (p.created_at,p.id)<(v_created,v_id))
  order by p.created_at desc,p.id desc limit p_limit+1
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'postId',p.id,'catId',p.cat_id,'communitySlug',p.community_slug,'body',p.body,'title',p.title,
  'publishedAt',p.created_at,'author',jsonb_build_object('name',coalesce(profile.public_name,'Community member'),'avatarKey',coalesce(profile.avatar_key,'person')),
  'replyCount',(select count(*) from public.community_replies r where r.post_id=p.id and r.parent_reply_id is null and private.community_reply_available(r.id,v_actor)),
  'canEditLink',coalesce(v_actor is not null and p.author_id=v_actor,false),
  'media',(select coalesce(jsonb_agg(jsonb_build_object('mediaId',j.id,'width',j.display_width,'height',j.display_height) order by a.position),'[]'::jsonb)
   from private.community_post_media a join private.community_media_jobs j on j.id=a.media_id and j.status='attached' where a.post_id=p.id)
 ) order by p.created_at desc,p.id desc),'[]'::jsonb) into v_rows
 from page p left join public.user_profiles profile on profile.id=p.author_id;
 select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb) into v_items
 from jsonb_array_elements(v_rows) with ordinality as x(value,ordinal) where ordinal<=p_limit;
 v_last:=v_items->(jsonb_array_length(v_items)-1);
 return jsonb_build_object('items',v_items,'nextCursor',case when jsonb_array_length(v_rows)>p_limit then
  jsonb_build_object('v',1,'catId',p_cat_id,'createdAt',v_last->'publishedAt','postId',v_last->'postId') else null end);
end $$;
revoke all on function public.list_public_cat_stories(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_public_cat_stories(uuid,jsonb,integer) to anon,authenticated;
commit;
