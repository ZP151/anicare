# AI Identity Job Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the dormant, provenance-bound private database foundation for AI identity-assistance jobs without enabling a worker, contributor flow, model, media fetch, or proposal creation path.

**Architecture:** A new forward-only Supabase migration creates private enum types and seven private control-plane tables. Every table is RLS-enabled and denied to `public`, `anon`, `authenticated`, and `service_role`; later security-definer RPCs will be the only mutation path. Constraints and indexes encode bounded attempts, exact contract versions, one actionable job per sighting, immutable ranked candidates, idempotency ledgers, and path/vector/score-free audit provenance. This sub-project deliberately stops before broker RPCs and erasure integration so its schema can be reviewed independently.

**Tech Stack:** PostgreSQL 15, Supabase migrations, pgTAP, PowerShell, Supabase CLI 2.84.2.

**Spec:** `docs/superpowers/specs/2026-08-29-ai-identity-assistance-provenance-design.md`, sections 4–7, 10–13.

## Global Constraints

- All new job, candidate, request, service-ledger, event, access-audit, and evidence tables live in `private`; no client or service role receives direct table privileges.
- This batch adds no executable contributor, broker, worker, admin, or mobile identity-assistance entry point.
- Identity assistance remains disabled by default; the existing synthetic `/v1/identify` compatibility route remains behind exact `WHISKER_AI_IDENTITY_ASSISTANCE_ENABLED=true` plus the private token.
- Store no storage bucket/path, signed URL, image bytes, vector, embedding, numeric similarity score, precise location, arbitrary worker text, or arbitrary JSON event payload.
- Fix the provenance labels to `identity-assistance.v1`, `jpeg-srgb-2048-q88.v1`, `crop.v1`, `embedding.v1`, and `identify.v1` at request creation; callback version is null before completion and otherwise exactly `identify-callback.v1`.
- Worker lease defaults are not introduced by this schema-only batch; the later broker-RPC plan owns the exact two-minute lease and three-attempt transition behavior. This schema only bounds `attempt_count` to `0..3`.
- Candidates are ranked `1..3`, unique per animal within a job, use only `likely | possible | weak`, and carry one to four exact reason codes from `face_pattern_similar`, `ear_shape_similar`, `coat_marking_similar`, `view_angle_limited`, and `image_quality_limited`.
- Tests must be written and observed failing before the migration is added. The RED failure must name missing database objects, not a syntax or fixture error.
- Do not edit earlier migrations. Add one forward migration and one new pgTAP file so already-recorded Gate 2A evidence remains reproducible.

---

### Task 1: Create the dormant private identity-assistance schema

**Files:**

- Create: `supabase/tests/012_identity_assistance_job_foundation.sql`
- Create: `supabase/migrations/202608310001_identity_assistance_job_foundation.sql`
- Modify: `docs/iteration-plan.md`

**Interfaces:**

- Consumes: `public.user_profiles(id)`, `public.sightings(id)`, `public.media_assets(id)`, `public.animals(id)`, `public.identity_proposals(id)`, and the canonical media recipe from `private.media_upload_jobs`.
- Produces: private enum types `identity_assistance_job_status`, `identity_assistance_confidence_band`, `identity_assistance_reason_code`, `identity_assistance_failure_code`, and `identity_assistance_event_type`.
- Produces: private tables `identity_assistance_jobs`, `identity_assistance_candidates`, `identity_assistance_requests`, `identity_assistance_service_requests`, `identity_assistance_events`, `identity_assistance_status_reads`, and `identity_proposal_evidence` for the later broker/RPC plan.
- Produces no callable function and grants no direct table access.

- [ ] **Step 1: Write the failing pgTAP contract**

Create `supabase/tests/012_identity_assistance_job_foundation.sql` with `begin`, a fixed `plan(...)`, and `rollback`. Use pgTAP catalog assertions and real constraint behavior to cover these observable breaks:

1. Each of the five enum types and seven tables is absent before the migration and present after it.
2. `public`, `anon`, `authenticated`, and `service_role` have no `SELECT`, `INSERT`, `UPDATE`, or `DELETE` privilege on every new table.
3. `identity_assistance_jobs` exposes exactly these application columns (catalog metadata columns are not counted):

   ```text
   id, sighting_id, media_asset_id, requester_id, status, purpose,
   notice_version, input_sha256, recipe_version, crop_contract_version,
   embedding_contract_version, identify_contract_version, model_version,
   callback_contract_version, new_cat_recommended, attempt_count,
   lease_id, lease_expires_at, failure_code, requested_at, processing_at,
   completed_at, failed_at, cancelled_at, expires_at, selected_at,
   withdrawn_at, result_invalidated_at, created_at, updated_at
   ```

