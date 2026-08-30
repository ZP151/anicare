# AI Identity Service Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the private database lifecycle and broker-facing service RPC portion of A1 so identity jobs can be safely leased, completed, failed, expired, invalidated, and cleaned without enabling a worker, mobile flow, signed media fetch, live model, or public identity claim.

**Architecture:** Forward-only PostgreSQL migrations first harden the dormant job schema, then correct the shared lock order and integrate identity invalidation into existing media/account/animal/review transactions. Only after those safety boundaries pass do service-role-only claim/fail/cleanup and completion RPCs become executable. A private child ledger makes bounded multi-job claim responses replayable without JSON payload storage. Edge broker authentication, media capabilities, contributor RPCs, mobile/admin UI, and live inference remain separate later slices.

**Tech Stack:** PostgreSQL 17 local Supabase runtime, Supabase CLI 2.84.2, pgTAP, TypeScript/Python repository gates, PowerShell.

**Spec:** `docs/superpowers/specs/2026-08-29-ai-identity-assistance-provenance-design.md`, especially sections 3–7, 10–13 and acceptance criteria 1–7.

## Global Constraints

- Identity assistance remains disabled by default. This plan creates no Edge endpoint, worker credential, mobile/admin route, public URL, signed media URL, Storage fetch, model invocation, queue deployment, or scheduler deployment.
- The database is authoritative for job state, leases, idempotency, provenance, invalidation, and cleanup. A later worker remains untrusted and never receives a service-role key, database password, Storage credential, or user JWT.
- Every callable service RPC independently requires `auth.role() = 'service_role'`, is `security definer`, uses `set search_path = pg_catalog`, and is executable only by `service_role`. Direct table access stays revoked from `public`, `anon`, `authenticated`, and `service_role`.
- Acquire a request-scoped advisory transaction lock before resource row locks. The shared row-lock order is account/role when applicable → sighting → `private.media_upload_jobs` → `public.media_assets` → `private.identity_assistance_jobs` → `public.identity_proposals` → `public.match_reviews`; lock multiple rows of one class by UUID ascending.
- Worker leases last exactly 2 minutes and attempts are numbered 1–3. An expired attempt 1 or 2 returns to `requested`; an expired attempt 3 becomes terminal `failed` with `lease_expired`. A stale or expired lease never completes or fails a newer attempt.
- Candidate completion contains 0–3 unique, contiguous ranks derived from array order, active animals only, bands `likely | possible | weak`, and 1–4 per-candidate reason codes from `face_pattern_similar | ear_shape_similar | coat_marking_similar | view_angle_limited | image_quality_limited`.
- Store no bucket/path, signed URL, image bytes, vector, embedding, numeric similarity score, precise location, arbitrary worker text, arbitrary JSON event payload, bearer token, exception text, or raw model evidence.
- Deletion and erasure are transactional logical invalidation. Physical Storage deletion remains the existing post-commit operation and is not claimed complete by these migrations.
- The repository-only caller search can justify removing the legacy function from repository code, but it does not prove that no deployed external caller exists. Keep the feature flag off and record deployed-caller enumeration as an external enablement gate.
- Tests are written and observed failing before each production migration. The RED failure must name the missing guard/function/transition, not a syntax, fixture, Docker, or environment error.
- Do not edit prior migrations. Every database behavior change is a new forward migration; rollback is another forward migration that first disables entry points and drains leases.

---

### Task 1: Add private state-machine guards and replayable claim metadata

**Files:**

- Create: `supabase/migrations/202608310002_identity_assistance_state_guards.sql`
- Create: `supabase/tests/013_identity_assistance_state_guards.sql`
- Modify: `supabase/tests/012_identity_assistance_job_foundation.sql`

**Interfaces:**

- Consumes: all seven private identity tables and enum types from `202608310001_identity_assistance_job_foundation.sql`.
- Produces: `private.identity_assistance_claim_results`, guarded job/candidate mutation contexts, legal transition enforcement, immutable request/completion provenance, and candidate-result invalidation on animal unavailability.
- Produces no executable public/service RPC and no direct grant.

- [ ] **Step 1: Write failing guard and replay-ledger pgTAP tests**

