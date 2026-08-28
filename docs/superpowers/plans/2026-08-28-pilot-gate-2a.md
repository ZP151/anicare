# WhiskerCommons Pilot Gate 2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, with a specification reviewer and a code-quality reviewer at each checkpoint.

**Goal:** Produce reproducible CI evidence that two real local Supabase Auth users can safely exercise reserve, signed Storage PUT, finalize, deletion and cleanup flows while owner isolation, capability lifecycle and concurrent convergence remain intact.

**Architecture:** Add a dedicated TypeScript/Vitest integration workspace with four explicit boundaries: validated loopback-only environment input, synthetic fixtures, token-scoped actor operations, and a narrow privileged inspection/control adapter. Run it against the pinned disposable Supabase stack and Edge Runtime in the existing database CI job. Keep all capabilities in memory, redact diagnostics, and add no test-only production endpoint or authorization bypass.

**Tech Stack:** Node.js 22, TypeScript, Vitest, `@supabase/supabase-js` 2.98.0, `postgres` 3.4.9, PostgreSQL 17, Supabase CLI 2.84.2, Supabase Auth/Storage/Edge Runtime, Deno 2.9.5, pnpm 11.19.0, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-pilot-gate-2a-design.md`

## Global constraints

- Reject any non-loopback API or database target in the Gate 2A command. HTTP API/origin URLs must contain no credentials; the database URL must match the exact local scheme, userinfo, host, port and database without ever being echoed.
- Use only synthetic users, coordinates, sightings, receipts and a deterministic EXIF-free JPEG.
- Never print or persist to disk passwords, JWTs, service-role keys, signed URLs/tokens, credential-bearing database URLs, query strings, precise coordinates, request bodies or full Storage paths.
- Actor operations may use only that actor's access token and public HTTP endpoints.
- Privileged setup/inspection must stay in test code and must not create a production RPC, route, policy or environment bypass.
- Preserve owner binding, receipt binding, non-upsert upload, quarantine status, deletion deferral and cleanup claim semantics.
- Pin the existing runtime versions and do not broaden unrelated package upgrades.
- Every behavior change follows red-green-refactor and lands as a focused commit.

---

### Task 1: Create the isolated harness and fail-closed diagnostics

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `tests/pilot-gate-2a/package.json`
- Create: `tests/pilot-gate-2a/tsconfig.json`
- Create: `tests/pilot-gate-2a/vitest.config.ts`
- Create: `tests/pilot-gate-2a/vitest.integration.config.ts`
- Create: `tests/pilot-gate-2a/src/environment.ts`
- Create: `tests/pilot-gate-2a/src/environment.test.ts`
- Create: `tests/pilot-gate-2a/src/diagnostics.ts`
- Create: `tests/pilot-gate-2a/src/diagnostics.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export type LocalStackEnvironment = Readonly<{
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  allowedOrigin: string;
}>;

