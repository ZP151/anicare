begin;
select no_plan();

select has_function(
  'public', 'service_submit_ai_identity_proposal',
  array['uuid', 'uuid', 'text', 'text', 'jsonb', 'uuid'],
  'the legacy service proposal bridge remains identifiable at its frozen signature'
);
select is(
  (select procedures.proargnames
     from pg_catalog.pg_proc as procedures
    where procedures.oid =
      'public.service_submit_ai_identity_proposal(uuid,uuid,text,text,jsonb,uuid)'::regprocedure),
  array[
    'p_sighting_id', 'p_proposed_animal_id', 'p_model_version',
    'p_confidence_band', 'p_reasons', 'p_request_id',
    'proposalId', 'source', 'status'
  ]::text[],
  'the legacy bridge preserves exact input and table-output names'
);
select is(
  (select array(
     select modes.mode::text
       from pg_catalog.unnest(procedures.proargmodes) with ordinality
            as modes(mode, ordinal)
      order by modes.ordinal
   )
     from pg_catalog.pg_proc as procedures
    where procedures.oid =
      'public.service_submit_ai_identity_proposal(uuid,uuid,text,text,jsonb,uuid)'::regprocedure),
  array['i', 'i', 'i', 'i', 'i', 'i', 't', 't', 't']::text[],
  'the legacy bridge preserves six inputs followed by three table outputs'
);
select is(
  (select array(
     select pg_catalog.format_type(types.type_oid, null)
       from pg_catalog.unnest(procedures.proallargtypes) with ordinality
            as types(type_oid, ordinal)
      order by types.ordinal
   )
     from pg_catalog.pg_proc as procedures
    where procedures.oid =
      'public.service_submit_ai_identity_proposal(uuid,uuid,text,text,jsonb,uuid)'::regprocedure),
  array['uuid', 'uuid', 'text', 'text', 'jsonb', 'uuid', 'uuid', 'text', 'text']::text[],
  'the legacy bridge preserves exact input and table-output types'
);
select ok(
  (select procedures.provolatile = 'v'
      and procedures.prosecdef
      and procedures.proretset
      and procedures.prorettype = 'record'::pg_catalog.regtype
      and procedures.proconfig = array['search_path=pg_catalog']::text[]
     from pg_catalog.pg_proc as procedures
    where procedures.oid =
      'public.service_submit_ai_identity_proposal(uuid,uuid,text,text,jsonb,uuid)'::regprocedure),
  'the legacy bridge remains volatile security definer with a fixed search path'
);
with expected(role_name) as (values
  ('public'), ('anon'), ('authenticated'), ('service_role')
)
select is(
  pg_catalog.has_function_privilege(
    expected.role_name,
    'public.service_submit_ai_identity_proposal(uuid,uuid,text,text,jsonb,uuid)',
    'execute'
  ),
  false,
  expected.role_name || ' has no execute privilege on the disabled legacy bridge'
)
from expected;
select is(
  pg_catalog.obj_description(
    'public.service_submit_ai_identity_proposal(uuid,uuid,text,text,jsonb,uuid)'::regprocedure,
    'pg_proc'
  ),
  'Deprecated and permanently disabled legacy service proposal bridge. Completion persists bounded private candidate sets only; future authenticated owner-bound selection is the sole AI-result bridge to a tentative proposal.'::text,
  'the legacy bridge comment truthfully records permanent disablement'
);

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000018100', 'Legacy Proposal Owner', pg_catalog.now()),
  ('00000000-0000-4000-8000-000000018101', 'Legacy Proposal Reviewer', pg_catalog.now());
insert into public.animals (id, primary_alias, profile_created_by, visibility) values
  ('00000000-0000-4000-8000-000000018110', 'Legacy Proposal Cat',
   '00000000-0000-4000-8000-000000018100', 'limited');
insert into public.sightings (
  id, reporter_id, occurred_at, public_cell_id, time_bucket, risk, visibility, client_dedupe_key
) values
  ('00000000-0000-4000-8000-000000018120', '00000000-0000-4000-8000-000000018100',
   pg_catalog.now(), '8928308280fffff', 'morning', 'normal', 'limited', 'task6-legacy-history'),
  ('00000000-0000-4000-8000-000000018121', '00000000-0000-4000-8000-000000018100',
   pg_catalog.now(), '8928308280fffff', 'morning', 'normal', 'limited', 'task6-service-call'),
  ('00000000-0000-4000-8000-000000018122', '00000000-0000-4000-8000-000000018100',
   pg_catalog.now(), '8928308280fffff', 'morning', 'normal', 'limited', 'task6-owner-call');
insert into public.identity_proposals (
  sighting_id, proposed_animal_id, proposer_id, source, status,
  model_version, confidence_band, reasons, reviewed_at
) values (
  '00000000-0000-4000-8000-000000018120',
  '00000000-0000-4000-8000-000000018110', null, 'ai_candidate',
  'tentative', 'legacy-model.v1', 'possible', '["legacy safe reason"]'::jsonb, null
);
insert into private.ai_identity_requests (request_id, payload_hash, proposal_id)
select
  '00000000-0000-4000-8000-000000018150', repeat('a', 64), proposals.id
from public.identity_proposals as proposals
where proposals.sighting_id = '00000000-0000-4000-8000-000000018120';
insert into public.match_reviews (proposal_id, reviewer_id, decision, rationale, request_id)
select proposals.id, '00000000-0000-4000-8000-000000018101', 'needs_more_evidence',
  'Historical review remains an immutable record.', '00000000-0000-4000-8000-000000018151'
