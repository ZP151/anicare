begin;

create table private.cat_presentations (
  animal_id uuid primary key references public.animals(id) on delete cascade,
  portrait_path text unique,
  sample_label text,
  source_metadata jsonb not null,
  approved_at timestamptz not null default pg_catalog.now(),
  training_eligible boolean not null default false check (training_eligible = false),
  check (portrait_path is null or portrait_path = 'synthetic-test/' || animal_id::text || '/portrait.jpg'),
  check (sample_label is null or sample_label ~ '^测试样本( [A-Z][0-9][0-9])?$'),
  check (source_metadata @> '{"provenance":"synthetic_test","training_eligible":false}'::jsonb)
);
alter table private.cat_presentations enable row level security;
revoke all on table private.cat_presentations from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.cat_presentations to service_role;

create table private.test_sample_provisioning (
  fixture_key text primary key check (fixture_key ~ '^ios26-s[0-9]{2}$'),
  animal_id uuid not null unique references public.animals(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default pg_catalog.now()
);
alter table private.test_sample_provisioning enable row level security;
revoke all on table private.test_sample_provisioning from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.test_sample_provisioning to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('cat-portraits','cat-portraits',false,20971520,array['image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function private.is_public_cat_presentation_available(p_animal_id uuid,p_caller_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select private.is_public_cat_available(p_animal_id,p_caller_id)
   and private.current_care_risk(p_animal_id) <> 'critical'::public.risk_tier
   and exists (
     select 1 from public.sightings sighting
     where sighting.animal_id=p_animal_id
       and sighting.visibility='public'::public.record_visibility
       and sighting.visible_at is not null and sighting.visible_at<=pg_catalog.now()
       and sighting.risk<>'critical'::public.risk_tier
       and (sighting.reporter_id is null or p_caller_id is null or not exists (
         select 1 from public.user_blocks block_row
         where (block_row.blocker_id=p_caller_id and block_row.blocked_id=sighting.reporter_id)
            or (block_row.blocker_id=sighting.reporter_id and block_row.blocked_id=p_caller_id)
       ))
   );
$$;
revoke all on function private.is_public_cat_presentation_available(uuid,uuid) from public,anon,authenticated,service_role;

create function private.can_read_cat_portrait(p_bucket_id text,p_object_name text,p_caller_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select p_bucket_id='cat-portraits'
   and exists (
     select 1 from private.cat_presentations presentation
     where presentation.portrait_path=p_object_name
       and private.is_public_cat_presentation_available(presentation.animal_id,p_caller_id)
   );
$$;
revoke all on function private.can_read_cat_portrait(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_cat_portrait(text,text,uuid) to anon,authenticated;

create function public.get_public_cat_presentations(p_animal_ids uuid[])
returns table ("animalId" uuid,"portraitPath" text,"sampleLabel" text)
language sql stable security definer set search_path=pg_catalog as $$
 select presentation.animal_id,presentation.portrait_path,presentation.sample_label
 from private.cat_presentations presentation
 where cardinality(p_animal_ids) between 1 and 50
   and presentation.animal_id=any(p_animal_ids)
   and private.is_public_cat_presentation_available(presentation.animal_id,auth.uid())
 order by presentation.animal_id;
$$;
revoke all on function public.get_public_cat_presentations(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_public_cat_presentations(uuid[]) to anon,authenticated;
comment on function public.get_public_cat_presentations(uuid[]) is 'Returns only current eligible public cat presentation metadata. portraitPath is an opaque private-bucket path. The mobile client requests a 60-second signed URL; Storage signed URLs are bearer capabilities until their caller-selected expiry, so eligibility changes do not revoke a previously minted URL.';

create policy "approved public cat portraits are readable" on storage.objects for select to anon,authenticated
using (
  private.can_read_cat_portrait(bucket_id,name,auth.uid())
);

commit;
