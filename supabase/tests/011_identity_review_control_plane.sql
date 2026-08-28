begin;
select no_plan();

select has_function(
  'public', 'submit_identity_proposal', array['uuid', 'uuid', 'text', 'uuid'],
  'contributors use one fixed-path identity proposal RPC'
);
select has_function(
  'public', 'review_identity_proposal', array['uuid', 'text', 'text', 'uuid'],
  'trusted reviewers use one atomic identity review RPC'
);
select has_function(
  'public', 'service_submit_ai_identity_proposal', array['uuid', 'uuid', 'text', 'text', 'jsonb', 'uuid'],
  'AI candidates use one fixed service-only proposal RPC'
);

select ok(not has_table_privilege('authenticated', 'public.identity_proposals', 'insert'),
  'authenticated callers cannot forge identity proposals');
select ok(not has_table_privilege('authenticated', 'public.identity_proposals', 'update'),
  'authenticated callers cannot forge proposal outcomes');
select ok(not has_table_privilege('authenticated', 'public.identity_proposals', 'delete'),
  'authenticated callers cannot erase identity history');
select ok(not has_table_privilege('authenticated', 'public.match_reviews', 'insert'),
  'authenticated callers cannot forge match reviews');
select ok(not has_table_privilege('authenticated', 'public.match_reviews', 'update'),
  'authenticated callers cannot rewrite match reviews');
select ok(not has_table_privilege('authenticated', 'public.match_reviews', 'delete'),
  'authenticated callers cannot erase match reviews');
select ok(not has_table_privilege('service_role', 'public.identity_proposals', 'insert'),
  'service role cannot bypass the fixed AI proposal RPC');
select ok(not has_table_privilege('service_role', 'public.identity_proposals', 'update'),
  'service role cannot forge terminal proposal state');
select ok(not has_table_privilege('service_role', 'public.match_reviews', 'insert'),
  'service role cannot forge a human review');