4. The job table has none of `storage_bucket`, `storage_path`, `object_path`, `signed_url`, `embedding`, `vector`, `score`, `location`, `latitude`, `longitude`, `payload`, or `worker_log`.
5. A hand-written valid `requested` job can be inserted by the test owner, but a second actionable job for the same sighting fails with unique violation; a terminal `failed` job permits a new requested job.
6. Invalid purpose, recipe/contract versions, a non-64-lowercase-hex input hash, `attempt_count = 4`, lease ID without lease expiry, callback version before completion, and completion fields on a requested job each fail a check constraint.
7. Candidate ranks `0` and `4`, duplicate animal IDs, duplicate ranks, empty reason arrays, five reason codes, and a fabricated reason code fail; valid ranks 1–3 with one to four allow-listed codes succeed.
8. Request and service request ledgers reject reusing the same `(actor_id, request_id)` or `request_id` key, while storing only a 64-character lowercase payload hash plus bounded operation.
9. Events reject arbitrary event names, arbitrary payload columns, and unbounded reason text; status-read rows are unique by `(actor_id, job_id, accessed_on)`.
10. Evidence stores job/proposal/version/rank/selector provenance but has no path, hash, score, vector, location, or arbitrary payload column.

Use literal expected values. Do not calculate expected catalog column arrays using production SQL helpers. Use `throws_ok` around concrete invalid inserts and clean each fixture explicitly so a passing assertion cannot depend on rollback alone.

- [ ] **Step 2: Run the database suite and capture RED**

Run:

```powershell
supabase test db
```

Expected: `012_identity_assistance_job_foundation.sql` fails because `private.identity_assistance_jobs` and the other new objects do not exist. If the suite errors before pgTAP reaches that assertion, repair only the test fixture until the failure is specifically the missing schema.

- [ ] **Step 3: Add exact enum types**

Create `supabase/migrations/202608310001_identity_assistance_job_foundation.sql` inside `begin`/`commit` with these enum values:

```sql
create type private.identity_assistance_job_status as enum
  ('requested', 'processing', 'succeeded', 'failed', 'cancelled', 'expired');
create type private.identity_assistance_confidence_band as enum
  ('likely', 'possible', 'weak');
create type private.identity_assistance_reason_code as enum
  ('face_pattern_similar', 'ear_shape_similar', 'coat_marking_similar',
   'view_angle_limited', 'image_quality_limited');
create type private.identity_assistance_failure_code as enum
  ('invalid_input', 'provider_unavailable', 'quality_rejected', 'internal_error',
   'lease_expired', 'source_invalidated');
create type private.identity_assistance_event_type as enum
  ('requested', 'claimed', 'completed', 'retry_released', 'failed', 'cancelled',
   'expired', 'selected', 'invalidated', 'cleaned');
```

- [ ] **Step 4: Add the job and candidate tables with state constraints**

Create `private.identity_assistance_jobs` using UUID foreign keys and the columns listed in Step 1. Required relationships and constraints:

- `sighting_id` is `not null references public.sightings(id) on delete cascade`.
- `media_asset_id` is nullable and references `public.media_assets(id) on delete set null`.
- `requester_id` is nullable and references `public.user_profiles(id) on delete set null`.
- `purpose` is exactly `community_cat_identity_assistance`.
- `notice_version` is 1–64 characters and matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`.
- `input_sha256` is nullable only for terminal/invalidation cleanup and otherwise matches `^[a-f0-9]{64}$`.
- Recipe and request-time contract versions equal the fixed values in Global Constraints.
- `attempt_count` is `0..3`; lease ID and expiry are both null or both non-null.
- `model_version`, `callback_contract_version`, and `new_cat_recommended` are all null before `succeeded`, and all non-null for `succeeded`.
- A `requested` job has no lease, processing/completion/failure timestamps, or failure code.
- A `processing` job has lease ID, future-agnostic lease expiry, `processing_at`, and `attempt_count >= 1`.
- A `failed` job has `failed_at` and `failure_code`; `cancelled` and `expired` have their matching terminal timestamp; `succeeded` has `completed_at`.
- `selected_at`, `withdrawn_at`, and `result_invalidated_at` are nullable provenance timestamps; they cannot predate `requested_at`.

Create the partial unique index:

```sql
create unique index identity_assistance_one_actionable_job_per_sighting_idx
  on private.identity_assistance_jobs (sighting_id)
  where status in ('requested', 'processing')
     or (status = 'succeeded' and selected_at is null
         and withdrawn_at is null and result_invalidated_at is null);