Create `013_identity_assistance_state_guards.sql` with real fixtures and literal assertions proving these breaks:

```sql
select has_table('private', 'identity_assistance_claim_results',
  'bounded claim replay metadata exists');
select throws_ok(
  $$update private.identity_assistance_jobs
       set recipe_version = 'different.v1'
     where id = '00000000-0000-4000-8000-000000001810'$$,
  '42501', 'identity_assistance_job_provenance_immutable',
  'request provenance cannot be rewritten');
select throws_ok(
  $$insert into private.identity_assistance_candidates
      (job_id, rank, animal_id, confidence_band, reason_codes)
    values ('00000000-0000-4000-8000-000000001810', 1,
      '00000000-0000-4000-8000-000000001820', 'likely',
      array['face_pattern_similar']::private.identity_assistance_reason_code[])$$,
  '42501', 'identity_assistance_candidate_write_forbidden',
  'candidate rows are writable only inside the completion boundary');
```

Also assert:

1. `identity_assistance_claim_results` has primary key `(request_id, ordinal)`, unique `(request_id, job_id)`, ordinal `1..10`, attempt `1..3`, a lease UUID, lease expiry later than creation, and `on delete cascade` to `identity_assistance_service_requests(request_id)`.
2. All four direct roles have no table privileges and RLS is enabled.
3. A processing/actionable-succeeded job must retain non-null requester/media/hash binding; terminal or invalidated cleanup may null it. Requested rows remain dormant until a later contributor RPC validates and binds media, while the claim function in Task 4 refuses any unbound row.
4. Attempts cannot decrease, and status transitions outside `requested -> processing`, `processing -> requested|succeeded|failed|cancelled`, and actionable `succeeded -> cancelled|expired` fail.
5. Recipe/crop/embedding/identify contract versions, sighting/media/requester binding, requested time, purpose, and notice version are immutable after insert.
6. Completion provenance is immutable after `succeeded`; candidates cannot be updated and can be deleted only under the scoped cleanup/invalidation context.
7. An animal becoming archived/hidden or being deleted invalidates every candidate set containing it, purges every candidate for those jobs, clears the input hash, and does not block the animal change.

Update the schema-only candidate fixtures in `012_identity_assistance_job_foundation.sql` so job `...1860` is a valid processing job bound to a canonical finalized `media-staging` asset/upload-job fixture for sighting `...1811`. Route every candidate constraint probe through that one processing job, then set the test-only local completion context around those probes:

```sql
select set_config(
  'private.identity_assistance_candidate_writer',
  '00000000-0000-4000-8000-000000001810', true
);
-- existing candidate constraint probes
select set_config('private.identity_assistance_candidate_writer', '', true);
```

- [ ] **Step 2: Run RED**

Run:

```powershell
supabase test db
```

Expected: test 013 fails because `identity_assistance_claim_results` and the mutation guards do not exist. Repair only fixture issues until this is the observed failure.

- [ ] **Step 3: Add the claim replay table**

Create the forward migration in `begin`/`commit` and add:

```sql
create table private.identity_assistance_claim_results (
  request_id uuid not null references private.identity_assistance_service_requests(request_id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 10),
  job_id uuid not null references private.identity_assistance_jobs(id) on delete cascade,
  lease_id uuid not null,
  attempt integer not null check (attempt between 1 and 3),
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (request_id, ordinal),
  unique (request_id, job_id),
  check (lease_expires_at > created_at)
);
alter table private.identity_assistance_claim_results enable row level security;
revoke all on table private.identity_assistance_claim_results
  from public, anon, authenticated, service_role;
```

- [ ] **Step 4: Add exact job and candidate mutation guards**

Create private trigger functions with `set search_path = pg_catalog`:

- `private.guard_identity_assistance_job_mutation()` permits inserts that satisfy the foundation constraints; on update it requires `current_setting('private.identity_assistance_job_writer', true) = old.id::text`, preserves the immutable request fields, preserves succeeded completion fields, enforces allowed transitions and nondecreasing attempts, and otherwise raises the exact bounded errors tested in Step 1. A delete requires `current_setting('private.identity_assistance_job_deleter', true) = old.id::text` so only governed cleanup can remove operational rows.
- `private.guard_identity_assistance_candidate_mutation()` requires the candidate-writer context to equal `job_id` for insert/delete and always rejects update. Insert additionally requires the referenced job to be `processing` under the same transaction; the completion RPC will insert candidates before atomically moving that job to `succeeded`.
- `private.invalidate_identity_assistance_candidate_sets()` runs before an animal becomes archived/hidden or is deleted, locks affected job IDs in UUID order, sets the job-writer/candidate-writer contexts per job, purges the complete candidate set, sets `result_invalidated_at` and `withdrawn_at`, clears `input_sha256`, and appends one bounded `invalidated/source_invalidated` event per job.

Use scoped GUCs only as defence in depth. Security still relies on zero direct table grants plus narrow security-definer functions; never grant callers permission merely because triggers exist.

- [ ] **Step 5: Run GREEN and database lint**

Run:

```powershell
supabase test db
supabase db lint --level warning
```

Expected: all pgTAP files pass; warning-level lint adds no warning caused by this migration.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/202608310002_identity_assistance_state_guards.sql `
  supabase/tests/013_identity_assistance_state_guards.sql `
  supabase/tests/012_identity_assistance_job_foundation.sql
git commit -m "feat(ai): guard identity job state"
```

---

### Task 2: Correct media-deletion lock order and invalidate identity work atomically

**Files:**

- Create: `supabase/migrations/202608310003_identity_assistance_media_invalidation.sql`
- Create: `supabase/tests/014_identity_assistance_media_invalidation.sql`
- Modify: `supabase/tests/002_media_upload_privacy.sql`

**Interfaces:**

- Consumes: `public.server_request_media_deletion(uuid, uuid)`, media upload/asset bindings, Task 1 guarded mutation contexts, identity jobs/candidates/evidence/events.
- Produces: the same public deletion signature and response, with sighting → upload job → media asset → identity job → proposal/review lock order and same-transaction invalidation.

- [ ] **Step 1: Write failing media deletion/invalidation tests**

Seed requested, processing, successful-unselected, and selected-tentative jobs against finalized media. Assert deletion:

```sql
select lives_ok(
  $$select * from public.server_request_media_deletion(
    '00000000-0000-4000-8000-000000001900',
    '00000000-0000-4000-8000-000000001930')$$,
  'owned media deletion atomically invalidates identity work');
select is(
  (select count(*) from private.identity_assistance_candidates
    where job_id = '00000000-0000-4000-8000-000000001940'),
  0::bigint, 'deletion purges the full candidate set');
select is(
  (select input_sha256 from private.identity_assistance_jobs
    where id = '00000000-0000-4000-8000-000000001940'),
  null::text, 'deletion clears the inference fingerprint');
```

Also prove:

1. Requested/processing jobs become `cancelled`, leases and processing timestamps clear, `cancelled_at`, `withdrawn_at`, and `result_invalidated_at` are set.
2. Successful-unselected jobs become non-actionable, purge candidates/hash, and cannot later be selected.
3. Selected tentative AI proposals tied through `identity_proposal_evidence` are deleted as withdrawn work, while one minimized invalidation event remains; no false human rejection review is created.
4. Evidence media/selector references are nulled before asset tombstoning where detailed evidence remains.
5. Exact deletion retries retain existing safe delete behavior and never recreate results.
6. A stale processing-state mutation after the tombstone fails because the job is already cancelled and its lease has been cleared.
7. The existing Storage deletion response remains exactly `{storage_bucket, storage_path, remove_immediately}` for the trusted Edge caller; no new identity field/path is added.

- [ ] **Step 2: Run RED**

Run `supabase test db` and observe test 014 fail because deletion leaves the identity job actionable.

- [ ] **Step 3: Replace the deletion function in a forward migration**

Recreate `public.server_request_media_deletion(p_actor_id uuid, p_media_id uuid)` with its existing return type and authorization. First read linkage without row locks, take the advisory lock, then lock and re-read in this order:

```sql
perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('media-delete:' || p_media_id::text, 0));
perform 1 from public.sightings s where s.id = discovered_sighting_id for update;
select * into job from private.media_upload_jobs j
  where j.media_asset_id = p_media_id order by j.id for update;