set local session_replication_role = replica;
insert into public.user_profiles (id, public_name, adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000001100', 'Proposal Owner', now()),
  ('00000000-0000-4000-8000-000000001101', 'Trusted Reviewer', now()),
  ('00000000-0000-4000-8000-000000001102', 'Other Reporter', now()),
  ('00000000-0000-4000-8000-000000001103', 'Animal Creator', now()),
  ('00000000-0000-4000-8000-000000001104', 'Regular User', now()),
  ('00000000-0000-4000-8000-000000001105', 'Revoked Reviewer', now()),
  ('00000000-0000-4000-8000-000000001106', 'Second Reviewer', now()),
  ('00000000-0000-4000-8000-000000001107', 'Minor User', null);
set local session_replication_role = origin;

insert into public.role_grants (user_id, role, provisional_until, revoked_at) values
  ('00000000-0000-4000-8000-000000001100', 'trusted_contributor', null, null),
  ('00000000-0000-4000-8000-000000001101', 'trusted_contributor', null, null),
  ('00000000-0000-4000-8000-000000001102', 'trusted_contributor', null, null),
  ('00000000-0000-4000-8000-000000001103', 'area_steward', null, null),
  ('00000000-0000-4000-8000-000000001105', 'trusted_contributor', null, now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000001106', 'platform_admin', null, null);

insert into public.animals (id, primary_alias, profile_created_by, visibility) values
  ('00000000-0000-4000-8000-000000001200', 'Existing Cat', '00000000-0000-4000-8000-000000001103', 'limited'),
  ('00000000-0000-4000-8000-000000001201', 'Already Linked Cat', '00000000-0000-4000-8000-000000001101', 'limited'),
  ('00000000-0000-4000-8000-000000001202', 'Deletion Target Cat', '00000000-0000-4000-8000-000000001101', 'limited');

insert into public.sightings (
  id, animal_id, reporter_id, occurred_at, public_cell_id, time_bucket,
  risk, visibility, client_dedupe_key
) values
  ('00000000-0000-4000-8000-000000001300', null, '00000000-0000-4000-8000-000000001100', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-1300'),
  ('00000000-0000-4000-8000-000000001301', null, '00000000-0000-4000-8000-000000001102', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-1301'),
  ('00000000-0000-4000-8000-000000001302', null, '00000000-0000-4000-8000-000000001100', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-1302'),
  ('00000000-0000-4000-8000-000000001303', null, '00000000-0000-4000-8000-000000001100', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-1303'),
  ('00000000-0000-4000-8000-000000001304', '00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000001100', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-1304'),
  ('00000000-0000-4000-8000-000000001305', null, '00000000-0000-4000-8000-000000001100', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-1305'),
  ('00000000-0000-4000-8000-000000001306', null, '00000000-0000-4000-8000-000000001100', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-1306'),
  ('00000000-0000-4000-8000-000000001307', null, '00000000-0000-4000-8000-000000001100', now(), '8928308280fffff', 'morning', 'normal', 'limited', 'identity-1307');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001200',
    'cat-embed.v1', 'possible', '["numeric score 0.9"]'::jsonb,
    '00000000-0000-4000-8000-000000001450')$$,
  '22023', 'invalid_ai_identity_proposal', 'service AI provenance rejects sensitive reason payloads'
);
select throws_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001200',
    null, null, '["similar face and coat"]'::jsonb,
    '00000000-0000-4000-8000-000000001451')$$,
  '22023', 'invalid_ai_identity_proposal', 'service AI provenance requires a bounded model version and confidence band'
);
select lives_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001200',
    'cat-embed.v1', 'possible', '["similar face and coat"]'::jsonb,
    '00000000-0000-4000-8000-000000001452')$$,
  'the trusted service boundary can create a bounded tentative AI candidate'
);
select lives_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001200',
    'cat-embed.v1', 'possible', '["similar face and coat"]'::jsonb,
    '00000000-0000-4000-8000-000000001452')$$,
  'an exact AI proposal retry succeeds'
);
select throws_ok(
  $$select * from public.service_submit_ai_identity_proposal(
    '00000000-0000-4000-8000-000000001301',
    '00000000-0000-4000-8000-000000001200',
    'cat-embed.v2', 'likely', '["similar face and coat"]'::jsonb,
    '00000000-0000-4000-8000-000000001452')$$,
  'P0001', 'idempotency_conflict', 'conflicting AI request reuse fails closed'
);
reset role;
select is(
  (select concat_ws('|', proposer_id::text, source, model_version, confidence_band, reasons::text)
     from public.identity_proposals where id = (
       select proposal_id from private.ai_identity_requests
       where request_id = '00000000-0000-4000-8000-000000001452'
     )),
  'ai_candidate|cat-embed.v1|possible|["similar face and coat"]',
  'AI candidate storage contains broad bands and safe reasons but no user proposer'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001300',
    '00000000-0000-4000-8000-000000001200',
    'manual_search', '00000000-0000-4000-8000-000000001400')$$,
  '42501', null, 'anonymous callers cannot submit identity proposals'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001107', true);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001300',
    '00000000-0000-4000-8000-000000001200',
    'manual_search', '00000000-0000-4000-8000-000000001401')$$,
  '42501', 'adult_contributor_required', 'adult confirmation is required'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001100', true);
