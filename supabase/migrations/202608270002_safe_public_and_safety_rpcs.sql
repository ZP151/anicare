begin;

drop view if exists public.public_animal_feed;

drop policy if exists "visible animals are publicly readable" on public.animals;
drop policy if exists "adult users propose animals" on public.animals;
drop policy if exists "aliases follow visible animals" on public.animal_aliases;
drop policy if exists "adult users add aliases" on public.animal_aliases;
drop policy if exists "public delayed animal events" on public.animal_events;
drop policy if exists "authors read their own animal events" on public.animal_events;
drop policy if exists "adult users submit animal events" on public.animal_events;
drop policy if exists "public delayed sightings" on public.sightings;
drop policy if exists "reporters read own sightings" on public.sightings;
drop policy if exists "adult users submit sightings" on public.sightings;
drop policy if exists "public care summaries" on public.care_events;
drop policy if exists "actors read own care records" on public.care_events;
drop policy if exists "adult users submit care" on public.care_events;
drop policy if exists "public redacted media metadata" on public.media_assets;
drop policy if exists "uploaders read own media metadata" on public.media_assets;
drop policy if exists "adult users submit redacted media metadata" on public.media_assets;
drop policy if exists "reporters read own moderation reports" on public.moderation_reports;
drop policy if exists "reviewers read moderation queue" on public.moderation_reports;
drop policy if exists "adult users report content" on public.moderation_reports;
drop policy if exists "owners manage blocks" on public.user_blocks;

revoke all on table public.animals from public, anon, authenticated;
revoke all on table public.animal_aliases from public, anon, authenticated;
revoke all on table public.animal_events from public, anon, authenticated;
revoke all on table public.sightings from public, anon, authenticated;
revoke all on table public.care_events from public, anon, authenticated;
revoke all on table public.media_assets from public, anon, authenticated;
revoke all on table public.moderation_reports from public, anon, authenticated;
revoke all on table public.user_blocks from public, anon, authenticated;

grant select, insert, update, delete on table public.animals to service_role;
grant select, insert, update, delete on table public.animal_aliases to service_role;
grant select, insert, update, delete on table public.animal_events to service_role;
grant select, insert, update, delete on table public.sightings to service_role;
grant select, insert, update, delete on table public.care_events to service_role;
grant select, insert, update, delete on table public.media_assets to service_role;
grant select, insert, update, delete on table public.moderation_reports to service_role;
grant select, insert, update, delete on table public.user_blocks to service_role;

alter table public.moderation_reports
  add column detail text,
  add column request_id uuid;
alter table public.moderation_reports
  add constraint moderation_reports_content_type_check
    check (content_type in ('sighting', 'user')) not valid,
  add constraint moderation_reports_reason_check
    check (reason in (
      'spam', 'harassment', 'unsafe_location', 'animal_welfare',
      'graphic_content', 'misinformation', 'precise_location_exposure',
      'animal_in_immediate_danger'
    )) not valid,
  add constraint moderation_reports_detail_check
    check (detail is null or char_length(detail) between 1 and 1000) not valid;
create unique index moderation_reports_reporter_request_idx
  on public.moderation_reports (reporter_id, request_id)
  where request_id is not null;

create table private.safety_requests (
  actor_id uuid not null references public.user_profiles(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (operation in ('report', 'block', 'unblock')),
  target_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result_id uuid,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);

alter table private.safety_requests enable row level security;
revoke all on table private.safety_requests from public, anon, authenticated;
grant select, insert, update, delete on table private.safety_requests to service_role;

create or replace function public.list_public_sighting_feed(
  p_cursor uuid default null,
  p_limit integer default 20
)
returns table (
  "sightingId" uuid,
  "animalId" uuid,
  "primaryAlias" text,
  "verification" text,
  "publicCellId" text,
  "timeBucket" text,
  "coverMediaId" uuid,
  "cursor" uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  caller_id uuid := auth.uid();
  cursor_visible_at timestamptz;
  cursor_id uuid;
  page_size integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_cursor is not null then
    select s.visible_at, s.id
      into cursor_visible_at, cursor_id
      from public.sightings s
      join public.animals a on a.id = s.animal_id
     where s.id = p_cursor
       and s.visibility = 'public'
       and s.visible_at is not null
       and s.visible_at <= pg_catalog.now()
       and s.risk <> 'critical'
       and a.visibility = 'public'
       and (
         caller_id is null
         or s.reporter_id is null
         or not exists (
           select 1
           from public.user_blocks b
           where (b.blocker_id = caller_id and b.blocked_id = s.reporter_id)
              or (b.blocker_id = s.reporter_id and b.blocked_id = caller_id)
         )
       );
    if not found then
      raise exception 'invalid_feed_cursor' using errcode = 'P0001';
    end if;
  end if;

  return query
  select
    s.id,
    a.id,
    a.primary_alias,
    a.verification::text,
    s.public_cell_id,
    case
      when s.visible_at >= pg_catalog.date_trunc('day', pg_catalog.now()) then 'today'
      when s.visible_at >= pg_catalog.date_trunc('day', pg_catalog.now()) - interval '6 days' then 'this_week'
      else 'earlier'
    end::text,
    null::uuid,
    s.id
  from public.sightings s
  join public.animals a on a.id = s.animal_id
  where s.visibility = 'public'
    and s.visible_at is not null
    and s.visible_at <= pg_catalog.now()
    and s.risk <> 'critical'
    and a.visibility = 'public'
    and (
      cursor_id is null
      or (s.visible_at, s.id) < (cursor_visible_at, cursor_id)
    )
    and (
      caller_id is null
      or s.reporter_id is null
      or not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = caller_id and b.blocked_id = s.reporter_id)
           or (b.blocker_id = s.reporter_id and b.blocked_id = caller_id)
      )
    )
  order by s.visible_at desc, s.id desc
  limit page_size;