select * into asset from public.media_assets m where m.id = p_media_id for update;
```

Then lock matching identity jobs by UUID, apply Task 1 scoped writer contexts, purge candidates/hash/lease state, remove still-tentative evidence-backed proposals without creating a review, append bounded invalidation events, tombstone the media, and preserve the existing staged/non-staged physical-deletion response behavior.

- [ ] **Step 4: Run GREEN and legacy media regression suite**

Run:

```powershell
supabase test db
pnpm --filter @animalhelper/edge-functions test
```

Expected: database tests and existing delete/cleanup Edge contracts pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/202608310003_identity_assistance_media_invalidation.sql `
  supabase/tests/014_identity_assistance_media_invalidation.sql `
  supabase/tests/002_media_upload_privacy.sql
git commit -m "feat(ai): invalidate identity jobs on media deletion"
```

---

### Task 3: Integrate account erasure, animal invalidation, and review lock order

**Files:**

- Create: `supabase/migrations/202608310004_identity_assistance_erasure_locking.sql`
- Create: `supabase/tests/015_identity_assistance_erasure_locking.sql`
- Modify: `supabase/tests/006_account_erasure_and_block_oracle.sql`
- Modify: `supabase/tests/011_identity_review_control_plane.sql`

**Interfaces:**

- Consumes: consolidated `private.prepare_user_profile_account_erasure()`, Task 1 animal trigger, `public.review_identity_proposal(...)`, identity evidence and requester/selector references.
- Produces: one consolidated account-erasure path, account → sighting → upload → asset → job → proposal → review ordering, and preserved existing review behavior.

- [ ] **Step 1: Write failing erasure and ordering behavior tests**

Prove that deleting a requester account:

- cancels its requested/processing/unselected-successful work;
- purges candidates and input fingerprints;
- clears requester/selector identity and request ledgers;
- preserves only bounded non-identifying invalidation/decision integrity;
- schedules existing media cleanup exactly as before;
- does not add a second profile trigger.

Prove animal archive/hide/delete invalidates all containing sets, and review of an evidence-backed proposal cannot commit after source invalidation. Preserve every existing manual proposal/review assertion from test 011.

- [ ] **Step 2: Run RED**

Run `supabase test db` and observe account deletion leave at least one actionable job or candidate fingerprint.

- [ ] **Step 3: Replace the consolidated erasure and review functions**

Recreate `private.prepare_user_profile_account_erasure()` in the forward migration, preserving legacy media/moderation/audit pseudonymization while acquiring and revalidating the documented lock order. Iterate ordered identity job IDs and use Task 1 contexts to cancel/invalidate, purge candidates/hash/lease fields, null evidence media/selector references, and append bounded events.

Recreate `public.review_identity_proposal(uuid, text, text, uuid)` with unchanged signature, authorization, idempotency, recusal, decisions, responses, audit behavior, and grants. Discover its sighting ID without a row lock, then lock sighting before proposal and re-read the proposal after locking; lock existing reviews last. Do not widen reviewer access or add AI selection behavior.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
supabase test db
supabase db lint --level warning
```

Expected: all account erasure, moderation, identity review, and new identity invalidation tests pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/202608310004_identity_assistance_erasure_locking.sql `
  supabase/tests/015_identity_assistance_erasure_locking.sql `
  supabase/tests/006_account_erasure_and_block_oracle.sql `
  supabase/tests/011_identity_review_control_plane.sql
