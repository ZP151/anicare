create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists vector with schema extensions;

create schema if not exists private;
create schema if not exists audit;
revoke all on schema private from anon, authenticated;
revoke all on schema audit from anon, authenticated;

create type public.verification_provenance as enum (
  'reported',
  'community_confirmed',
  'partner_confirmed',
  'disputed',
  'superseded'
);
create type public.animal_lifecycle as enum (
  'unknown',
  'active',
  'inactive',
  'adopted',
  'relocated',
  'deceased'
);
create type public.risk_tier as enum ('normal', 'sensitive', 'critical');
create type public.record_visibility as enum ('limited', 'public', 'hidden', 'archived');
create type public.trust_role as enum (
  'contributor',
  'trusted_contributor',
  'guardian',
  'area_steward',
  'platform_admin',
  'dpo'
);
create type public.identity_proposal_status as enum (
  'tentative',
  'confirmed',
  'rejected',
  'superseded'
);
create type public.moderation_status as enum (
  'open',
  'auto_hidden',
  'under_review',
  'resolved',
  'appealed',
  'closed'
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  public_name text not null check (char_length(public_name) between 1 and 60),
  locale text not null default 'en' check (locale in ('en', 'zh-CN')),
  adult_confirmed_at timestamptz,
  training_consent_at timestamptz,
  training_consent_withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.animals (
  id uuid primary key default gen_random_uuid(),
  primary_alias text not null check (char_length(primary_alias) between 1 and 80),
  verification public.verification_provenance not null default 'reported',
  lifecycle public.animal_lifecycle not null default 'unknown',
  visibility public.record_visibility not null default 'limited',
  profile_created_by uuid references public.user_profiles(id) on delete set null,
  confirmed_photo_count integer not null default 0 check (confirmed_photo_count >= 0),
  ai_index_eligible boolean generated always as (confirmed_photo_count >= 3) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.animal_aliases (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 80),
  locale text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (animal_id, alias)
);

create table public.animal_events (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_id uuid references public.user_profiles(id) on delete set null,
  provenance public.verification_provenance not null default 'reported',
  risk public.risk_tier not null default 'normal',
  visibility public.record_visibility not null default 'limited',
  visible_at timestamptz,
  time_bucket text check (time_bucket is null or time_bucket in ('overnight', 'morning', 'afternoon', 'evening')),
  payload jsonb not null default '{}'::jsonb,
  supersedes_event_id uuid references public.animal_events(id),
  constraint critical_event_hidden check (risk <> 'critical' or visibility = 'hidden')
);

create table public.sightings (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid references public.animals(id) on delete set null,
  reporter_id uuid references public.user_profiles(id) on delete set null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  public_cell_id text not null check (char_length(public_cell_id) between 10 and 20),
  time_bucket text not null check (time_bucket in ('overnight', 'morning', 'afternoon', 'evening')),
  risk public.risk_tier not null default 'normal',
  visibility public.record_visibility not null default 'limited',
  visible_at timestamptz,
  traits jsonb not null default '{}'::jsonb,
  notes text check (notes is null or char_length(notes) <= 2000),
  client_dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (reporter_id, client_dedupe_key),
  constraint critical_sighting_hidden check (risk <> 'critical' or visibility = 'hidden')
);

create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  actor_id uuid references public.user_profiles(id) on delete set null,
  activity text not null check (activity in ('feed', 'water', 'cleanup', 'observe', 'companionship')),
  completed_at timestamptz not null,
  public_cell_id text not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  client_dedupe_key text not null,
  visibility public.record_visibility not null default 'limited',
  created_at timestamptz not null default now(),
  unique (actor_id, client_dedupe_key)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid references public.animals(id) on delete cascade,
  sighting_id uuid references public.sightings(id) on delete cascade,
  uploader_id uuid references public.user_profiles(id) on delete set null,
  storage_bucket text not null check (storage_bucket in ('public-media', 'private-evidence')),
  storage_path text not null,
  sha256 text not null,
  redaction_confirmed_at timestamptz not null,
  training_eligible boolean not null default false,
  embedding_model_version text,
  embedding extensions.vector(384),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_bucket, storage_path)
);