from public.identity_proposals as proposals
where proposals.sighting_id = '00000000-0000-4000-8000-000000018120';
set local session_replication_role = origin;

create temporary table pg_temp.task6_legacy_history_before as
select
  (select pg_catalog.count(*)
     from private.ai_identity_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000018150') as legacy_request_count,
  (select pg_catalog.count(*)
     from public.identity_proposals as proposals
    where proposals.sighting_id = '00000000-0000-4000-8000-000000018120') as proposal_count,
  (select pg_catalog.count(*)
     from public.match_reviews as reviews
     join public.identity_proposals as proposals on proposals.id = reviews.proposal_id
    where proposals.sighting_id = '00000000-0000-4000-8000-000000018120') as review_count,
  (select pg_catalog.count(*) from private.identity_assistance_service_requests) as service_request_count,
  (select pg_catalog.count(*) from private.identity_assistance_candidates) as candidate_count;
select is(
  (select concat_ws(
    '|', proposals.source, proposals.status::text, proposals.model_version,
    proposals.confidence_band, proposals.reasons::text, reviews.decision
  )
     from public.identity_proposals as proposals
     join private.ai_identity_requests as requests on requests.proposal_id = proposals.id
     join public.match_reviews as reviews on reviews.proposal_id = proposals.id
    where requests.request_id = '00000000-0000-4000-8000-000000018150'),
  'ai_candidate|tentative|legacy-model.v1|possible|["legacy safe reason"]|needs_more_evidence',
  'historical legacy request, proposal, and review provenance is present before denial calls'
);

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000018121',
    '00000000-0000-4000-8000-000000018110',
    'legacy-model.v1', 'possible', '["legacy safe reason"]'::jsonb,
    '00000000-0000-4000-8000-000000018171')$$,
  '42501', null,
  'service_role cannot execute the permanently disabled legacy bridge'
);
reset role;
select pg_catalog.set_config('request.jwt.claim.role', '', true);

select throws_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000018122',
    '00000000-0000-4000-8000-000000018110',
    'legacy-model.v1', 'possible', '["legacy safe reason"]'::jsonb,
    '00000000-0000-4000-8000-000000018172')$$,
  '42501', 'legacy_ai_identity_proposal_disabled',
  'an owner diagnostic call reaches the permanently disabled body'
);
select throws_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    null, null, null, null, null, null)$$,
  '42501', 'legacy_ai_identity_proposal_disabled',
  'null legacy parameters cannot restore validation behavior'
);
select throws_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000018122',
    '00000000-0000-4000-8000-000000018110',
    'legacy-model.v1', 'possible', '["legacy safe reason"]'::jsonb,
    '00000000-0000-4000-8000-000000018172')$$,
  '42501', 'legacy_ai_identity_proposal_disabled',
  'an exact old payload and request ID remain disabled'
);
select throws_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000018122',
    '00000000-0000-4000-8000-000000018110',
    'legacy-model.v2', 'likely', '["changed old payload"]'::jsonb,
    '00000000-0000-4000-8000-000000018172')$$,
  '42501', 'legacy_ai_identity_proposal_disabled',
  'a conflicting old payload and duplicate request ID remain disabled'
);

select is(
  (select pg_catalog.count(*)
     from private.ai_identity_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000018150'),
  (select history.legacy_request_count from pg_temp.task6_legacy_history_before as history),
  'migration and denial calls preserve the historical legacy request row'
);
select is(
  (select pg_catalog.count(*)
     from public.identity_proposals as proposals
    where proposals.sighting_id = '00000000-0000-4000-8000-000000018120'),
  (select history.proposal_count from pg_temp.task6_legacy_history_before as history),
  'migration and denial calls preserve the historical proposal row'
);
select is(
  (select pg_catalog.count(*)
     from public.match_reviews as reviews
     join public.identity_proposals as proposals on proposals.id = reviews.proposal_id
    where proposals.sighting_id = '00000000-0000-4000-8000-000000018120'),
  (select history.review_count from pg_temp.task6_legacy_history_before as history),
  'migration and denial calls preserve the linked historical review row'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_service_requests),
  (select history.service_request_count from pg_temp.task6_legacy_history_before as history),
  'legacy history is not converted into the Task 4/5 service ledger'
);
select is(
  (select pg_catalog.count(*) from private.identity_assistance_candidates),
  (select history.candidate_count from pg_temp.task6_legacy_history_before as history),
  'legacy history is not converted into Task 5 candidate rows'
);
select is(
  (select pg_catalog.count(*)
     from public.identity_proposals as proposals
    where proposals.sighting_id = '00000000-0000-4000-8000-000000018121'),
  0::bigint,
  'the denied service call creates no new proposal'
);
select is(
  (select pg_catalog.count(*)
     from private.ai_identity_requests as requests
    where requests.request_id = '00000000-0000-4000-8000-000000018171'),
  0::bigint,
  'the denied service call creates no legacy request-ledger row'
);
select is(
  (select pg_catalog.count(*)
     from audit.access_audit as audit_rows
    where audit_rows.action = 'ai_identity_proposal_submit'
      and audit_rows.request_id = '00000000-0000-4000-8000-000000018171'),
  0::bigint,
  'the denied service call creates no legacy audit row'
);

select * from finish();
rollback;