git commit -m "fix(ai): serialize identity erasure and review"
```

---

### Task 4: Add service claim, retry, failure, and cleanup RPCs

**Files:**

- Create: `supabase/migrations/202608310005_identity_assistance_service_lifecycle.sql`
- Create: `supabase/tests/016_identity_assistance_service_lifecycle.sql`

**Interfaces:**

- Consumes: guarded jobs/events/service requests/claim results from Tasks 1–3.
- Produces: service-role-only `service_claim_identity_assistance_jobs`, `service_fail_identity_assistance_job`, and `service_cleanup_identity_assistance`.

- [ ] **Step 1: Write failing service lifecycle pgTAP tests**

Assert exact signatures and grants, then cover authentication, input bounds, exact replay/conflicting request reuse, `FOR UPDATE SKIP LOCKED`-compatible ordered selection, two-minute leases, attempts 1–3, stale lease rejection, retry release, terminal attempt-three expiry, source invalidation, and bounded cleanup.

The claim projection is exactly:

```text
jobId, mediaAssetId, inputSha256, recipeVersion, cropContractVersion,
embeddingContractVersion, identifyContractVersion, leaseId,
leaseExpiresAt, attempt
```

It contains no object path, bucket, URL, requester ID, sighting ID, location, token, score, or vector.

- [ ] **Step 2: Run RED**

Run `supabase test db` and observe missing service lifecycle functions.

- [ ] **Step 3: Add exact claim function**

Create:

```sql
public.service_claim_identity_assistance_jobs(
  p_worker_id text,
  p_limit integer,
  p_request_id uuid
)
```

Require worker IDs matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, limits `1..10`, and service role. Hash `{operation, workerId, limit}`; exact replays read `identity_assistance_claim_results`, while changed payloads fail `idempotency_conflict`. For a new request, release expired attempts in UUID order, terminally fail attempt three, claim valid `requested` rows ordered by `(requested_at,id)` with `FOR UPDATE SKIP LOCKED`, set attempt + 1 and `lease_expires_at = clock_timestamp() + interval '2 minutes'`, append events, and persist each returned lease row.

- [ ] **Step 4: Add exact fail and cleanup functions**

Create:

```sql
public.service_fail_identity_assistance_job(
  p_job_id uuid,
  p_lease_id uuid,
  p_attempt integer,
  p_failure_code text,
  p_retryable boolean,
  p_request_id uuid
)

public.service_cleanup_identity_assistance(
  p_batch_size integer,
  p_cutoff_time timestamptz,
  p_request_id uuid
)
```

Failure checks an existing idempotency row before requiring a still-current lease. New requests require exact job/lease/attempt and `lease_expires_at > clock_timestamp()` after locking. Retryable attempts below three return to `requested`; all other valid failures become terminal. Cleanup accepts batch `1..50`, rejects future cutoff times, expires unselected successful results at seven days, removes candidate/hash data, and deletes terminal operational rows only after 30 days while leaving minimized events with null job references.

- [ ] **Step 5: Run GREEN and mutation review**

Run `supabase test db` and `supabase db lint --level warning`. Mentally mutate lease comparison from `>` to `>=`, attempt three to four, and replay-before-lease ordering; ensure named tests fail for each mutation.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/202608310005_identity_assistance_service_lifecycle.sql `
  supabase/tests/016_identity_assistance_service_lifecycle.sql
git commit -m "feat(ai): add identity job leasing"
```

---

### Task 5: Add atomic completion and exact candidate persistence

**Files:**

- Create: `supabase/migrations/202608310006_identity_assistance_service_completion.sql`
- Create: `supabase/tests/017_identity_assistance_service_completion.sql`

**Interfaces:**

- Consumes: Task 4 leases and service idempotency, Task 1 guarded candidate boundary, canonical finalized media/upload binding.
- Produces: service-role-only `service_complete_identity_assistance_job` with strict `identify-callback.v1` persistence mapping.

- [ ] **Step 1: Write failing completion tests**

Cover zero/one/three candidates, contiguous array-derived ranks, unique active animals, exact bands/reasons, strict object keys, model version regex, exact callback version, exact replay, conflicting request reuse, expired/stale lease, hash/recipe/media tombstone changes, duplicate successful completion, archived candidate, and completion-vs-deletion source revalidation.

Use literal callback JSON such as:

```json
[
  {
    "animalId": "00000000-0000-4000-8000-000000002101",
    "confidenceBand": "likely",
    "reasonCodes": ["face_pattern_similar", "ear_shape_similar"]
  }
]
```

Reject `rank`, display text, score, vector, path, URL, location, extra keys, flat/free-text reasons, and more than three entries.

- [ ] **Step 2: Run RED**

Run `supabase test db` and observe the completion function is absent.

- [ ] **Step 3: Add strict JSON validation helper and completion RPC**

Create a private immutable validator that accepts only a JSON array of 0–3 exact candidate objects and exact enum reason arrays. Then create:

```sql
public.service_complete_identity_assistance_job(
  p_job_id uuid,
  p_lease_id uuid,
  p_attempt integer,
  p_callback_contract_version text,
  p_model_version text,
  p_candidates jsonb,
  p_new_cat_recommended boolean,
  p_request_id uuid
)
```

Check prior service idempotency before active lease state. For new requests, discover linkage without locks, then lock sighting → upload job → media asset → identity job and revalidate all relationships and `clock_timestamp()` after locks. Set scoped writer contexts, insert candidates with ranks from `WITH ORDINALITY`, move the job to `succeeded`, clear lease fields, set seven-day expiry plus fixed completion provenance, append one completed event, and record the service request in one transaction.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
supabase test db
supabase db lint --level warning
```