create table public.identity_proposals (
  id uuid primary key default gen_random_uuid(),
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  proposed_animal_id uuid references public.animals(id) on delete set null,
  proposer_id uuid references public.user_profiles(id) on delete set null,
  source text not null check (source in ('ai_candidate', 'manual_search', 'new_animal')),
  status public.identity_proposal_status not null default 'tentative',
  model_version text,
  confidence_band text check (confidence_band is null or confidence_band in ('likely', 'possible', 'weak')),
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint proposal_starts_tentative check (status <> 'confirmed' or reviewed_at is not null)
);

create table public.match_reviews (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.identity_proposals(id) on delete cascade,
  reviewer_id uuid references public.user_profiles(id) on delete set null,
  decision text not null check (decision in ('confirm', 'reject', 'needs_more_evidence')),
  rationale text check (rationale is null or char_length(rationale) <= 1000),
  created_at timestamptz not null default now()
);

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.user_profiles(id) on delete cascade,
  animal_id uuid references public.animals(id) on delete cascade,
  public_cell_id text,
  created_at timestamptz not null default now(),
  constraint one_follow_target check ((animal_id is not null)::integer + (public_cell_id is not null)::integer = 1),
  unique nulls not distinct (follower_id, animal_id, public_cell_id)
);

create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.user_profiles(id) on delete set null,
  content_type text not null,
  content_id uuid,
  content_author_id uuid references public.user_profiles(id) on delete set null,
  target_user_id uuid references public.user_profiles(id) on delete set null,
  reason text not null,
  risk public.risk_tier not null default 'normal',
  status public.moderation_status not null default 'open',
  assigned_reviewer_id uuid references public.user_profiles(id) on delete set null,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reviewer_recusal check (
    assigned_reviewer_id is null or assigned_reviewer_id not in (reporter_id, content_author_id, target_user_id)
  )
);

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  moderation_report_id uuid not null references public.moderation_reports(id) on delete cascade,
  appellant_id uuid references public.user_profiles(id) on delete set null,
  statement text not null check (char_length(statement) between 1 and 4000),
  reviewer_id uuid references public.user_profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'upheld', 'overturned', 'closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (moderation_report_id, appellant_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.user_profiles(id) on delete cascade,
  blocked_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint cannot_block_self check (blocker_id <> blocked_id)
);

create table public.role_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role public.trust_role not null,
  area_cell_id text,
  granted_by uuid references public.user_profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  provisional_until timestamptz,
  revoked_at timestamptz,
  verification_method text,
  verification_completed_at timestamptz
);

create table private.precise_locations (
  id uuid primary key default gen_random_uuid(),
  sighting_id uuid not null unique references public.sightings(id) on delete cascade,
  ciphertext bytea not null,
  nonce bytea not null,
  key_version integer not null default 1,
  captured_at timestamptz not null,
  coarsen_after timestamptz generated always as (
    ((captured_at at time zone 'UTC') + interval '12 months') at time zone 'UTC'
  ) stored,
  coarsened_at timestamptz,
  created_at timestamptz not null default now()
);

create table private.location_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  animal_id uuid not null references public.animals(id) on delete cascade,
  purpose text not null check (purpose in ('welfare_check', 'transport', 'veterinary_care', 'tnr_support')),
  granted_by uuid references public.user_profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  reason text not null,
  constraint grant_max_24_hours check (expires_at <= granted_at + interval '24 hours')
);

create table audit.access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.user_profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  purpose text,
  break_glass boolean not null default false,
  reason text,
  request_id text,
  occurred_at timestamptz not null default now(),
  constraint break_glass_has_reason check (not break_glass or char_length(coalesce(reason, '')) >= 10)
);

create index animal_events_public_timeline_idx on public.animal_events (animal_id, visible_at desc)
  where visibility = 'public';
create index sightings_public_feed_idx on public.sightings (public_cell_id, visible_at desc)
  where visibility = 'public';
create index media_embedding_idx on public.media_assets using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null and deleted_at is null;
create index active_role_grants_idx on public.role_grants (user_id, role)
  where revoked_at is null;
create index precise_locations_coarsen_idx on private.precise_locations (coarsen_after)
  where coarsened_at is null;