export function readLocalStackEnvironment(source: NodeJS.ProcessEnv): LocalStackEnvironment;
export function sanitizeDiagnostic(value: unknown, secrets: readonly string[]): string;
```

- [ ] Write failing tests that reject missing values, whitespace-bearing keys, credentials embedded in HTTP API/origin URLs, non-HTTP or non-loopback API hosts, non-loopback database hosts, unexpected local database userinfo/port/database, and unexpected origins. Accept only the exact local credential-bearing PostgreSQL URL shape and never echo/stringify it.
- [ ] Write failing redaction tests for bearer JWTs, service keys, signed `token=` query values, passwords, database credentials, request bodies and Storage object paths. Assert the output contains only bounded scenario/status/error/count fields.
- [ ] Implement the smallest validators and recursive sanitizer. Do not echo the input in thrown errors.
- [ ] Add `tests/*` to the pnpm workspace and declare exact runtime dependencies `@supabase/supabase-js@2.98.0` and `postgres@3.4.9`; use the repository's TypeScript/Vitest versions without unrelated lockfile churn.
- [ ] Add `test`, `test:unit`, `test:integration`, `lint`, `typecheck` and `build` scripts. Ordinary `test` and root Turbo execution must use only the unit config and run without Docker. Integration tests require an explicit `PILOT_GATE_2A=1` flag and otherwise fail rather than silently skip when invoked directly.
- [ ] Configure integration files serially with `fileParallelism: false` and `maxWorkers: 1`. `cleanup-media-staging` globally claims up to 25 due jobs, so files must not steal each other's fixtures; concurrency belongs only inside explicit barrier tests.
- [ ] Run focused RED then GREEN evidence:

```powershell
pnpm --filter @animalhelper/pilot-gate-2a test:unit
pnpm --filter @animalhelper/pilot-gate-2a typecheck
git diff --check
```

- [ ] Commit:

```powershell
git add pnpm-workspace.yaml pnpm-lock.yaml tests/pilot-gate-2a
git commit -m "test(pilot): add fail-closed integration harness"
```

---

### Task 2: Add synthetic JPEG, Auth and sighting fixtures

**Files:**
- Create: `tests/pilot-gate-2a/src/jpeg-fixture.ts`
- Create: `tests/pilot-gate-2a/src/jpeg-fixture.test.ts`
- Create: `tests/pilot-gate-2a/src/fixtures.ts`
- Create: `tests/pilot-gate-2a/src/fixtures.test.ts`
- Create: `tests/pilot-gate-2a/src/readiness.integration.test.ts`

**Interfaces:**

```ts
export type SyntheticActor = Readonly<{ id: string; accessToken: string }>;
export type SyntheticScenario = Readonly<{
  owner: SyntheticActor;
  stranger: SyntheticActor;
  ownerSightingId: string;
  strangerSightingId: string;
}>;

export function deterministicJpegFixture(): Readonly<{
  bytes: Uint8Array;
  sha256: string;
  width: number;
  height: number;
}>;

export async function createSyntheticScenario(env: LocalStackEnvironment): Promise<SyntheticScenario>;
export async function destroySyntheticScenario(env: LocalStackEnvironment, scenario: SyntheticScenario): Promise<void>;
```

- [ ] Test the JPEG fixture's stable byte length, SHA-256 and 1x1 dimensions; keep its base64 source identical to the already decoder-valid synthetic JFIF fixture used by the JPEG policy suite.
- [ ] Implement unique per-run emails/passwords entirely in memory. Create both users through local admin Auth, mark email confirmed, sign in independently and assert distinct user IDs/tokens without snapshotting sessions.
- [ ] Insert only the minimum adult profile records through the service fixture client.
- [ ] Create owner and stranger sightings through the real `create-sighting` Edge route using synthetic coordinates and the test-only 32-byte encryption key. Assert only normalized response fields.
- [ ] Add teardown that deletes synthetic Auth users and relies on the disposable stack for remaining cleanup. Teardown errors pass through the sanitizer.
- [ ] Add a readiness integration test for Health/Auth/Edge that uses a bounded retry deadline and fails distinctly on infrastructure startup.
- [ ] Run unit checks locally and the integration slice on a disposable stack when available.
- [ ] Commit:

```powershell
git add tests/pilot-gate-2a
git commit -m "test(pilot): add two-user local fixtures"
```

---

### Task 3: Prove the real owner media flow

**Files:**
- Create: `tests/pilot-gate-2a/src/actors.ts`
- Create: `tests/pilot-gate-2a/src/actors.test.ts`
- Create: `tests/pilot-gate-2a/src/inspection.ts`
- Create: `tests/pilot-gate-2a/src/media-happy-path.integration.test.ts`

**Interfaces:**

```ts
export async function reserveMedia(actor: SyntheticActor, input: ReserveInput, env: LocalStackEnvironment): Promise<Reservation>;
export async function putSignedMedia(reservation: Reservation, bytes: Uint8Array): Promise<ActorResult>;
export async function finalizeMedia(actor: SyntheticActor, input: FinalizeInput, env: LocalStackEnvironment): Promise<ActorResult>;
export async function deleteMedia(actor: SyntheticActor, mediaAssetId: string, env: LocalStackEnvironment): Promise<ActorResult>;
```

- [ ] Unit-test exact request mapping, strict response parsing, redirect refusal and normalized HTTP errors before implementing network helpers.
- [ ] Build the receipt from the deterministic JPEG: stable media UUID, SHA-256, byte length, dimensions, recipe `jpeg-srgb-2048-q88.v1`, unavailable detector versions and current local confirmation time.
- [ ] Exercise real `reserve-media-upload`, validate same media ID, `jobs/{uuid}.jpg` path, loopback origin and expiry ordering while retaining the signed capability only in memory.
- [ ] Perform a real signed non-upsert PUT with `image/jpeg`, then finalize through the owner's token.
- [ ] Through the privileged Postgres inspection adapter, assert exactly one quarantined asset and one finalized job bound to the owner, sighting, media ID, hash and dimensions. Queries must return counts/status/ownership booleans, not secret columns.
- [ ] Assert anonymous and ordinary authenticated clients cannot read staging/final Storage objects or private upload-job state.
- [ ] Repeat finalization and require the same media asset ID with no duplicate row.
- [ ] Commit:

```powershell
git add tests/pilot-gate-2a
git commit -m "test(pilot): prove signed media happy path"
```

---

### Task 4: Prove cross-user isolation and capability replay boundaries

**Files:**
- Create: `tests/pilot-gate-2a/src/media-isolation.integration.test.ts`
- Create: `tests/pilot-gate-2a/src/media-replay.integration.test.ts`
- Modify: `tests/pilot-gate-2a/src/inspection.ts`

- [ ] Write failing cross-user tests: stranger reserve on owner sighting, stranger finalize, stranger delete, and rebind of the owner's `(uploader_id, client_media_id)` identity to another sighting/job. Prove separately that the stranger may reuse the same client media ID for their own owner-scoped sighting.
- [ ] Require only documented `403 media_not_found_or_forbidden` or `409 media_reservation_conflict` responses, with no existence oracle in response shape.
- [ ] Upload once, then replay the same signed PUT. Require the second PUT to fail and verify the stored object's hash/length remain unchanged.
- [ ] Finalize twice and prove one asset. Attempt reserve/finalize with a mismatched hash and prove no second asset or altered ownership.
- [ ] Add public-read denial for both authenticated actors and anonymous access.
- [ ] If a composed-stack failure exposes a production bug, add a focused handler/shared-module test first, implement the smallest production fix, and rerun pgTAP plus Edge source tests before proceeding.
- [ ] Commit:

```powershell
git add tests/pilot-gate-2a supabase/functions supabase/migrations supabase/tests
git commit -m "test(pilot): enforce media isolation and replay safety"
```

---

### Task 5: Prove expiry, deletion and cleanup convergence

**Files:**
- Create: `tests/pilot-gate-2a/src/media-lifecycle.integration.test.ts`
- Modify: `tests/pilot-gate-2a/src/inspection.ts`

- [ ] Add parameterized privileged SQL helpers that update only the current scenario's reservation/token/cleanup timestamps and reject table names, arbitrary SQL and non-UUID identifiers.
- [ ] Force a reserved job past `reservation_expires_at`; finalization must return the bounded conflict and create no asset.
- [ ] Invoke `cleanup-media-staging` with the local service role through its real HTTP route. Verify expired unfinalized objects are removed and jobs reach the documented terminal/retry state.
- [ ] Finalize an object, request deletion through the owner route, and verify object removal is deferred while the recorded upload capability could still be replayed.
- [ ] Do not treat database timestamp mutation as expiry of a minted Storage JWT. Keep the finalized object retained while its recorded conservative token watermark is in the future, invoke cleanup, and prove deletion remains deferred plus signed replay cannot overwrite the retained non-upsert object.
- [ ] Record real post-token-expiry cleanup/replay as unresolved: it requires either waiting beyond Storage's fixed token lifetime or a separately approved clock/token control. Do not weaken the product lifecycle to make this test fast.
- [ ] Verify the stranger still cannot delete at each lifecycle state.
- [ ] Commit:

```powershell
git add tests/pilot-gate-2a
git commit -m "test(pilot): prove expiry and cleanup lifecycle"
```

---

### Task 6: Add bounded concurrency race evidence

**Files:**
- Create: `tests/pilot-gate-2a/src/media-concurrency.integration.test.ts`
- Modify: `tests/pilot-gate-2a/src/inspection.ts`

- [ ] Start two same-media reserves from a shared barrier with `Promise.allSettled`; allow both to return equivalent reservations with independently minted signed tokens, and assert one job, one owner and one object path.
- [ ] Upload once, then start two finalizations together; both may report the same idempotent asset or one may return the documented conflict, but the database must contain exactly one asset.
- [ ] Race owner deletion with repeated finalization. Require convergence to a tombstoned media asset plus `deletion_pending` upload job; a post-race finalize must conflict, with no ownership drift or duplicate asset.
- [ ] Force one expired staging job and invoke two cleanup requests together. Assert one effective claim/removal and a valid terminal/retry state.
- [ ] Repeat each race a small fixed number of times (maximum five), never use unbounded retries, and print only scenario names plus normalized outcomes.
- [ ] Run the full integration suite twice against fresh stacks to catch inter-test coupling.
- [ ] Commit:

```powershell
git add tests/pilot-gate-2a
git commit -m "test(pilot): verify concurrent media convergence"
```

---

### Task 7: Make Gate 2A mandatory in GitHub Actions

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/pilot-gate-2a-inputs.mjs`
- Create: `scripts/pilot-gate-2a-inputs.test.mjs`
- Create: `scripts/run-pilot-gate-2a.mjs`
- Create: `scripts/run-pilot-gate-2a.test.mjs`
- Modify: `package.json`

- [ ] Add source-discovery tests that require every `*.integration.test.ts`, every Edge function in the Gate 2A endpoint allowlist, and the local-only environment guard. Future endpoint/test additions must not silently escape CI.
- [ ] Add pnpm setup and a frozen install to `database-contracts`, preserving Supabase CLI `2.84.2`, Deno `2.9.5` and Node 22.
- [ ] Implement one guarded Node orchestration process that captures `supabase start` and `supabase status -o env` without forwarding their output, validates/parses credentials only in memory, emits CI mask directives immediately, and then launches every downstream process with the minimum inherited environment. Add unit tests with fake child processes proving startup/status secrets never reach stdout/stderr or temp files, including failure paths.
- [ ] Create an Edge env file only in the OS temporary directory with the fixed synthetic location key and `MEDIA_ALLOWED_ORIGIN`; it contains no Supabase credential. Start `supabase functions serve` as a bounded child process and retain its handle.
- [ ] Run the readiness test, then the full integration suite. Never use `continue-on-error` for either.
- [ ] In unconditional cleanup, stop the Edge process, delete the noncredential Edge env file and any sanitized log, and run repository-scoped `supabase stop --no-backup` only after validating the project ID. No status/credential file may exist at any point.
- [ ] On failure, sanitize Edge output before artifact upload; otherwise retain no runtime logs.
- [ ] Keep pgTAP and lint before the integration suite so schema failures remain attributable.
- [ ] Run workflow lint/static input tests and commit:

```powershell
node --test scripts/pilot-gate-2a-inputs.test.mjs
node scripts/pilot-gate-2a-inputs.mjs
git diff --check
git add .github/workflows/ci.yml scripts package.json
git commit -m "ci: require two-user media integration gate"
```

---

### Task 8: Update pilot evidence and run final verification

**Files:**
- Modify: `docs/iteration-plan.md`
- Modify: `README.md`
- Create: `docs/evidence/pilot-gate-2a.md`

- [ ] Document only observed results: test matrix, pinned versions, commit SHA and GitHub Actions run/job URLs. Do not copy secrets, raw logs or signed URLs.
- [ ] Mark local-stack HTTP/Auth/Storage composition complete only after the fresh CI job succeeds.
- [ ] Keep hosted Supabase, EAS/native devices, real test data, legal/operational drills and real AI accuracy explicitly open.
- [ ] Run fresh local source verification:

```powershell
pnpm install --frozen-lockfile
pnpm peers check
pnpm --filter @animalhelper/pilot-gate-2a test:unit
pnpm --filter @animalhelper/pilot-gate-2a lint
pnpm --filter @animalhelper/pilot-gate-2a typecheck
pnpm --filter @animalhelper/edge-functions test
pnpm --filter @animalhelper/edge-functions typecheck
pnpm --filter @animalhelper/mobile test
pnpm --filter @animalhelper/mobile typecheck
python -m ruff check services/ai
python -m mypy services/ai/src
pnpm exec turbo run lint typecheck test build --force
node --test scripts/pilot-gate-inputs.test.mjs scripts/pilot-gate-2a-inputs.test.mjs
node scripts/pilot-gate-inputs.mjs uuid
node scripts/pilot-gate-inputs.mjs deno
node scripts/pilot-gate-2a-inputs.mjs
git diff --check
git status --short --untracked-files=all
```

- [ ] Push the branch using repository identity `zhouping151140 <zhouping151140@gmail.com>`. Use per-command Git HTTP/1.1 only if the known GitHub transport reset recurs; do not change global configuration.
- [ ] Wait for both GitHub Actions jobs. The mandatory evidence is a fresh successful `database-contracts` job containing pgTAP, lint, Edge readiness and the full Gate 2A suite.
- [ ] Request whole-branch specification and code-quality review. Resolve every Critical/Important finding with focused regression evidence.
- [ ] Commit evidence documentation:

```powershell
git add README.md docs/iteration-plan.md docs/evidence/pilot-gate-2a.md
git commit -m "docs: record pilot gate 2a evidence"
```

## Completion boundary

Gate 2A is complete only when the pushed commit has a green fresh-run `verify` job and a green fresh-run `database-contracts` job proving all integration scenarios that do not require actual Storage-JWT expiry. True post-token-expiry cleanup/replay remains a declared Gate 2B/later item. This advances the project to hosted Gate 2B planning; it does not complete the broader Singapore closed-pilot goal.