end;
$$;

revoke all on function public.list_public_sighting_feed(uuid, integer) from public;
revoke all on function public.list_public_sighting_feed(uuid, integer) from anon, authenticated;
grant execute on function public.list_public_sighting_feed(uuid, integer) to anon, authenticated;

create or replace function public.create_moderation_report(
  p_content_type text,
  p_content_id uuid,
  p_reason_code text,
  p_detail text,
  p_request_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  normalized_detail text;
  payload_hash text;
  prior private.safety_requests%rowtype;
  author_id uuid;
  target_user_id uuid;
  derived_risk public.risk_tier;
  derived_status public.moderation_status;
  derived_due_at timestamptz;
  report_id uuid;
  should_auto_hide boolean := false;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.user_profiles p
    where p.id = actor_id
      and p.adult_confirmed_at is not null
      and p.adult_confirmed_at <= pg_catalog.now()
  ) then
    raise exception 'adult_contributor_required' using errcode = '42501';
  end if;
  if p_content_type is null
      or p_content_type not in ('sighting', 'user')
      or p_content_id is null
      or p_reason_code is null
      or p_reason_code not in (
        'spam', 'harassment', 'unsafe_location', 'animal_welfare',
        'graphic_content', 'misinformation', 'precise_location_exposure',
        'animal_in_immediate_danger'
      )
      or p_request_id is null then
    raise exception 'invalid_report_request' using errcode = '22023';
  end if;

  normalized_detail := nullif(pg_catalog.btrim(p_detail), '');
  if (p_detail is not null and normalized_detail is null)
      or pg_catalog.char_length(coalesce(normalized_detail, '')) > 1000 then
    raise exception 'invalid_report_request' using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'contentType', p_content_type,
        'contentId', p_content_id,
        'reasonCode', p_reason_code,
        'detail', normalized_detail
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior
  from private.safety_requests r
  where r.actor_id = create_moderation_report.actor_id
    and r.request_id = p_request_id;
  if found then
    if prior.operation <> 'report'
        or prior.target_id <> p_content_id
        or prior.payload_hash <> payload_hash
        or prior.result_id is null then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return prior.result_id;
  end if;

  if p_content_type = 'sighting' then
    select s.reporter_id
      into author_id
      from public.sightings s
      join public.animals a on a.id = s.animal_id
     where s.id = p_content_id
       and s.visibility = 'public'
       and s.visible_at is not null
       and s.visible_at <= pg_catalog.now()
       and s.risk <> 'critical'
       and a.visibility = 'public'
       and (
         s.reporter_id is null
         or not exists (
           select 1
           from public.user_blocks b
           where (b.blocker_id = actor_id and b.blocked_id = s.reporter_id)
              or (b.blocker_id = s.reporter_id and b.blocked_id = actor_id)
         )
       )
     for update of s;
    if not found then
      raise exception 'target_not_available' using errcode = 'P0001';
    end if;
  else
    select p.id into target_user_id
    from public.user_profiles p
    where p.id = p_content_id and p.id <> actor_id;
    if not found then
      raise exception 'target_not_available' using errcode = 'P0001';
    end if;
  end if;

  derived_risk := case
    when p_reason_code in ('precise_location_exposure', 'animal_in_immediate_danger') then 'critical'::public.risk_tier
    when p_reason_code in ('harassment', 'unsafe_location', 'animal_welfare', 'graphic_content') then 'sensitive'::public.risk_tier
    else 'normal'::public.risk_tier
  end;
  should_auto_hide := p_content_type = 'sighting' and derived_risk = 'critical';
  derived_status := case
    when should_auto_hide then 'auto_hidden'::public.moderation_status
    else 'open'::public.moderation_status
  end;
  derived_due_at := pg_catalog.now() + case derived_risk
    when 'critical'::public.risk_tier then interval '1 hour'
    when 'sensitive'::public.risk_tier then interval '24 hours'
    else interval '72 hours'
  end;

  insert into private.safety_requests (
    actor_id, request_id, operation, target_id, payload_hash
  ) values (
    actor_id, p_request_id, 'report', p_content_id, payload_hash
  );

  insert into public.moderation_reports (
    reporter_id, content_type, content_id, content_author_id, target_user_id,
    reason, detail, risk, status, assigned_reviewer_id, due_at, request_id
  ) values (
    actor_id, p_content_type, p_content_id, author_id, target_user_id,
    p_reason_code, normalized_detail, derived_risk, derived_status, null,
    derived_due_at, p_request_id
  ) returning id into report_id;

  if should_auto_hide then
    update public.sightings
       set visibility = 'hidden'
     where id = p_content_id;
    insert into audit.access_audit (
      actor_id, action, resource_type, resource_id, purpose, reason, request_id
    ) values (
      actor_id, 'auto_hide_sighting', 'sighting', p_content_id,
      'community_safety', null, p_request_id::text
    );
  end if;

  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, reason, request_id
  ) values (
    actor_id, 'create_moderation_report', 'moderation_report', report_id,
    'community_safety', null, p_request_id::text
  );

  update private.safety_requests r
     set result_id = report_id
   where r.actor_id = create_moderation_report.actor_id
     and r.request_id = p_request_id;
  return report_id;