create or replace function public.create_sighting_with_location(
  p_reporter_id uuid,
  p_occurred_at timestamptz,
  p_public_cell_id text,
  p_time_bucket text,
  p_risk public.risk_tier,
  p_visibility public.record_visibility,
  p_visible_at timestamptz,
  p_traits jsonb,
  p_notes text,
  p_client_dedupe_key text,
  p_ciphertext bytea,
  p_nonce bytea,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, audit
as $$
declare
  new_sighting_id uuid;
begin
  if not exists (
    select 1 from public.user_profiles
    where id = p_reporter_id and adult_confirmed_at is not null
  ) then
    raise exception 'adult contributor confirmation required';
  end if;

  if p_risk = 'critical' and p_visibility <> 'hidden' then
    raise exception 'critical sightings must remain hidden';
  end if;

  insert into public.sightings (
    reporter_id,
    occurred_at,
    public_cell_id,
    time_bucket,
    risk,
    visibility,
    visible_at,
    traits,
    notes,
    client_dedupe_key
  ) values (
    p_reporter_id,
    p_occurred_at,
    p_public_cell_id,
    p_time_bucket,
    p_risk,
    p_visibility,
    p_visible_at,
    coalesce(p_traits, '{}'::jsonb),
    p_notes,
    p_client_dedupe_key
  ) returning id into new_sighting_id;

  insert into private.precise_locations (
    sighting_id, ciphertext, nonce, captured_at
  ) values (
    new_sighting_id, p_ciphertext, p_nonce, p_occurred_at
  );

  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, request_id
  ) values (
    p_reporter_id, 'create', 'sighting', new_sighting_id, 'community_sighting', p_request_id
  );

  return new_sighting_id;
end;
$$;

revoke all on function public.create_sighting_with_location(
  uuid, timestamptz, text, text, public.risk_tier, public.record_visibility,
  timestamptz, jsonb, text, text, bytea, bytea, text
) from public, anon, authenticated;
grant execute on function public.create_sighting_with_location(
  uuid, timestamptz, text, text, public.risk_tier, public.record_visibility,
  timestamptz, jsonb, text, text, bytea, bytea, text
) to service_role;

create or replace function public.is_adult_contributor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and adult_confirmed_at is not null
  );
$$;

create or replace function public.has_active_role(required_roles public.trust_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.role_grants
    where user_id = auth.uid()
      and role = any(required_roles)
      and revoked_at is null
      and (provisional_until is null or provisional_until > now())
  );
$$;

grant execute on function public.is_adult_contributor() to authenticated;
grant execute on function public.has_active_role(public.trust_role[]) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.animals enable row level security;
alter table public.animal_aliases enable row level security;
alter table public.animal_events enable row level security;
alter table public.sightings enable row level security;
alter table public.care_events enable row level security;
alter table public.media_assets enable row level security;
alter table public.identity_proposals enable row level security;
alter table public.match_reviews enable row level security;
alter table public.follows enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.appeals enable row level security;
alter table public.user_blocks enable row level security;
alter table public.role_grants enable row level security;

create policy "profiles readable by owner" on public.user_profiles for select
  using (id = auth.uid());
create policy "profiles created by owner" on public.user_profiles for insert
  with check (id = auth.uid());
create policy "profiles updated by owner" on public.user_profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "visible animals are publicly readable" on public.animals for select
  to anon, authenticated using (visibility in ('limited', 'public', 'archived'));
create policy "adult users propose animals" on public.animals for insert
  to authenticated with check (
    profile_created_by = auth.uid()
    and verification = 'reported'
    and visibility = 'limited'
    and public.is_adult_contributor()
  );

create policy "aliases follow visible animals" on public.animal_aliases for select
  to anon, authenticated using (
    exists (select 1 from public.animals where animals.id = animal_aliases.animal_id)
  );
create policy "adult users add aliases" on public.animal_aliases for insert
  to authenticated with check (created_by = auth.uid() and public.is_adult_contributor());

create policy "public delayed animal events" on public.animal_events for select
  to anon, authenticated using (visibility = 'public' and visible_at is not null and visible_at <= now());
create policy "authors read their own animal events" on public.animal_events for select
  to authenticated using (actor_id = auth.uid());
create policy "adult users submit animal events" on public.animal_events for insert
  to authenticated with check (
    actor_id = auth.uid()
    and visibility = 'limited'
    and visible_at is null
    and public.is_adult_contributor()
  );

create policy "public delayed sightings" on public.sightings for select
  to anon, authenticated using (visibility = 'public' and visible_at is not null and visible_at <= now());
create policy "reporters read own sightings" on public.sightings for select
  to authenticated using (reporter_id = auth.uid());
create policy "adult users submit sightings" on public.sightings for insert
  to authenticated with check (
    reporter_id = auth.uid()
    and visibility = 'limited'
    and visible_at is null
    and public.is_adult_contributor()
  );