select lives_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001300',
    '00000000-0000-4000-8000-000000001200',
    'manual_search', '00000000-0000-4000-8000-000000001402')$$,
  'a reporter can submit a manual existing-animal proposal'
);
select is(
  (select concat_ws('|', source, status::text, proposer_id::text, proposed_animal_id::text, model_version, confidence_band, reasons::text)
     from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
  'manual_search|tentative|00000000-0000-4000-8000-000000001100|00000000-0000-4000-8000-000000001200|[]',
  'manual proposal provenance cannot contain AI-controlled fields'
);
select lives_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001300',
    '00000000-0000-4000-8000-000000001200',
    'manual_search', '00000000-0000-4000-8000-000000001402')$$,
  'an exact proposal retry succeeds'
);
select is(
  (select count(*) from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
  1::bigint, 'an exact proposal retry creates one row'
);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001300', null,
    'new_animal', '00000000-0000-4000-8000-000000001402')$$,
  'P0001', 'idempotency_conflict', 'conflicting proposal request reuse fails closed'
);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001300', null,
    'new_animal', '00000000-0000-4000-8000-000000001403')$$,
  'P0001', 'identity_proposal_already_active', 'a sighting has only one active proposal'
);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001301', null,
    'new_animal', '00000000-0000-4000-8000-000000001404')$$,
  '42501', 'identity_sighting_owner_required', 'a contributor cannot propose for another reporter'
);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001302',
    '00000000-0000-4000-8000-000000001200',
    'ai_candidate', '00000000-0000-4000-8000-000000001405')$$,
  '22023', 'invalid_identity_proposal', 'authenticated callers cannot impersonate AI provenance'
);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001302', null,
    'manual_search', '00000000-0000-4000-8000-000000001406')$$,
  '22023', 'invalid_identity_proposal', 'manual search requires an animal'
);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001302',
    '00000000-0000-4000-8000-000000001200',
    'new_animal', '00000000-0000-4000-8000-000000001407')$$,
  '22023', 'invalid_identity_proposal', 'new-animal outcomes cannot select an animal'
);
select throws_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001304',
    '00000000-0000-4000-8000-000000001200',
    'manual_search', '00000000-0000-4000-8000-000000001408')$$,
  'P0001', 'identity_sighting_already_linked', 'identity control cannot overwrite a linked sighting'
);
select lives_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001302',
    '00000000-0000-4000-8000-000000001200',
    'manual_search', '00000000-0000-4000-8000-000000001409')$$,
  'a second owned sighting can receive a proposal'
);
select lives_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001303', null,
    'new_animal', '00000000-0000-4000-8000-000000001410')$$,
  'a reporter can submit a new-animal outcome'
);
select lives_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001305',
    '00000000-0000-4000-8000-000000001200',
  'manual_search', '00000000-0000-4000-8000-000000001411')$$,
  'a third owned sighting can receive a proposal for rejection coverage'
);
select lives_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001306',
    '00000000-0000-4000-8000-000000001200',
    'manual_search', '00000000-0000-4000-8000-000000001412')$$,
  'a proposal can be prepared for sighting-erasure coverage'
);
select lives_ok(
  $$select * from public.submit_identity_proposal(
    '00000000-0000-4000-8000-000000001307',
    '00000000-0000-4000-8000-000000001202',
    'manual_search', '00000000-0000-4000-8000-000000001413')$$,
  'a proposal can be prepared for target-erasure coverage'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001104', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'confirm', 'Independent evidence supports this match.', '00000000-0000-4000-8000-000000001500')$$,
  '42501', 'trusted_identity_reviewer_required', 'a regular user cannot review identity'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001100', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'confirm', 'Independent evidence supports this match.', '00000000-0000-4000-8000-000000001501')$$,
  '42501', 'identity_reviewer_recusal_required', 'the proposer and reporter must recuse'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001103', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'confirm', 'Independent evidence supports this match.', '00000000-0000-4000-8000-000000001502')$$,
  '42501', 'identity_reviewer_recusal_required', 'the proposed animal profile creator must recuse'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001102', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals
      where sighting_id = '00000000-0000-4000-8000-000000001301'),
    'confirm', 'Independent evidence supports this match.', '00000000-0000-4000-8000-000000001509')$$,
  '42501', 'identity_reviewer_recusal_required', 'the sighting reporter must recuse from a service proposal'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001105', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'confirm', 'Independent evidence supports this match.', '00000000-0000-4000-8000-000000001503')$$,
  '42501', 'trusted_identity_reviewer_required', 'a revoked reviewer cannot act'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001101', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'needs_more_evidence', 'Photo taken at 1.35210, 103.81980.', '00000000-0000-4000-8000-000000001510')$$,
  '22023', 'invalid_identity_review', 'review rationale rejects precise coordinates'
);
select lives_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'needs_more_evidence', 'A second clear angle is still required.', '00000000-0000-4000-8000-000000001504')$$,
  'a trusted independent reviewer can request more evidence'
);
reset role;
select is(
  (select status::text from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
  'tentative', 'needs-more-evidence leaves the proposal tentative'
);
select is(
  (select animal_id from public.sightings where id = '00000000-0000-4000-8000-000000001300'),
  null::uuid, 'needs-more-evidence does not link the sighting'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001101', true);
select lives_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'needs_more_evidence', 'A second clear angle is still required.', '00000000-0000-4000-8000-000000001504')$$,
  'an exact review retry succeeds'
);
select is(
  (select count(*) from public.match_reviews where proposal_id =
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300')),
  1::bigint, 'an exact review retry creates one review row'
);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'confirm', 'Independent evidence supports this match.', '00000000-0000-4000-8000-000000001504')$$,
  'P0001', 'idempotency_conflict', 'conflicting review request reuse fails closed'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001106', true);
