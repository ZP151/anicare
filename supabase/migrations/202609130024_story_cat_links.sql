begin;

alter table public.community_posts add column if not exists cat_link_revision bigint not null default 0 check(cat_link_revision between 0 and 9007199254740991);
create table if not exists private.story_cat_link_requests (
 actor_id uuid not null references public.user_profiles(id) on delete cascade,
 request_id uuid not null,
 post_id uuid not null references public.community_posts(id) on delete cascade,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 old_cat_id uuid,
 new_cat_id uuid,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,request_id)
);
alter table private.story_cat_link_requests enable row level security;
revoke all on private.story_cat_link_requests from public,anon,authenticated,service_role;

create or replace function public.get_my_story_cat_link(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare p public.community_posts%rowtype;
begin
 select * into p from public.community_posts where id=p_post_id and author_id=auth.uid() and deleted_at is null and moderation_hidden_at is null;
 if not found or not private.community_mutation_eligible(auth.uid()) then raise exception 'story_link_unavailable' using errcode='P0001'; end if;
 return jsonb_build_object('postId',p.id,'catId',p.cat_id,'communitySlug',p.community_slug,'revision',p.cat_link_revision);
end $$;

create or replace function public.change_my_story_cat_link(p_post_id uuid,p_cat_id uuid,p_community_slug text,p_expected_revision bigint,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); p public.community_posts%rowtype; prior private.story_cat_link_requests%rowtype; v_hash text; v_result jsonb; v_old uuid;
begin
 if v_actor is null then raise exception 'story_link_unavailable' using errcode='P0001'; end if;
 if p_post_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740991
  or (p_community_slug is not null and p_community_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$') then raise exception 'invalid_story_link_request' using errcode='22023'; end if;
 -- Serialize this account's writes/erasure before post and request locks.
 perform 1 from public.user_profiles where id=v_actor for update;
 if not found or not private.community_mutation_eligible(v_actor) then raise exception 'story_link_unavailable' using errcode='P0001'; end if;
 select * into p from public.community_posts where id=p_post_id for update;
 if not found or p.author_id is distinct from v_actor or p.deleted_at is not null or p.moderation_hidden_at is not null then raise exception 'story_link_unavailable' using errcode='P0001'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_request_id::text,0));
 v_hash:=encode(extensions.digest(jsonb_build_object('postId',p_post_id,'catId',p_cat_id,'communitySlug',p_community_slug,'expectedRevision',p_expected_revision)::text,'sha256'),'hex');
 select * into prior from private.story_cat_link_requests where actor_id=v_actor and request_id=p_request_id;
 if found then
  if prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
  return prior.result;
 end if;
 if p.cat_link_revision<>p_expected_revision then raise exception 'story_link_conflict' using errcode='P0001'; end if;
 if p_community_slug is distinct from p.community_slug and not (p.community_slug is null and p_cat_id is null and p_community_slug is not null) then raise exception 'invalid_story_link_request' using errcode='22023'; end if;
 if p_cat_id is null and p_community_slug is null then raise exception 'neighbourhood_required' using errcode='P0001'; end if;
 if p_cat_id is not null then
  perform 1 from public.animals where id=p_cat_id for share;
  if not found or not private.is_public_cat_available(p_cat_id,v_actor) then raise exception 'cat_unavailable' using errcode='P0001'; end if;
 end if;
 v_old:=p.cat_id;
 if p.cat_id is distinct from p_cat_id or p.community_slug is distinct from p_community_slug then
  if p.cat_link_revision>=9007199254740991 then raise exception 'story_link_conflict' using errcode='P0001'; end if;
  update public.community_posts set cat_id=p_cat_id,community_slug=p_community_slug,cat_link_revision=cat_link_revision+1 where id=p.id returning * into p;
 end if;
 v_result:=jsonb_build_object('postId',p.id,'catId',p.cat_id,'communitySlug',p.community_slug,'revision',p.cat_link_revision);
 insert into private.story_cat_link_requests(actor_id,request_id,post_id,payload_hash,old_cat_id,new_cat_id,result) values(v_actor,p_request_id,p.id,v_hash,v_old,p.cat_id,v_result);
 return v_result;