create policy "public care summaries" on public.care_events for select
  to anon, authenticated using (visibility = 'public');
create policy "actors read own care records" on public.care_events for select
  to authenticated using (actor_id = auth.uid());
create policy "adult users submit care" on public.care_events for insert
  to authenticated with check (
    actor_id = auth.uid()
    and visibility = 'limited'
    and public.is_adult_contributor()
  );

create policy "public redacted media metadata" on public.media_assets for select
  to anon, authenticated using (storage_bucket = 'public-media' and deleted_at is null);
create policy "uploaders read own media metadata" on public.media_assets for select
  to authenticated using (uploader_id = auth.uid());
create policy "adult users submit redacted media metadata" on public.media_assets for insert
  to authenticated with check (uploader_id = auth.uid() and public.is_adult_contributor());

create policy "proposers read identity proposals" on public.identity_proposals for select
  to authenticated using (proposer_id = auth.uid());
create policy "trusted reviewers read identity proposals" on public.identity_proposals for select
  to authenticated using (public.has_active_role(array['trusted_contributor', 'area_steward', 'platform_admin']::public.trust_role[]));
create policy "adult users create tentative proposals" on public.identity_proposals for insert
  to authenticated with check (proposer_id = auth.uid() and status = 'tentative' and public.is_adult_contributor());

create policy "trusted reviewers read reviews" on public.match_reviews for select
  to authenticated using (public.has_active_role(array['trusted_contributor', 'area_steward', 'platform_admin']::public.trust_role[]));
create policy "trusted reviewers create reviews" on public.match_reviews for insert
  to authenticated with check (
    reviewer_id = auth.uid()
    and public.has_active_role(array['trusted_contributor', 'area_steward', 'platform_admin']::public.trust_role[])
  );

create policy "owners manage follows" on public.follows for all
  to authenticated using (follower_id = auth.uid()) with check (follower_id = auth.uid());
create policy "reporters read own moderation reports" on public.moderation_reports for select
  to authenticated using (reporter_id = auth.uid());
create policy "reviewers read moderation queue" on public.moderation_reports for select
  to authenticated using (public.has_active_role(array['area_steward', 'platform_admin']::public.trust_role[]));
create policy "adult users report content" on public.moderation_reports for insert
  to authenticated with check (reporter_id = auth.uid() and public.is_adult_contributor());
create policy "appellants manage own appeal" on public.appeals for select
  to authenticated using (appellant_id = auth.uid());
create policy "appellants create one appeal" on public.appeals for insert
  to authenticated with check (appellant_id = auth.uid());
create policy "owners manage blocks" on public.user_blocks for all
  to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "users read own role grants" on public.role_grants for select
  to authenticated using (user_id = auth.uid());

create or replace view public.public_animal_feed
with (security_invoker = true)
as
select
  a.id as animal_id,
  a.primary_alias,
  a.verification,
  a.lifecycle,
  latest.public_cell_id,
  latest.time_bucket,
  latest.visible_at as last_visible_at,
  cover.storage_path as cover_media_path
from public.animals a
left join lateral (
  select s.public_cell_id, s.time_bucket, s.visible_at
  from public.sightings s
  where s.animal_id = a.id
    and s.visibility = 'public'
    and s.visible_at <= now()
  order by s.visible_at desc
  limit 1
) latest on true
left join lateral (
  select m.storage_path
  from public.media_assets m
  where m.animal_id = a.id
    and m.storage_bucket = 'public-media'
    and m.deleted_at is null
  order by m.created_at
  limit 1
) cover on true
where a.visibility in ('limited', 'public', 'archived');

grant select on public.public_animal_feed to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 20971520, array['image/jpeg', 'image/webp']),
  ('private-evidence', 'private-evidence', false, 20971520, array['image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "public redacted photos are readable" on storage.objects for select
  to anon, authenticated using (bucket_id = 'public-media');
create policy "users upload into their public folder" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "users upload private evidence into their folder" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'private-evidence' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "users read their own private evidence" on storage.objects for select
  to authenticated using (
    bucket_id = 'private-evidence' and (storage.foldername(name))[1] = auth.uid()::text
  );

comment on schema private is 'Never expose through PostgREST. Decryption is restricted to audited Edge Functions.';
comment on table private.precise_locations is 'AES-GCM ciphertext only; public clients receive H3 resolution 9 cells.';
comment on table public.identity_proposals is 'Contributor selections remain tentative until an independent review.';
