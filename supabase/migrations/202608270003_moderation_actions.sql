begin;

create table public.moderation_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  report_id uuid not null references public.moderation_reports(id) on delete restrict,
  action text not null check (action in ('hide_sighting', 'restore_sighting', 'no_action')),
  rationale text not null check (char_length(btrim(rationale)) between 10 and 2000),
  request_id uuid not null,
  resulting_visibility public.record_visibility not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (actor_id, request_id)
);

create table private.admin_moderation_requests (
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  request_id uuid not null,
  operation text not null check (operation in ('queue_read', 'report_read', 'resolve')),
  report_id uuid references public.moderation_reports(id) on delete restrict,
  action text check (action is null or action in ('hide_sighting', 'restore_sighting', 'no_action')),
  rationale text,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (actor_id, request_id),
  check (
    (operation = 'queue_read' and report_id is null and action is null and rationale is null)
    or (operation = 'report_read' and report_id is not null and action is null and rationale is null)
    or (operation = 'resolve' and report_id is not null and action is not null and rationale is not null)
  )
);

-- Holds are service-managed only. The admin console has no control to create,
-- release, or inspect them; they only make restoration more conservative.
create table private.sighting_restore_holds (
  id uuid primary key default extensions.gen_random_uuid(),
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  hold_type text not null check (hold_type in ('moderation', 'legal', 'safety')),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz,
  released_at timestamptz,
  check (expires_at is null or expires_at > created_at)
);

create index moderation_actions_report_created_idx on public.moderation_actions (report_id, created_at desc);
create index active_sighting_restore_holds_idx on private.sighting_restore_holds (sighting_id)
  where released_at is null;

alter table public.moderation_actions enable row level security;
alter table private.admin_moderation_requests enable row level security;
alter table private.sighting_restore_holds enable row level security;
revoke all on table public.moderation_actions from public, anon, authenticated;
revoke all on table private.admin_moderation_requests from public, anon, authenticated;
revoke all on table private.sighting_restore_holds from public, anon, authenticated;

create or replace function private.reject_moderation_action_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'moderation_actions_append_only' using errcode = '42501';
end;
$$;

create trigger moderation_actions_append_only
before update or delete on public.moderation_actions
for each row execute function private.reject_moderation_action_mutation();

create or replace function public.admin_has_active_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.role_grants grants
    where grants.user_id = auth.uid()
      and grants.role = 'platform_admin'::public.trust_role
      and grants.revoked_at is null
      and grants.provisional_until is null
  );
$$;

create or replace function public.admin_list_moderation_queue(
  p_request_id uuid
)
returns table (
  "reportId" uuid,
  "contentType" text,
  "reasonCode" text,
  "risk" text,
  "status" text,
  "dueAt" timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  prior private.admin_moderation_requests%rowtype;
begin
  if actor_id is null or not public.admin_has_active_platform_admin() then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'invalid_admin_request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior from private.admin_moderation_requests requests
  where requests.actor_id = admin_list_moderation_queue.actor_id
    and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'queue_read' then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
  else
    insert into private.admin_moderation_requests (actor_id, request_id, operation)
    values (actor_id, p_request_id, 'queue_read');
    insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, request_id)
    values (actor_id, 'admin_read_moderation_queue', 'moderation_queue', null, 'moderation', p_request_id::text);
  end if;

  return query
  select r.id, r.content_type, r.reason, r.risk::text, r.status::text, r.due_at
  from public.moderation_reports r
  where r.content_type = 'sighting'
    and r.status in ('open'::public.moderation_status, 'auto_hidden'::public.moderation_status, 'under_review'::public.moderation_status)
  order by
    case r.risk
      when 'critical'::public.risk_tier then 0
      when 'sensitive'::public.risk_tier then 1
      else 2
    end,
    r.due_at asc,
    r.id asc;
end;
$$;

create or replace function public.admin_get_moderation_report(
  p_report_id uuid,
  p_request_id uuid
)
returns table (
  "reportId" uuid,
  "contentType" text,
  "reasonCode" text,
  "risk" text,
  "status" text,
  "dueAt" timestamptz,
  "createdAt" timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  prior private.admin_moderation_requests%rowtype;
  report_row public.moderation_reports%rowtype;
begin
  if actor_id is null or not public.admin_has_active_platform_admin() then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if p_report_id is null or p_request_id is null then
    raise exception 'invalid_admin_request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior from private.admin_moderation_requests requests
  where requests.actor_id = admin_get_moderation_report.actor_id
    and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'report_read' or prior.report_id is distinct from p_report_id then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
  end if;

  select * into report_row
  from public.moderation_reports r
  where r.id = p_report_id and r.content_type = 'sighting'
  for key share;
  if not found then
    raise exception 'moderation_report_not_available' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from private.admin_moderation_requests requests
    where requests.actor_id = actor_id and requests.request_id = p_request_id
  ) then
    insert into private.admin_moderation_requests (actor_id, request_id, operation, report_id)
    values (actor_id, p_request_id, 'report_read', p_report_id);
    insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, request_id)
    values (actor_id, 'admin_read_moderation_report', 'moderation_report', p_report_id, 'moderation', p_request_id::text);
  end if;

  return query select
    report_row.id,
    report_row.content_type,
    report_row.reason,
    report_row.risk::text,
    report_row.status::text,
    report_row.due_at,
    report_row.created_at;
end;
$$;