end $$;
revoke all on function public.get_my_story_cat_link(uuid),public.change_my_story_cat_link(uuid,uuid,text,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_story_cat_link(uuid),public.change_my_story_cat_link(uuid,uuid,text,bigint,uuid) to authenticated;

-- Reconcile immutable original requests before current cat/media availability.
create or replace function public.create_community_post(p_body text,p_cat_id uuid,p_community_slug text,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_body text:=nullif(pg_catalog.btrim(p_body),''); v_prior private.safety_requests%rowtype; v_id uuid; v_hash text;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if not private.community_mutation_eligible(v_actor) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 if v_body is null or pg_catalog.char_length(v_body)>2000 or p_request_id is null or (p_community_slug is not null and p_community_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$') or (p_cat_id is null and p_community_slug is null) then raise exception 'invalid_community_post' using errcode='22023'; end if;
 perform 1 from public.user_profiles where id=v_actor for update;
 if not found or not private.community_mutation_eligible(v_actor) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 v_hash:=pg_catalog.encode(extensions.digest(pg_catalog.jsonb_build_object('body',v_body,'catId',p_cat_id,'communitySlug',p_community_slug)::text,'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.safety_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation is distinct from 'community_post' or v_prior.payload_hash is distinct from v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; perform 1 from public.community_posts where id=v_prior.result_id and author_id=v_actor and deleted_at is null for share; if not found then raise exception 'community_post_deleted' using errcode='P0001'; end if; return v_prior.result_id; end if;
 if p_cat_id is not null then perform 1 from public.animals where id=p_cat_id for share; if not found or not private.is_public_cat_available(p_cat_id,v_actor) then raise exception 'community_cat_not_available' using errcode='P0001'; end if; end if;
 insert into public.community_posts(author_id,body,cat_id,community_slug) values(v_actor,v_body,p_cat_id,p_community_slug) returning id into v_id;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash,result_id) values(v_actor,p_request_id,'community_post',v_id,v_hash,v_id); return v_id;
end $$;

create or replace function public.create_community_post_with_media(p_body text,p_title text,p_cat_id uuid,p_community_slug text,p_media_ids uuid[],p_request_id uuid)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_body text:=nullif(btrim(p_body),''); v_title text:=nullif(btrim(p_title),''); v_hash text; prior private.safety_requests%rowtype; post_id uuid; v_media_id uuid; position integer:=0;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if not private.community_mutation_eligible(v_actor) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 if v_body is null or char_length(v_body)>2000 or (v_title is not null and char_length(v_title)>120) or p_request_id is null or coalesce(cardinality(p_media_ids),0)>6 or cardinality(p_media_ids)<>cardinality(array(select distinct value from unnest(coalesce(p_media_ids,'{}'::uuid[])) value)) or (p_community_slug is not null and p_community_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$') or (p_cat_id is null and p_community_slug is null) then raise exception 'invalid_community_post' using errcode='22023'; end if;
 perform 1 from public.user_profiles where id=v_actor for update;
 if not found or not private.community_mutation_eligible(v_actor) then raise exception 'adult_contributor_required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_request_id::text,0));
 v_hash:=encode(extensions.digest(jsonb_build_object('body',v_body,'title',v_title,'catId',p_cat_id,'communitySlug',p_community_slug,'mediaIds',coalesce(p_media_ids,'{}'::uuid[]))::text,'sha256'),'hex');
 select * into prior from private.safety_requests request_row where request_row.actor_id=v_actor and request_row.request_id=p_request_id for update;
 if found then if prior.operation<>'community_post' or prior.payload_hash<>v_hash then raise exception 'idempotency_conflict' using errcode='P0001'; end if; perform 1 from public.community_posts where id=prior.result_id and author_id=v_actor and deleted_at is null for share; if not found then raise exception 'community_post_deleted' using errcode='P0001'; end if; return prior.result_id; end if;
 if p_cat_id is not null then perform 1 from public.animals where id=p_cat_id for share; if not found or not private.is_public_cat_available(p_cat_id,v_actor) then raise exception 'community_cat_not_available' using errcode='P0001'; end if; end if;
 if exists(select 1 from private.community_media_jobs j where j.id=any(coalesce(p_media_ids,'{}'::uuid[])) and j.owner_id=v_actor and j.status='finalized' and j.reservation_expires_at<=now()) then raise exception 'community_media_expired' using errcode='P0001'; end if;
 perform 1 from private.community_media_jobs j where j.id=any(coalesce(p_media_ids,'{}'::uuid[])) order by j.id for update;
 if (select count(*) from private.community_media_jobs j where j.id=any(coalesce(p_media_ids,'{}'::uuid[])) and j.owner_id=v_actor and j.status='finalized' and j.reservation_expires_at>now())<>coalesce(cardinality(p_media_ids),0) then raise exception 'community_media_not_available' using errcode='P0001'; end if;
 insert into public.community_posts(author_id,body,title,cat_id,community_slug) values(v_actor,v_body,v_title,p_cat_id,p_community_slug) returning id into post_id;
 foreach v_media_id in array coalesce(p_media_ids,'{}'::uuid[]) loop
  insert into private.community_post_media(post_id,media_id,position) values(post_id,v_media_id,position);
  update private.community_media_jobs set status='attached',attached_at=now() where id=v_media_id;
  update private.community_media_cleanup_jobs cleanup set status='completed',completed_at=now(),claimed_at=null,claim_id=null where cleanup.media_id=v_media_id and cleanup.status='pending';
  position:=position+1;
 end loop;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash,result_id) values(v_actor,p_request_id,'community_post',post_id,v_hash,post_id);
 return post_id;
end $$;

create or replace function public.delete_community_content(p_content_type text,p_content_id uuid,p_request_id uuid) returns uuid language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_prior private.safety_requests%rowtype;
begin
 if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_content_type is null or p_content_type not in ('community_post','community_reply') or p_content_id is null or p_request_id is null then raise exception 'invalid_community_delete' using errcode='22023'; end if;
 perform 1 from public.user_profiles where id=v_actor for update;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||p_request_id::text,0)); select * into v_prior from private.safety_requests where actor_id=v_actor and request_id=p_request_id for update;
 if found then if v_prior.operation is distinct from 'community_delete' or v_prior.target_id is distinct from p_content_id then raise exception 'idempotency_conflict' using errcode='P0001'; end if; return p_request_id; end if;
 if p_content_type='community_post' then update public.community_posts set deleted_at=pg_catalog.now() where id=p_content_id and author_id=v_actor and deleted_at is null;
 else perform 1 from public.community_posts p join public.community_replies r on r.post_id=p.id where r.id=p_content_id for update of p; if found then update public.community_replies set deleted_at=pg_catalog.now() where id=p_content_id and author_id=v_actor and deleted_at is null; end if; end if;
 if not found then raise exception 'community_content_not_available' using errcode='P0001'; end if;
 insert into private.safety_requests(actor_id,request_id,operation,target_id,payload_hash,result_id) values(v_actor,p_request_id,'community_delete',p_content_id,pg_catalog.repeat('0',64),p_request_id); return p_request_id;
end $$;
-- Private discovery for an author whose old cat is no longer public. The public
-- nine-field post projection and its visibility rules remain unchanged.
create or replace function public.list_my_story_link_repairs(p_cursor uuid default null,p_limit integer default 20)
returns setof jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); anchor public.community_posts%rowtype;
begin
 if not private.community_mutation_eligible(actor) then raise exception 'story_link_unavailable' using errcode='P0001'; end if;
 if p_cursor is not null then
  select * into anchor from public.community_posts where id=p_cursor and author_id=actor;
  if not found then raise exception 'invalid_story_link_request' using errcode='22023'; end if;
 end if;
 return query select jsonb_build_object('postId',p.id,'catId',p.cat_id,'communitySlug',p.community_slug,'revision',p.cat_link_revision,'title',coalesce(p.title,left(p.body,120)),'createdAt',p.created_at)
 from public.community_posts p where p.author_id=actor and p.deleted_at is null and p.moderation_hidden_at is null and p.cat_id is not null and not private.is_public_cat_available(p.cat_id,actor)
 and (p_cursor is null or (p.created_at,p.id)<(anchor.created_at,anchor.id))
 order by p.created_at desc,p.id desc limit least(greatest(coalesce(p_limit,20),1),20);
end $$;
revoke all on function public.list_my_story_link_repairs(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_story_link_repairs(uuid,integer) to authenticated;
commit;
