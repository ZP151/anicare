begin;

alter table private.sighting_restore_holds
  add column source_type text,
  add column source_report_id uuid references public.moderation_reports(id) on delete restrict;

update private.sighting_restore_holds
set source_type = case hold_type
  when 'legal' then 'legal'
  when 'safety' then 'safety'
  else 'legacy_moderation'
end
where source_type is null;

alter table private.sighting_restore_holds
  alter column source_type set not null,
  add constraint sighting_restore_holds_source_check check (
    (source_type in ('auto_hide_report', 'manual_hide_report') and source_report_id is not null)
    or (source_type in ('legal', 'safety', 'legacy_moderation') and source_report_id is null)
  );

-- The former generic model permitted duplicate legal/safety rows. One active
-- source-owned hold is sufficient to preserve the restrictive outcome; retire
-- redundant legacy rows before installing the source key.
with duplicate_active_holds as (
  select id,
    row_number() over (
      partition by sighting_id, source_type, coalesce(source_report_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by created_at asc, id asc
    ) as duplicate_rank
  from private.sighting_restore_holds
  where released_at is null
)
update private.sighting_restore_holds hold
set released_at = pg_catalog.now()
from duplicate_active_holds duplicate_hold
where hold.id = duplicate_hold.id and duplicate_hold.duplicate_rank > 1;

create unique index active_sighting_restore_hold_source_idx
  on private.sighting_restore_holds (sighting_id, source_type, coalesce(source_report_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where released_at is null;

create or replace function private.ensure_auto_hide_report_hold()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.content_type = 'sighting' and new.status = 'auto_hidden'::public.moderation_status and new.content_id is not null then
    insert into private.sighting_restore_holds (sighting_id, hold_type, source_type, source_report_id)
    values (new.content_id, 'moderation', 'auto_hide_report', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger moderation_report_auto_hide_hold
after insert or update of status on public.moderation_reports
for each row execute function private.ensure_auto_hide_report_hold();

insert into private.sighting_restore_holds (sighting_id, hold_type, source_type, source_report_id)
select report.content_id, 'moderation', 'auto_hide_report', report.id
from public.moderation_reports report
join public.sightings sighting on sighting.id = report.content_id
where report.content_type = 'sighting'
  and report.status = 'auto_hidden'::public.moderation_status
  and report.content_id is not null
on conflict do nothing;

create or replace function public.set_sighting_restore_hold(
  p_sighting_id uuid,
  p_hold_type text,
  p_active boolean,
  p_request_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  if p_sighting_id is null or p_request_id is null or p_hold_type is null or p_hold_type not in ('legal', 'safety') or p_active is null then
    raise exception 'invalid_sighting_restore_hold' using errcode = '22023';
  end if;
  perform 1 from public.sightings where id = p_sighting_id for update;
  if not found then raise exception 'moderation_target_not_available' using errcode = 'P0001'; end if;

  if p_active then
    insert into private.sighting_restore_holds (sighting_id, hold_type, source_type)
    values (p_sighting_id, p_hold_type, p_hold_type)
    on conflict do nothing;
  else
    update private.sighting_restore_holds
       set released_at = pg_catalog.now()
     where sighting_id = p_sighting_id
       and source_type = p_hold_type
       and released_at is null;
  end if;
  insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, request_id)
  values (auth.uid(), 'set_sighting_restore_hold', 'sighting', p_sighting_id, 'moderation_hold', p_request_id::text);
  return true;
end;
$$;

create or replace function public.admin_resolve_moderation_report(
  p_report_id uuid,
  p_action text,
  p_rationale text,
  p_request_id uuid
)
returns table ("reportId" uuid, "action" text, "status" text, "visibility" text)
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
  own_auto_hold uuid;
  other_active_hold boolean := false;
begin
  if actor_id is null or not public.admin_has_active_platform_admin() then raise exception 'platform_admin_required' using errcode = '42501'; end if;
  normalized_rationale := pg_catalog.btrim(p_rationale);
  if p_report_id is null or p_request_id is null or p_action is null or p_rationale is null
    or p_action not in ('hide_sighting', 'restore_sighting', 'no_action')
    or char_length(coalesce(normalized_rationale, '')) not between 10 and 2000 then
    raise exception 'invalid_moderation_resolution' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0));
  select * into prior from private.admin_moderation_requests requests where requests.actor_id = actor_id and requests.request_id = p_request_id;
  if found then
    if prior.operation <> 'resolve' or prior.report_id is distinct from p_report_id or prior.action is distinct from p_action or prior.rationale is distinct from normalized_rationale then raise exception 'idempotency_conflict' using errcode = 'P0001'; end if;
    return query select action_row.report_id, action_row.action, 'resolved'::text, action_row.resulting_visibility::text from public.moderation_actions action_row where action_row.actor_id = actor_id and action_row.request_id = p_request_id;
    return;
  end if;
  select * into report_row from public.moderation_reports report
  where report.id = p_report_id and report.content_type = 'sighting' and report.status in ('open'::public.moderation_status, 'auto_hidden'::public.moderation_status, 'under_review'::public.moderation_status)
  for update;
  if not found then raise exception 'moderation_report_not_actionable' using errcode = 'P0001'; end if;
  select * into sighting_row from public.sightings sighting where sighting.id = report_row.content_id for update;
  if not found then raise exception 'moderation_target_not_available' using errcode = 'P0001'; end if;
  author_id := sighting_row.reporter_id;
  if actor_id = report_row.reporter_id or actor_id = author_id or actor_id = report_row.target_user_id then raise exception 'moderation_reviewer_recusal_required' using errcode = '42501'; end if;

  resulting_visibility := sighting_row.visibility;
  if p_action = 'hide_sighting' then
    if sighting_row.visibility = 'archived'::public.record_visibility then raise exception 'sighting_hide_not_applicable' using errcode = 'P0001'; end if;
    insert into private.sighting_restore_holds (sighting_id, hold_type, source_type, source_report_id)
    values (sighting_row.id, 'moderation', 'manual_hide_report', report_row.id)
    on conflict do nothing;
    resulting_visibility := 'hidden'::public.record_visibility;
  elsif p_action = 'restore_sighting' then
    if report_row.status <> 'auto_hidden'::public.moderation_status or sighting_row.visibility not in ('hidden'::public.record_visibility, 'limited'::public.record_visibility) then raise exception 'sighting_restore_not_applicable' using errcode = 'P0001'; end if;
    select hold.id into own_auto_hold from private.sighting_restore_holds hold
    where hold.sighting_id = sighting_row.id and hold.source_type = 'auto_hide_report' and hold.source_report_id = report_row.id and hold.released_at is null
    for update;
    if not found then raise exception 'sighting_restore_not_applicable' using errcode = 'P0001'; end if;
    update private.sighting_restore_holds set released_at = pg_catalog.now() where id = own_auto_hold;
    perform 1 from private.sighting_restore_holds hold
    where hold.sighting_id = sighting_row.id and hold.released_at is null and (hold.expires_at is null or hold.expires_at > pg_catalog.now())
    for update;
    other_active_hold := found;
    if not other_active_hold and sighting_row.visibility = 'hidden'::public.record_visibility then resulting_visibility := 'limited'::public.record_visibility; end if;
  end if;

  insert into private.admin_moderation_requests (actor_id, request_id, operation, report_id, action, rationale) values (actor_id, p_request_id, 'resolve', p_report_id, p_action, normalized_rationale);
  if p_action = 'hide_sighting' or (p_action = 'restore_sighting' and resulting_visibility is distinct from sighting_row.visibility) then update public.sightings set visibility = resulting_visibility where id = sighting_row.id; end if;
  update public.moderation_reports set status = 'resolved'::public.moderation_status, assigned_reviewer_id = actor_id, resolved_at = pg_catalog.now() where id = report_row.id;
  insert into public.moderation_actions (actor_id, report_id, action, rationale, request_id, resulting_visibility) values (actor_id, report_row.id, p_action, normalized_rationale, p_request_id, resulting_visibility);
  insert into audit.access_audit (actor_id, action, resource_type, resource_id, purpose, request_id) values (actor_id, 'admin_resolve_moderation_report', 'moderation_report', report_row.id, 'moderation', p_request_id::text);
  return query select report_row.id, p_action, 'resolved'::text, resulting_visibility::text;
end;
$$;

revoke all on function public.set_sighting_restore_hold(uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_sighting_restore_hold(uuid, text, boolean, uuid) to service_role;

comment on function public.set_sighting_restore_hold(uuid, text, boolean, uuid) is 'Service-role-only legal and safety hold path. It has no admin UI surface and writes an audit event.';
comment on table private.sighting_restore_holds is 'Durable source-owned moderation, legal, and safety visibility holds. Admin restore can release only its own auto-hide report hold.';

commit;