```

Create claim and cleanup indexes on `(status, requested_at, id)` and `(expires_at, id)`.

Create `private.identity_assistance_candidates` with `(job_id, rank)` primary key, `animal_id` FK, unique `(job_id, animal_id)`, typed confidence band, `reason_codes private.identity_assistance_reason_code[]`, and `created_at`. Enforce `rank between 1 and 3` and `cardinality(reason_codes) between 1 and 4`.

- [ ] **Step 5: Add bounded ledgers, events, access aggregation, and evidence**

Create:

- `identity_assistance_requests`: `actor_id`, UUID `request_id`, `payload_sha256`, operation limited to `request|cancel|select`, nullable `job_id`/`proposal_id`, `created_at`, primary key `(actor_id, request_id)`.
- `identity_assistance_service_requests`: UUID `request_id` primary key, `payload_sha256`, operation limited to `claim|complete|fail|cleanup|authorize_media`, nullable `job_id`, `created_at`.
- `identity_assistance_events`: identity bigint PK, nullable `job_id` with `on delete set null`, nullable `actor_id` with `on delete set null`, nullable UUID `request_id`, typed `event_type`, nullable typed `failure_code`, nullable `reason_code` limited to 1–64 characters matching `^[a-z][a-z0-9_]{0,63}$`, and `occurred_at`. Add no JSON column.
- `identity_assistance_status_reads`: `actor_id`, `job_id`, date `accessed_on`, first/last access timestamps, positive bounded `access_count <= 10000`, primary key `(actor_id, job_id, accessed_on)`.
- `identity_proposal_evidence`: `proposal_id` primary key, unique `job_id`, nullable `selected_candidate_rank`, nullable `media_asset_id`, fixed recipe/crop/embedding/identify versions, non-empty model version, callback version exactly `identify-callback.v1`, nullable `selector_id`, and `selected_at`. Candidate rank is null or 1–3. Store neither the media hash nor any storage locator.

Use lowercase payload SHA constraints `^[a-f0-9]{64}$`. Use UUID request IDs consistently; the existing older identity ledger remains unchanged in this batch.

- [ ] **Step 6: Deny every direct role and enable RLS**

For every new table:

```sql
alter table private.<table> enable row level security;
revoke all on table private.<table> from public, anon, authenticated, service_role;
```

Do not create RLS policies. Do not grant sequence usage for the event identity sequence. Later security-definer functions will use an explicit `set search_path` and own all access.

- [ ] **Step 7: Run GREEN database verification**

Run:

```powershell
supabase test db
supabase db lint --level warning
```

Expected: every pgTAP file passes; warning-level lint reports no new warning caused by this migration. If a warning is an existing baseline warning, record its exact text in the task report rather than suppressing it.

- [ ] **Step 8: Correct the iteration record without claiming A1 completion**

Update `docs/iteration-plan.md` so Sprint 4–5 states that the dormant private job/candidate/ledger/evidence schema foundation exists, but contributor RPCs, broker claim/complete/fail/cleanup, lease-bound media fetch, erasure/concurrency integration, and callback adapter remain open. Also correct Sprint 2–3 wording: upload artifact transport is implemented, but an authenticated reviewer artifact reader is not yet implemented.

- [ ] **Step 9: Run repository privacy and build gates**

Prepend the repository venv so the AI package does not use bare Python 3.14:

```powershell
$repoVenv=(Resolve-Path -LiteralPath '.venv\Scripts').Path
$env:PATH="$repoVenv;$env:PATH"
pnpm verify
```

Expected: database contracts, privacy checks, all package tests, lint, type checks, builds, and native policies pass.

- [ ] **Step 10: Self-review and commit**

Confirm the diff has exactly one new forward migration, one pgTAP file, and the plan-status documentation change. Verify no function grant or entry point was introduced and no forbidden data column exists. Commit:

```powershell
git add supabase/migrations/202608310001_identity_assistance_job_foundation.sql supabase/tests/012_identity_assistance_job_foundation.sql docs/iteration-plan.md
git commit -m "feat(ai): add identity job schema foundation"
```

Do not mark A1, live cat-face recognition, or pilot readiness complete.