end;
$$;

revoke all on function public.create_moderation_report(text, uuid, text, text, uuid) from public;
revoke all on function public.create_moderation_report(text, uuid, text, text, uuid) from anon, authenticated;
grant execute on function public.create_moderation_report(text, uuid, text, text, uuid) to authenticated;

create or replace function public.block_user(
  p_blocked_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  payload_hash text;
  prior private.safety_requests%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_profiles p where p.id = actor_id) then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_blocked_id is null then
    raise exception 'invalid_block_request' using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'operation', 'block', 'targetId', p_blocked_id
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior
  from private.safety_requests r
  where r.actor_id = block_user.actor_id and r.request_id = p_request_id;
  if found then
    if prior.operation <> 'block'
        or prior.target_id <> p_blocked_id
        or prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return true;
  end if;

  if p_blocked_id = actor_id
      or not exists (select 1 from public.user_profiles p where p.id = p_blocked_id) then
    raise exception 'target_not_available' using errcode = 'P0001';
  end if;

  insert into private.safety_requests (
    actor_id, request_id, operation, target_id, payload_hash
  ) values (
    actor_id, p_request_id, 'block', p_blocked_id, payload_hash
  );
  insert into public.user_blocks (blocker_id, blocked_id)
  values (actor_id, p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;
  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, reason, request_id
  ) values (
    actor_id, 'block_user', 'user_block', p_blocked_id,
    'community_safety', null, p_request_id::text
  );
  return true;
end;
$$;

revoke all on function public.block_user(uuid, uuid) from public;
revoke all on function public.block_user(uuid, uuid) from anon, authenticated;
grant execute on function public.block_user(uuid, uuid) to authenticated;

create or replace function public.unblock_user(
  p_blocked_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  payload_hash text;
  prior private.safety_requests%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_profiles p where p.id = actor_id) then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_blocked_id is null then
    raise exception 'invalid_block_request' using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'operation', 'unblock', 'targetId', p_blocked_id
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior
  from private.safety_requests r
  where r.actor_id = unblock_user.actor_id and r.request_id = p_request_id;
  if found then
    if prior.operation <> 'unblock'
        or prior.target_id <> p_blocked_id
        or prior.payload_hash <> payload_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return true;
  end if;

  if p_blocked_id = actor_id
      or not exists (select 1 from public.user_profiles p where p.id = p_blocked_id) then
    raise exception 'target_not_available' using errcode = 'P0001';
  end if;

  insert into private.safety_requests (
    actor_id, request_id, operation, target_id, payload_hash
  ) values (
    actor_id, p_request_id, 'unblock', p_blocked_id, payload_hash
  );
  delete from public.user_blocks b
   where b.blocker_id = actor_id and b.blocked_id = p_blocked_id;
  insert into audit.access_audit (
    actor_id, action, resource_type, resource_id, purpose, reason, request_id
  ) values (
    actor_id, 'unblock_user', 'user_block', p_blocked_id,
    'community_safety', null, p_request_id::text
  );
  return true;
end;
$$;

revoke all on function public.unblock_user(uuid, uuid) from public;
revoke all on function public.unblock_user(uuid, uuid) from anon, authenticated;
grant execute on function public.unblock_user(uuid, uuid) to authenticated;

comment on function public.list_public_sighting_feed(uuid, integer) is
  'Narrow delayed public projection. Cursor is an opaque sighting UUID; exact times and storage metadata remain internal.';
comment on function public.create_moderation_report(text, uuid, text, text, uuid) is
  'Creates one audited report per actor/request UUID while deriving authorship, risk, status, and SLA server-side.';
comment on function public.block_user(uuid, uuid) is
  'Creates only the authenticated caller-owned block and appends a non-sensitive audit event.';
comment on function public.unblock_user(uuid, uuid) is
  'Removes only the authenticated caller-owned block and appends a non-sensitive audit event.';
comment on column public.moderation_reports.detail is
  'Reporter-provided moderation detail; never copied into access_audit metadata.';
comment on column public.moderation_reports.request_id is
  'Stable caller request UUID used for idempotent report creation.';

commit;
