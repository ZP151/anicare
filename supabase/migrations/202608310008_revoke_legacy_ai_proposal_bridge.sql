begin;

create or replace function public.service_submit_ai_identity_proposal(
  p_sighting_id uuid,
  p_proposed_animal_id uuid,
  p_model_version text,
  p_confidence_band text,
  p_reasons jsonb,
  p_request_id uuid
)
returns table (
  "proposalId" uuid,
  "source" text,
  "status" text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'legacy_ai_identity_proposal_disabled' using errcode = '42501';
end;
$$;

revoke all on function public.service_submit_ai_identity_proposal(uuid, uuid, text, text, jsonb, uuid) from public;
revoke all on function public.service_submit_ai_identity_proposal(uuid, uuid, text, text, jsonb, uuid) from anon;
revoke all on function public.service_submit_ai_identity_proposal(uuid, uuid, text, text, jsonb, uuid) from authenticated;
revoke all on function public.service_submit_ai_identity_proposal(uuid, uuid, text, text, jsonb, uuid) from service_role;

comment on function public.service_submit_ai_identity_proposal(uuid, uuid, text, text, jsonb, uuid) is
  'Deprecated and permanently disabled legacy service proposal bridge. Completion persists bounded private candidate sets only; future authenticated owner-bound selection is the sole AI-result bridge to a tentative proposal.';

commit;