Expected: all database contracts pass with no sensitive field in the completion surface.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/202608310006_identity_assistance_service_completion.sql `
  supabase/tests/017_identity_assistance_service_completion.sql
git commit -m "feat(ai): persist bounded identity results"
```

---

### Task 6: Revoke the legacy proposal bridge and record truthful A1.2 status

**Files:**

- Create: `supabase/migrations/202608310007_revoke_legacy_ai_proposal_bridge.sql`
- Create: `supabase/tests/018_revoke_legacy_ai_proposal_bridge.sql`
- Modify: `supabase/tests/011_identity_review_control_plane.sql`
- Modify: `docs/iteration-plan.md`
- Modify: `docs/ai-contracts.md`

**Interfaces:**

- Consumes: repository caller enumeration, completed private service lifecycle, existing disabled feature flag.
- Produces: no executable legacy service-created proposal path; documentation distinguishes database A1.2 from later broker/contributor/live-model work.

- [ ] **Step 1: Enumerate repository callers and write RED revocation test**

Run:

```powershell
rg -n "service_submit_ai_identity_proposal" . `
  -g '!supabase/migrations/202608290001_identity_review_control_plane.sql' `
  -g '!docs/superpowers/**' `
  -g '!.superpowers/**'
```

The only expected executable reference is the old pgTAP success coverage in test 011. Replace that block with a denial assertion and add test 018 proving `service_role` has no execute privilege and the function always raises `legacy_ai_identity_proposal_disabled` if invoked by an owner/superuser test connection.

- [ ] **Step 2: Run RED**

Run `supabase test db` and observe the legacy function remains executable to `service_role`.

- [ ] **Step 3: Revoke and fail closed**

In a forward migration, replace the function body with an unconditional bounded exception, revoke all roles including `service_role`, and do not automatically restore it in any rollback:

```sql
raise exception 'legacy_ai_identity_proposal_disabled' using errcode = '42501';
```

- [ ] **Step 4: Update truthful documentation**

Record that database state guards, erasure integration, leasing, failure, cleanup, and bounded completion exist. Keep these items explicitly open: contributor request/status/cancel/select, worker credential, Edge broker, lease-bound media authorization/fetch, strict network callback adapter, scheduler deployment, hosted concurrency/Storage evidence, mobile/admin A2, dataset/model/ANN A3, legal approval, and pilot readiness.

- [ ] **Step 5: Run full gates**

Run:

```powershell
$repoVenv=(Resolve-Path -LiteralPath '.venv\Scripts').Path
$env:PATH="$repoVenv;$env:PATH"
pnpm pilot-gate-2a
python -m ruff check services/ai
python -m mypy services/ai/src
pnpm verify
git diff --check
```

Expected: database migrations/pgTAP/lint, all repository tests, type checks, builds, native policy gates, Python lint/types, and whitespace checks pass.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/202608310007_revoke_legacy_ai_proposal_bridge.sql `
  supabase/tests/018_revoke_legacy_ai_proposal_bridge.sql `
  supabase/tests/011_identity_review_control_plane.sql `
  docs/iteration-plan.md docs/ai-contracts.md
git commit -m "fix(ai): retire direct service proposals"
```

Do not mark A1, A2, live recognition, Singapore pilot readiness, broker media access, or deployed scheduler evidence complete.