create or replace function public.admin_resolve_moderation_report(
  p_report_id uuid,
  p_action text,
  p_rationale text,
  p_request_id uuid
)
returns table (
  "reportId" uuid,
  "action" text,
  "status" text,
  "visibility" text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  prior private.admin_moderation_requests%rowtype;
  report_row public.moderation_reports%rowtype;
  sighting_row public.sightings%rowtype;
  author_id uuid;
  normalized_rationale text;
  resulting_visibility public.record_visibility;
begin
  if actor_id is null or not public.admin_has_active_platform_admin() then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  normalized_rationale := pg_catalog.btrim(p_rationale);
  if p_report_id is null
    or p_request_id is null
    or p_action is null
    or p_rationale is null
    or p_action not in ('hide_sighting', 'restore_sighting', 'no_action')
    or char_length(coalesce(normalized_rationale, '')) not between 10 and 2000 then
    raise exception 'invalid_moderation_resolution' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );
  select * into prior from private.admin_moderation_requests requests
  where requests.actor_id = admin_resolve_moderation_report.actor_id
    and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'resolve'
      or prior.report_id is distinct from p_report_id
      or prior.action is distinct from p_action
      or prior.rationale is distinct from normalized_rationale then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return query
      select a.report_id, a.action, 'resolved'::text, a.resulting_visibility::text
      from public.moderation_actions a
      where a.actor_id = actor_id and a.request_id = p_request_id;
    return;
  end if;

  select * into report_row
  from public.moderation_reports r
  where r.id = p_report_id
    and r.content_type = 'sighting'
    and r.status in ('open'::public.moderation_status, 'auto_hidden'::public.moderation_status, 'under_review'::public.moderation_status)
  for update;
  if not found then
    raise exception 'moderation_report_not_actionable' using errcode = 'P0001';
  end if;

  select * into sighting_row
  from public.sightings s
  where s.id = report_row.content_id
  for update;
  if not found then
    raise exception 'moderation_target_not_available' using errcode = 'P0001';
  end if;
  author_id := sighting_row.reporter_id;
  if actor_id = report_row.reporter_id
    or actor_id = author_id
    or actor_id = report_row.target_user_id then
    raise exception 'moderation_reviewer_recusal_required' using errcode = '42501';
  end if;

  resulting_visibility := sighting_row.visibility;
  if p_action = 'hide_sighting' then
    resulting_visibility := 'hidden'::public.record_visibility;
  elsif p_action = 'restore_sighting' then
    if sighting_row.risk = 'critical'::public.risk_tier
      or exists (
        select 1 from public.moderation_reports other_report
        where other_report.content_type = 'sighting'
          and other_report.content_id = sighting_row.id
          and other_report.id <> report_row.id
          and other_report.status in ('open'::public.moderation_status, 'auto_hidden'::public.moderation_status, 'under_review'::public.moderation_status, 'appealed'::public.moderation_status)
      )
      or exists (
        select 1 from private.sighting_restore_holds hold
        where hold.sighting_id = sighting_row.id
          and hold.released_at is null
          and (hold.expires_at is null or hold.expires_at > pg_catalog.now())
      ) then
      raise exception 'sighting_restore_blocked' using errcode = 'P0001';
    end if;
    -- A reviewer can never use this path to republish content. Follow-up
    -- publication still requires the existing limited-to-public process.
    resulting_visibility := 'limited'::public.record_visibility;
  end if;

  insert into private.admin_moderation_requests (actor_id, request_id, operation, report_id, action, rationale)
  values (actor_id, p_request_id, 'resolve', p_report_id, p_action, normalized_rationale);
  if p_action <> 'no_action' then
    update public.sightings set visibility = resulting_visibility where id = sighting_row.id;
  end if;
  update public.moderation_reports
     set status = 'resolved'::public.moderation_status,
         assigned_reviewer_id = actor_id,
         resolved_at = pg_catalog.now()
   where id = report_row.id;
  insert into public.moderation_actions (actor_id, report_id, action, rationale, request_id, resulting_visibility)
  values (actor_id, report_row.id, p_action, normalized_rationale, p_request_id, resulting_visibility);
  insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, request_id)
  values (actor_id, 'admin_resolve_moderation_report', 'moderation_report', report_row.id, 'moderation', p_request_id::text);

  return query select report_row.id, p_action, 'resolved'::text, resulting_visibility::text;
end;
$$;

revoke all on function public.admin_has_active_platform_admin() from public, anon, authenticated;
revoke all on function public.admin_list_moderation_queue(uuid) from public, anon, authenticated;
revoke all on function public.admin_get_moderation_report(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_resolve_moderation_report(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_has_active_platform_admin() to authenticated;
grant execute on function public.admin_list_moderation_queue(uuid) to authenticated;
grant execute on function public.admin_get_moderation_report(uuid, uuid) to authenticated;
grant execute on function public.admin_resolve_moderation_report(uuid, text, text, uuid) to authenticated;

comment on table public.moderation_actions is
  'Append-only resolution record. Direct client access is denied; the fixed-path admin RPC is the only authenticated path.';
comment on function public.admin_list_moderation_queue(uuid) is
  'Platform-admin-only safe queue projection. Each stable request UUID creates at most one audit event.';
comment on function public.admin_get_moderation_report(uuid, uuid) is
  'Platform-admin-only safe report metadata projection. Narrative, identities, locations, and media are intentionally omitted.';
comment on function public.admin_resolve_moderation_report(uuid, text, text, uuid) is
  'Atomically locks a report and sighting, re-checks active platform-admin grant and recusal, resolves, records action, and audits.';

commit;