select lives_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'confirm', 'Independent evidence supports this match.', '00000000-0000-4000-8000-000000001505')$$,
  'a second independent reviewer can confirm after more evidence arrives'
);
reset role;
select is(
  (select status::text from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
  'confirmed', 'confirm creates the terminal proposal state'
);
select is(
  (select animal_id from public.sightings where id = '00000000-0000-4000-8000-000000001300'),
  '00000000-0000-4000-8000-000000001200'::uuid,
  'confirm atomically links the sighting to the proposed animal'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001106', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300'),
    'reject', 'Later evidence contradicts this match.', '00000000-0000-4000-8000-000000001506')$$,
  'P0001', 'identity_proposal_not_actionable', 'terminal proposals cannot be reviewed again'
);
select lives_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001305'),
    'reject', 'Visible markings contradict this match.', '00000000-0000-4000-8000-000000001507')$$,
  'an independent reviewer can reject a tentative proposal'
);
reset role;
select is(
  (select animal_id from public.sightings where id = '00000000-0000-4000-8000-000000001305'),
  null::uuid, 'rejection never links a sighting'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001106', true);
select lives_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001303'),
    'confirm', 'Evidence supports treating this as a new cat.', '00000000-0000-4000-8000-000000001508')$$,
  'an independent reviewer can confirm a new-animal outcome'
);
reset role;
select is(
  (select concat_ws('|', p.status::text, s.animal_id::text)
     from public.identity_proposals p join public.sightings s on s.id = p.sighting_id
    where p.sighting_id = '00000000-0000-4000-8000-000000001303'),
  'confirmed', 'new-animal confirmation does not silently create or link a profile'
);
reset role;

select throws_ok(
  $$update public.match_reviews set rationale = 'rewritten' where proposal_id =
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300')$$,
  '42501', 'match_reviews_append_only', 'match reviews are append-only'
);
select throws_ok(
  $$delete from public.match_reviews where proposal_id =
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001300')$$,
  '42501', 'match_reviews_append_only', 'match reviews cannot be erased'
);
select is(
  (select count(*) from audit.access_audit where action = 'identity_proposal_submit' and request_id = '00000000-0000-4000-8000-000000001402'),
  1::bigint, 'an exact proposal retry creates one audit event'
);
select is(
  (select count(*) from audit.access_audit where action = 'identity_proposal_review' and request_id = '00000000-0000-4000-8000-000000001504'),
  1::bigint, 'an exact review retry creates one audit event'
);

select lives_ok(
  $$delete from public.animals where id = '00000000-0000-4000-8000-000000001202'$$,
  'deleting an identity target preserves proposal history without blocking erasure'
);
select is(
  (select proposed_animal_id from public.identity_proposals
    where sighting_id = '00000000-0000-4000-8000-000000001307'),
  null::uuid, 'target erasure clears the proposal foreign key'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000001106', true);
select throws_ok(
  $$select * from public.review_identity_proposal(
    (select id from public.identity_proposals where sighting_id = '00000000-0000-4000-8000-000000001307'),
    'confirm', 'Independent evidence supports this match.', '00000000-0000-4000-8000-000000001511')$$,
  'P0001', 'identity_animal_not_available', 'an erased target cannot be misread as a new-animal outcome'
);
reset role;

select lives_ok(
  $$delete from public.sightings where id = '00000000-0000-4000-8000-000000001306'$$,
  'sighting erasure cascades through its tentative proposal and request ledger'
);
select is(
  (select count(*) from public.identity_proposals
    where sighting_id = '00000000-0000-4000-8000-000000001306'),
  0::bigint, 'sighting erasure removes the dependent proposal'
);
select is(
  (select count(*) from private.identity_requests
    where request_id = '00000000-0000-4000-8000-000000001412'),
  0::bigint, 'proposal erasure removes the dependent idempotency row'
);

select lives_ok(
  $$delete from public.user_profiles where id = '00000000-0000-4000-8000-000000001101'$$,
  'reviewer account erasure anonymizes append-only review history'
);
select is(
  (select count(*) from public.match_reviews reviews
    join public.identity_proposals proposals on proposals.id = reviews.proposal_id
    where proposals.sighting_id = '00000000-0000-4000-8000-000000001300'
      and reviews.reviewer_id is null),
  1::bigint, 'reviewer erasure clears only reviewer identity and preserves the review decision'
);

select * from finish();
rollback;
