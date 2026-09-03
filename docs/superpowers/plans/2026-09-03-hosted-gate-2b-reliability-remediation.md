# Hosted Gate 2B Reliability Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hosted Gate 2B reliably prove production correctness and remote cleanup while measuring finalization latency separately and deriving a bounded production timeout from real samples.

**Architecture:** Keep finalization synchronous, but collapse the authorization/job lookup into one service-only database RPC and add fixed-label server timings around the remaining stages. Run correctness and cleanup as separate processes connected by the durable ledger; a manual characterization mode gathers at least 20 samples and selects the smallest timeout in `{10000, 12000, 15000}` milliseconds whose value is at least 125% of the largest successful sample.

**Tech Stack:** PostgreSQL migrations and pgTAP, Supabase Edge Functions on Deno, TypeScript, Vitest, Node.js orchestration, GitHub Actions, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-03-hosted-gate-2b-reliability-remediation-design.md`

## Global Constraints

- Preserve the hosted project `fhugdtpjbgiatqhvjioy`, immutable source verification, synthetic-only fixtures, cross-owner isolation, idempotency, fail-closed validation, and exact remote absence proof.
- Keep finalization synchronous; do not introduce polling, queues, retries, or a client-visible asynchronous state.
- Keep the existing bounded, allowlisted failure diagnostic at no more than 320 bytes.
- Emit only the timing labels `request_parse_ms`, `auth_ms`, `db_preflight_ms`, `storage_download_ms`, `media_validation_ms`, `finalize_rpc_ms`, and `total_ms`; never log credentials, request bodies, user IDs, media IDs, object paths, or database URLs.
- Characterization uses at least 20 sequential successful samples and a 30000 ms measurement ceiling per finalization.
- Production timeout candidates are exactly `10000`, `12000`, and `15000` milliseconds; choose the smallest candidate greater than or equal to `ceil(max_success_ms * 1.25)` and reject a sample set that needs more than 15000 ms.
- Initial performance SLO is `p95 <= 5000 ms`; performance is reported independently and cannot invalidate correctness evidence.
- Cleanup starts only after the correctness process exits, uses the durable exact-selector ledger, runs within the existing three-minute workflow step, polls until exact absence is proven, and produces no readiness evidence on cleanup failure.
- Do not restore the temporary `relaxed_finalize_timeout` input or the old two-run acceptance rule.
- Do not merge PR #5, mark it ready, or start an iOS device candidate build as part of this plan.

## File Structure

- `supabase/migrations/202609030001_finalize_media_preflight.sql`: service-only consolidated authorization and job preflight RPC.
- `supabase/tests/021_finalize_media_preflight.sql`: pgTAP contract for privilege, authorization, expiry, idempotent replay projection, deleted assets, and denied shapes.
- `supabase/functions/finalize-media-upload/handler.ts`: dependency-injected synchronous finalization handler and fixed-label timing collector.
- `supabase/functions/finalize-media-upload/index.ts`: environment/client wiring and `Deno.serve` entrypoint only.
- `supabase/functions/finalize-media-upload/handler.test.ts`: deterministic handler, sequencing, response, and safe-timing tests.
- `tests/pilot-gate-2a/src/actors.ts`: actor-level caller cancellation and one canonical production finalization deadline.
- `tests/pilot-gate-2a/src/actors.test.ts`: timeout selection and abort propagation regression tests.
- `tests/pilot-gate-2b/src/execute.ts`: correctness-only deadline coordinator; no hosted cleanup or evidence mutation.
- `tests/pilot-gate-2b/src/execute.test.ts`: correctness timeout and unsettled-operation diagnostics.
- `tests/pilot-gate-2b/src/environment.ts`: fixed mode and finalization-timeout environment contracts.
- `tests/pilot-gate-2b/src/environment.test.ts`: environment allowlist tests.
- `tests/pilot-gate-2b/src/hosted.integration.test.ts`: correctness runner that leaves the cleanup ledger intact.
- `tests/pilot-gate-2b/src/cleanup-hosted.ts`: authoritative cleanup, bounded polling, and cleanup-success marker writer.
- `tests/pilot-gate-2b/src/cleanup-hosted.test.ts`: cleanup marker and polling tests.
- `tests/pilot-gate-2b/src/performance.ts`: sample validation, percentile calculation, bounded timeout selection, and JSON report construction.
- `tests/pilot-gate-2b/src/performance.test.ts`: characterization math and schema tests.
- `tests/pilot-gate-2b/src/characterize-hosted.ts`: sequential hosted finalization sampler using synthetic isolated fixtures.
- `tests/pilot-gate-2b/src/write-evidence.ts`: require correctness output and cleanup-success marker before canonical evidence creation.
- `tests/pilot-gate-2b/src/evidence.test.ts`: evidence prerequisite tests.
- `tests/pilot-gate-2b/package.json`: correctness, cleanup, evidence, and characterize commands.
- `scripts/run-pilot-gate-2b.mjs`: deployment plus correctness/characterization orchestration; no in-process evidence write.
- `scripts/run-pilot-gate-2b.test.mjs`: process ordering and mode contract tests.
- `scripts/hosted-gate-2b-workflow-contract.test.mjs`: workflow contract for independent cleanup/evidence and removed relaxation.
- `.github/workflows/hosted-gate-2b.yml`: correctness default path, always-run cleanup, post-cleanup evidence, and manual characterization artifact.
- `docs/runbooks/pilot-gate-2b.md`: operator procedure and pass/fail interpretation.

---

### Task 1: Consolidated service-only finalization preflight

**Files:**
- Create: `supabase/migrations/202609030001_finalize_media_preflight.sql`
- Create: `supabase/tests/021_finalize_media_preflight.sql`
- Modify: `tests/pilot-gate-2b/src/remote-state.test.ts`

**Interfaces:**
- Consumes: `private.media_upload_jobs`, `public.user_profiles`, `public.sightings`, and `public.media_assets` from existing migrations.
- Produces: `public.get_media_finalization_preflight(p_uploader_id uuid, p_sighting_id uuid, p_media_id text, p_sha256 text)` returning the existing finalization-job columns, executable only by `service_role`.

- [ ] **Step 1: Write the failing pgTAP contract**

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
select has_function('public', 'get_media_finalization_preflight', array['uuid','uuid','text','text']);
select function_privs_are('public', 'get_media_finalization_preflight', array['uuid','uuid','text','text'], 'service_role', array['EXECUTE']);
select function_privs_are('public', 'get_media_finalization_preflight', array['uuid','uuid','text','text'], 'authenticated', array[]::text[]);
select function_privs_are('public', 'get_media_finalization_preflight', array['uuid','uuid','text','text'], 'anon', array[]::text[]);
select is((select proconfig from pg_proc where oid = 'public.get_media_finalization_preflight(uuid,uuid,text,text)'::regprocedure), array['search_path=pg_catalog']);
select is((select count(*) from public.get_media_finalization_preflight('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000222','preflight-123',repeat('a',64))), 1::bigint);
select is_empty($$select * from public.get_media_finalization_preflight('00000000-0000-0000-0000-000000000999','00000000-0000-0000-0000-000000000222','preflight-123',repeat('a',64))$$);
select is_empty($$select * from public.get_media_finalization_preflight('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000999','preflight-123',repeat('a',64))$$);
select is_empty($$select * from public.get_media_finalization_preflight('00000000-0000-0000-0000-000000000333','00000000-0000-0000-0000-000000000444','preflight-minor',repeat('b',64))$$);
select is((select status from public.get_media_finalization_preflight('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000222','preflight-expired',repeat('c',64))), 'reserved');
select is((select status from public.get_media_finalization_preflight('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000222','preflight-finalized',repeat('d',64))), 'finalized');
select ok((select media_deleted_at is not null from public.get_media_finalization_preflight('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000222','preflight-deleted',repeat('e',64))));
select * from finish();
rollback;
```

The test setup inserts fixed adult and non-adult profiles, their owned sightings, reserved and expired jobs, one finalized active asset, and one deleted finalized asset before the data assertions, using the same constraint-valid fixture pattern as `supabase/tests/002_media_upload_privacy.sql`. The RPC returns state; the Edge handler remains responsible for mapping expired, deleted, and non-reserved states to the existing HTTP conflicts.

- [ ] **Step 2: Run the database test and verify the missing function fails**

Run: `pnpm pilot-gate-2a`

Expected: FAIL in the pgTAP stage because `public.get_media_finalization_preflight(uuid,uuid,text,text)` does not exist.

- [ ] **Step 3: Implement the minimal security-definer RPC**

```sql
create or replace function public.get_media_finalization_preflight(
  p_uploader_id uuid, p_sighting_id uuid, p_media_id text, p_sha256 text
)
returns table (
  job_id uuid, object_path text, sha256 text, byte_length integer, width integer,
  height integer, recipe_version text, detector_versions jsonb,
  confirmed_at_local timestamptz, reservation_expires_at timestamptz,
  status text, media_asset_id uuid, media_deleted_at timestamptz
)
language sql security definer set search_path = pg_catalog
as $$
  select j.id, j.object_path, j.sha256, j.byte_length, j.width, j.height,
    j.recipe_version, j.detector_versions, j.confirmed_at_local,
    j.reservation_expires_at, j.status::text, j.media_asset_id, m.deleted_at
  from private.media_upload_jobs j
  join public.user_profiles p on p.id = p_uploader_id and p.adult_confirmed_at is not null
  join public.sightings s on s.id = p_sighting_id and s.reporter_id = p_uploader_id
  left join public.media_assets m on m.id = j.media_asset_id
  where p_uploader_id is not null
    and j.uploader_id = p_uploader_id and j.sighting_id = p_sighting_id
    and j.media_id = p_media_id and j.sha256 = p_sha256;
$$;
revoke all on function public.get_media_finalization_preflight(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.get_media_finalization_preflight(uuid,uuid,text,text) to service_role;
```

- [ ] **Step 4: Update the hosted migration-head test and run database verification**

Run: `pnpm pilot-gate-2a`

Expected: PASS with twelve assertions.

Run: `pnpm --filter @animalhelper/pilot-gate-2b test:unit -- remote-state.test.ts`

Expected: PASS with the new migration as the exact final element.

- [ ] **Step 5: Commit the database unit**

```powershell
git add supabase/migrations/202609030001_finalize_media_preflight.sql supabase/tests/021_finalize_media_preflight.sql tests/pilot-gate-2b/src/remote-state.test.ts
git commit -m "perf(media): consolidate finalization preflight"
```

### Task 2: Testable Edge finalization handler with safe timings

**Files:**
- Create: `supabase/functions/finalize-media-upload/handler.ts`
- Create: `supabase/functions/finalize-media-upload/handler.test.ts`
- Modify: `supabase/functions/finalize-media-upload/index.ts`

**Interfaces:**
- Consumes: `get_media_finalization_preflight` from Task 1 and the existing `finalize_media_upload_job` RPC.
- Produces: `createFinalizeMediaUploadHandler(dependencies: FinalizeMediaUploadDependencies): (request: Request) => Promise<Response>` and `FinalizeTimingEvent` with one fixed outcome plus exactly seven integer millisecond fields.

- [ ] **Step 1: Write failing handler tests**

```ts
it('uses one preflight RPC and emits only fixed timing labels', async () => {
  const calls: string[] = [];
  const timings: unknown[] = [];
  const handler = createFinalizeMediaUploadHandler(fakeDependencies({
    rpc: async (name) => { calls.push(name); return name === 'get_media_finalization_preflight' ? validJob() : validAssetId; },
    onTiming: (record) => timings.push(record),
    now: monotonicClock([0, 2, 5, 9, 14, 20, 27, 27]),
  }));
  const response = await handler(validRequest());
  expect(response.status).toBe(200);
  expect(calls).toEqual(['get_media_finalization_preflight', 'finalize_media_upload_job']);
  expect(Object.keys(timings[0] as object)).toEqual([
    'outcome',
    'request_parse_ms','auth_ms','db_preflight_ms','storage_download_ms',
    'media_validation_ms','finalize_rpc_ms','total_ms',
  ]);
  expect(JSON.stringify(timings)).not.toMatch(/user|media|jobs\//i);
});

it('returns the existing idempotent response without downloading storage', async () => {
  const dependencies = fakeDependencies({ preflight: finalizedJob(), download: vi.fn() });
  const response = await createFinalizeMediaUploadHandler(dependencies)(validRequest());
  expect(await response.json()).toEqual({ mediaAssetId: validAssetId, status: 'quarantined' });
  expect(dependencies.download).not.toHaveBeenCalled();
});
```

Also assert the existing 401, 403, 409, and 503 response shapes, digest/dimension rejection, and that `onTiming` fires once from a `finally` block for success and failure.

- [ ] **Step 2: Run the Edge unit test and verify imports fail**

Run: `pnpm --filter @animalhelper/edge-functions test -- finalize-media-upload/handler.test.ts`

Expected: FAIL because `handler.ts` and `createFinalizeMediaUploadHandler` do not exist.

- [ ] **Step 3: Extract the handler and add the fixed timing collector**

```ts
export type FinalizeOutcome =
  | 'success' | 'authentication_denied' | 'authorization_denied'
  | 'conflict' | 'internal_failure';
export type FinalizeTimingEvent = Readonly<{
  outcome: FinalizeOutcome;
  request_parse_ms: number; auth_ms: number; db_preflight_ms: number;
  storage_download_ms: number; media_validation_ms: number;
  finalize_rpc_ms: number; total_ms: number;
}>;

export type FinalizeMediaUploadDependencies = Readonly<{
  authenticate(token: string): Promise<string | null>;
  preflight(userId: string, input: FinalizeInput): Promise<unknown>;
  download(objectPath: string): Promise<Blob | null>;
  finalize(jobId: string, userId: string, input: FinalizeInput): Promise<string | null>;
  now(): number;
  onTiming(record: FinalizeTimingEvent): void;
}>;

class TimingCollector {
  readonly #durations = new Map<string, number>();
  readonly #startedAt: number;
  constructor(private readonly now: () => number) { this.#startedAt = now(); }
  async measure<T>(label: keyof Omit<FinalizeTimingEvent, 'outcome' | 'total_ms'>, work: () => Promise<T>): Promise<T> {
    const started = this.now();
    try { return await work(); }
    finally { this.#durations.set(label, Math.max(0, Math.round(this.now() - started))); }
  }
  finish(outcome: FinalizeOutcome): FinalizeTimingEvent {
    const value = (label: string) => this.#durations.get(label) ?? 0;
    return {
      outcome,
      request_parse_ms: value('request_parse_ms'), auth_ms: value('auth_ms'),
      db_preflight_ms: value('db_preflight_ms'), storage_download_ms: value('storage_download_ms'),
      media_validation_ms: value('media_validation_ms'), finalize_rpc_ms: value('finalize_rpc_ms'),
      total_ms: Math.max(0, Math.round(this.now() - this.#startedAt)),
    };
  }
}
```

`createFinalizeMediaUploadHandler` wraps each existing request stage with `TimingCollector.measure`, keeps an `outcome` variable initialized to `internal_failure`, sets it immediately before each fixed response class, and calls `dependencies.onTiming(timing.finish(outcome))` exactly once in `finally`. It keeps request parsing, CORS, bearer validation, job validation, SHA-256, and JPEG inspection behavior byte-for-byte compatible at the HTTP boundary.

- [ ] **Step 4: Wire Supabase clients in the entrypoint**

`index.ts` creates the anon/service clients once per request, supplies `authenticate`, `preflight`, `download`, and `finalize`, and logs only:

```ts
onTiming: (record) => console.log(JSON.stringify({ event: 'finalize_media_upload_timing', ...record }))
```

There are no separate `user_profiles` or `sightings` queries in the entrypoint.

- [ ] **Step 5: Run focused and shared Edge verification**

Run: `pnpm --filter @animalhelper/edge-functions test -- finalize-media-upload/handler.test.ts`

Expected: PASS.

Run: `pnpm --filter @animalhelper/edge-functions test`

Expected: PASS for all shared and function tests.

- [ ] **Step 6: Commit the Edge unit**

```powershell
git add supabase/functions/finalize-media-upload/index.ts supabase/functions/finalize-media-upload/handler.ts supabase/functions/finalize-media-upload/handler.test.ts
git commit -m "perf(media): instrument finalization stages"
```

### Task 3: One bounded request deadline with caller cancellation

**Files:**
- Modify: `tests/pilot-gate-2a/src/actors.ts`
- Modify: `tests/pilot-gate-2a/src/actors.test.ts`
- Modify: `tests/pilot-gate-2b/src/environment.ts`
- Modify: `tests/pilot-gate-2b/src/environment.test.ts`

**Interfaces:**
- Consumes: `fetchWithTimeout(input, init, timeoutMs, fetchImplementation?, timeoutResult?)`, which already composes a caller signal with its own deadline.
- Produces: `ActorRequestOptions = { signal?: AbortSignal; timeoutMs?: 5000 | 10000 | 12000 | 15000 | 30000 }`; hosted correctness permits only 10000/12000/15000, characterization alone uses 30000, and local/Gate 2A keeps 5000.

- [ ] **Step 1: Replace relaxation tests with failing cancellation and allowlist tests**

```ts
it('propagates caller cancellation through finalization without waiting for its local deadline', async () => {
  const controller = new AbortController();
  const observed: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn((_input, init) => {
    observed.push(init!.signal!);
    return new Promise<Response>(() => undefined);
  }));
  const resultPromise = finalizeMedia(actor, validFinalizeInput, env, { signal: controller.signal, timeoutMs: 10000 });
  controller.abort();
  await expect(resultPromise).resolves.toMatchObject({ ok: false, code: 'network_error' });
  expect(observed[0]?.aborted).toBe(true);
});
```

```ts
it.each(['9999','10001','30000'])('rejects a non-production timeout %s', (timeout) => {
  expect(() => readHostedGateEnvironment({ ...validEnv, PILOT_GATE_2B_FINALIZE_TIMEOUT_MS: timeout }))
    .toThrow('hosted_environment_invalid');
});
```

- [ ] **Step 2: Run focused tests and verify the old signatures fail**

Run: `pnpm --filter @animalhelper/pilot-gate-2a test:unit -- actors.test.ts`

Expected: FAIL because actor functions do not accept `ActorRequestOptions`.

Run: `pnpm --filter @animalhelper/pilot-gate-2b test:unit -- environment.test.ts`

Expected: FAIL because the environment still reads the temporary first-owner relaxation variable.

- [ ] **Step 3: Implement the actor request options**

```ts
export type ActorRequestOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMs?: 5000 | 10000 | 12000 | 15000 | 30000;
}>;

async function actorPost(
  stage: 'reserve' | 'finalize' | 'delete', endpoint: string,
  actor: SyntheticActor, serializedBody: string,
  options: ActorRequestOptions = {},
): Promise<Response | ActorFailure> {
  const timeoutMs = options.timeoutMs ?? 5000;
  return fetchWithTimeout(endpoint, { method: 'POST', signal: options.signal, /* existing fields */ }, timeoutMs,
    globalThis.fetch, timeoutResult);
}
```

Apply the optional `signal` to `reserveMedia`, `putSignedMedia`, `finalizeMedia`, and `deleteMedia`; retain the 5000 ms local/Gate 2A default, single-attempt semantics, and all existing normalized failure shapes. Hosted correctness always supplies its characterized 10000/12000/15000 value to both first finalization and replay; characterization supplies 30000.

- [ ] **Step 4: Replace the hosted environment field**

```ts
export type HostedGateMode = 'correctness' | 'characterize';
export type HostedGateEnvironment = Readonly<{
  // existing validated fields
  mode: HostedGateMode;
  finalizeTimeoutMs: 10000 | 12000 | 15000 | 30000;
}>;
```

`PILOT_GATE_2B_MODE=correctness` accepts only 10000/12000/15000. `PILOT_GATE_2B_MODE=characterize` requires exactly 30000.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @animalhelper/pilot-gate-2a test:unit -- actors.test.ts network.test.ts`

Expected: PASS, including request/body abort tests and no retries.

Run: `pnpm --filter @animalhelper/pilot-gate-2b test:unit -- environment.test.ts`

Expected: PASS with the mode-dependent allowlist.

- [ ] **Step 6: Commit the deadline unit**

```powershell
git add tests/pilot-gate-2a/src/actors.ts tests/pilot-gate-2a/src/actors.test.ts tests/pilot-gate-2b/src/environment.ts tests/pilot-gate-2b/src/environment.test.ts
git commit -m "fix(gate2b): propagate bounded request cancellation"
```

### Task 4: Separate correctness from authoritative cleanup and evidence

**Files:**
- Modify: `tests/pilot-gate-2b/src/execute.ts`
- Modify: `tests/pilot-gate-2b/src/execute.test.ts`
- Modify: `tests/pilot-gate-2b/src/check-diagnostic.ts`
- Modify: `tests/pilot-gate-2b/src/check-diagnostic.test.ts`
- Modify: `tests/pilot-gate-2b/src/fixtures.ts`
- Modify: `tests/pilot-gate-2b/src/fixtures.test.ts`
- Modify: `tests/pilot-gate-2b/src/inspection.ts`
- Modify: `tests/pilot-gate-2b/src/inspection.test.ts`
- Modify: `tests/pilot-gate-2b/src/hosted.integration.test.ts`
- Modify: `tests/pilot-gate-2b/src/cleanup-hosted.ts`
- Create: `tests/pilot-gate-2b/src/cleanup-hosted.test.ts`
- Modify: `tests/pilot-gate-2b/src/write-evidence.ts`
- Modify: `tests/pilot-gate-2b/src/evidence.test.ts`

**Interfaces:**
- Consumes: durable ledger path and exact cleanup selectors already validated by `cleanup-ledger.ts`.
- Produces: correctness marker `hosted-gate-2b-checks.json`, cleanup marker `hosted-gate-2b-cleanup.json`, diagnostic stages `checks_timeout`, `checks_unsettled`, `cleanup_timeout`, and `cleanup_failure`; readiness evidence requires both markers.

- [ ] **Step 1: Write failing correctness-boundary tests**

```ts
it('never invokes hosted cleanup or evidence from the correctness executor', async () => {
  const cleanup = vi.fn();
  const emitEvidence = vi.fn();
  const result = await executeHostedGate({
    timeoutMs: 180000,
    createScenario: async () => scenario,
    runChecks: async () => passingChecks,
  });
  expect(result).toEqual({ checks: passingChecks });
  expect(cleanup).not.toHaveBeenCalled();
  expect(emitEvidence).not.toHaveBeenCalled();
});

it('classifies a cooperative deadline as checks_timeout and an ignored abort as checks_unsettled', async () => {
  await expect(executeHostedGate({ timeoutMs: 10, cancellationGraceMs: 5,
    createScenario: async () => scenario,
    runChecks: async (_scenario, signal) => new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
  })).rejects.toMatchObject({ control: { gateStage: 'checks_timeout' } });
  await expect(executeHostedGate({ timeoutMs: 10, cancellationGraceMs: 5,
    createScenario: async () => scenario,
    runChecks: async () => new Promise(() => undefined),
  })).rejects.toMatchObject({ control: { gateStage: 'checks_unsettled' } });
});
```

- [ ] **Step 2: Run executor tests and verify the old cleanup coupling fails them**

Run: `pnpm --filter @animalhelper/pilot-gate-2b test:unit -- execute.test.ts check-diagnostic.test.ts`

Expected: FAIL because `executeHostedGate` requires cleanup/evidence callbacks and maps ignored cancellation to cleanup.

- [ ] **Step 3: Implement the correctness-only executor**

```ts
export const GATE_STAGES = ['create', 'checks', 'checks_timeout', 'checks_unsettled'] as const;
export type ExecuteHostedGateOptions = Readonly<{
  timeoutMs: number;
  cancellationGraceMs?: number;
  createScenario(partial: MutableHostedScenario, signal: AbortSignal): Promise<unknown>;
  runChecks(scenario: unknown, signal: AbortSignal): Promise<ReadinessChecks>;
}>;
export type HostedGateResult = Readonly<{ checks: ReadinessChecks }>;
```

Use one 180000 ms deadline for scenario creation plus checks in hosted execution. On the deadline, abort the shared signal; a rejection within grace is `checks_timeout`, and no settlement within grace is `checks_unsettled`. Preserve typed check/media/owner details and keep the serialized control under 320 bytes. This process deadline is independent from the characterized 10000/12000/15000 per-finalization request deadline.

- [ ] **Step 4: Make the hosted integration runner leave recovery state intact**

Add `signal?: AbortSignal` to `createHostedScenario`, `HostedInspectionSession.inspectMedia`, and `HostedInspectionSession.inspectIsolation`. Pass the same phase signal into every actor, direct `fetchWithTimeout` call, Supabase query builder `.abortSignal(signal)`, and fixture request whose SDK exposes a signal. The Postgres inspection adapter retains its existing `statement_timeout: 8000` and `lock_timeout: 1000`; its abort listener calls `sql.end({ timeout: 0 })` so the session is closed when the phase is cancelled. Remove the `cleanup` and `emitEvidence` callbacks, remove `removeCleanupLedger`, and atomically write `hosted-gate-2b-checks.json` only after all five checks pass. The ledger remains until the independent cleanup command proves absence.

Add unit tests that abort fixture creation before its next adapter mutation, assert Supabase fetches receive the phase signal, and assert an inspection session closes once when its phase is aborted.

- [ ] **Step 5: Write failing cleanup marker tests**

```ts
it('polls exact cleanup until absence is proven and writes one canonical marker', async () => {
  const cleanup = vi.fn()
    .mockRejectedValueOnce(cleanupFailure(['prove_absence']))
    .mockResolvedValueOnce(undefined);
  await runHostedCleanup({ cleanup, wait: async () => undefined, maxAttempts: 3,
    markerPath, ledgerPath, env });
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(JSON.parse(await readFile(markerPath, 'utf8'))).toEqual({ cleanupPassed: true });
});

it('does not write a marker when exact absence is not proven', async () => {
  await expect(runHostedCleanup({ cleanup: async () => { throw cleanupFailure(['prove_absence']); },
    wait: async () => undefined, maxAttempts: 3, markerPath, ledgerPath, env })).rejects.toThrow();
  await expect(lstat(markerPath)).rejects.toMatchObject({ code: 'ENOENT' });
});
```

- [ ] **Step 6: Implement bounded authoritative cleanup**

```ts
export async function runHostedCleanup(options: Readonly<{
  ledgerPath: string; markerPath: string; env: HostedGateEnvironment;
  cleanup(env: HostedGateEnvironment, ledger: PartialHostedScenario): Promise<void>;
  wait(delayMs: number): Promise<void>; maxAttempts?: number;
}>): Promise<void> {
  const ledger = await readCleanupLedger(options.ledgerPath);
  const maxAttempts = options.maxAttempts ?? 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await options.cleanup(options.env, ledger);
      await writeCleanupMarker(options.markerPath, { cleanupPassed: true });
      await removeCleanupLedger(options.ledgerPath);
      return;
    } catch (error) {
      if (attempt === maxAttempts || !isAbsencePending(error)) throw error;
      await options.wait(Math.min(5000, attempt * 1000));
    }
  }
}
```

Only the typed `prove_absence` condition is retryable; deletion/auth/storage/database operation failures remain terminal. A process-local timer slightly below the workflow's three-minute bound maps expiry to `cleanup_timeout`; exhausted or non-retryable operations map to `cleanup_failure` with fixed cleanup-operation identifiers. Marker writes use absolute canonical runner-temp paths, `wx`, and owner-only permissions like the existing diagnostic writer.

- [ ] **Step 7: Require both markers before evidence**

`write-evidence.ts` reads and validates the exact checks marker and cleanup marker, then removes both only after `docs/evidence/pilot-gate-2b-readiness.json` is atomically written. Missing, malformed, symlinked, or permissive markers fail closed.

- [ ] **Step 8: Run Gate 2B unit tests**

Run: `pnpm --filter @animalhelper/pilot-gate-2b test:unit`

Expected: PASS; executor tests no longer contain assertions about in-process cleanup, and cleanup tests prove bounded polling and marker suppression.

- [ ] **Step 9: Commit the process-boundary unit**

```powershell
git add tests/pilot-gate-2b/src/execute.ts tests/pilot-gate-2b/src/execute.test.ts tests/pilot-gate-2b/src/check-diagnostic.ts tests/pilot-gate-2b/src/check-diagnostic.test.ts tests/pilot-gate-2b/src/fixtures.ts tests/pilot-gate-2b/src/fixtures.test.ts tests/pilot-gate-2b/src/inspection.ts tests/pilot-gate-2b/src/inspection.test.ts tests/pilot-gate-2b/src/hosted.integration.test.ts tests/pilot-gate-2b/src/cleanup-hosted.ts tests/pilot-gate-2b/src/cleanup-hosted.test.ts tests/pilot-gate-2b/src/write-evidence.ts tests/pilot-gate-2b/src/evidence.test.ts
git commit -m "fix(gate2b): separate correctness from cleanup proof"
```

### Task 5: Independent performance characterization and bounded selector

**Files:**
- Create: `tests/pilot-gate-2b/src/performance.ts`
- Create: `tests/pilot-gate-2b/src/performance.test.ts`
- Create: `tests/pilot-gate-2b/src/characterize-hosted.ts`
- Modify: `tests/pilot-gate-2b/package.json`

**Interfaces:**
- Consumes: synthetic fixture creation, actor finalization with `timeoutMs: 30000`, durable cleanup ledger, and the same finalization endpoint used by correctness.
- Produces: `selectProductionTimeout(samples: readonly number[]): 10000 | 12000 | 15000`, `buildPerformanceReport(context, samples, outcomes)`, and `hosted-gate-2b-performance.json`.

- [ ] **Step 1: Write failing percentile and selector tests**

```ts
it('selects the smallest production timeout with 25 percent headroom over max', () => {
  expect(selectProductionTimeout([1100, 7900])).toBe(10000);
  expect(selectProductionTimeout([8001])).toBe(12000);
  expect(selectProductionTimeout([9601])).toBe(15000);
  expect(() => selectProductionTimeout([12001])).toThrow('hosted_characterization_requires_optimization');
});

it('reports nearest-rank p95, max, count, failure count and SLO status', () => {
  const context = {
    sourceCommit: 'a'.repeat(40), workflowRunId: 42, workflowRunAttempt: 1,
    edgeRegion: 'ap-southeast-1', projectRegion: 'ap-southeast-1',
  } as const;
  const samples = Array.from({ length: 20 }, (_, index) => index + 1);
  expect(buildPerformanceReport(context, samples, { success: 20, http_error: 0, transport_error: 0, timeout: 0 })).toEqual({
    schemaVersion: 1, sourceCommit: context.sourceCommit, workflowRunId: 42,
    workflowRunAttempt: 1, edgeRegion: 'ap-southeast-1', projectRegion: 'ap-southeast-1',
    sampleCount: 20, outcomes: { success: 20, http_error: 0, transport_error: 0, timeout: 0 },
    observedErrorRate: 0, minMs: 1, p50Ms: 10, p95Ms: 19, maxMs: 20,
    sloP95Ms: 5000, sloPassed: true,
    selectedTimeoutMs: 10000,
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `pnpm --filter @animalhelper/pilot-gate-2b test:unit -- performance.test.ts`

Expected: FAIL because `performance.ts` does not exist.

- [ ] **Step 3: Implement pure characterization math**

```ts
const PRODUCTION_TIMEOUTS = [10000, 12000, 15000] as const;
export function selectProductionTimeout(samples: readonly number[]): 10000 | 12000 | 15000 {
  if (samples.length < 20 || samples.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 30000)) {
    throw new Error('hosted_characterization_invalid');
  }
  const required = Math.ceil(Math.max(...samples) * 1.25);
  const selected = PRODUCTION_TIMEOUTS.find((candidate) => candidate >= required);
  if (selected === undefined) throw new Error('hosted_characterization_requires_optimization');
  return selected;
}
```

Use nearest-rank percentiles over a copied ascending array. `PerformanceContext` validates the 40-character source SHA, positive safe run ID/attempt, and allowlisted deployed Edge/project region strings. Outcome keys are fixed to `success`, `http_error`, `transport_error`, and `timeout`. The report never claims an error rate below one percent when fewer than 100 attempts exist; it labels the value `observedErrorRate`. If platform metadata provides a fixed cold/warm classification, add aggregate `cold` and `warm` count/min/p50/p95/max objects; otherwise omit both fields. The JSON report cannot contain identities, paths, URLs, credentials, raw responses, or individual samples.

- [ ] **Step 4: Implement the sequential hosted sampler**

`characterize-hosted.ts` runs isolated owner reserve/upload/finalize sequences one at a time until it has 20 successful finalization samples or a bounded 25 total attempts, measures only the finalization request with `performance.now()`, records failures as fixed outcome counts without raw responses, persists each fixture to the durable ledger before mutation, validates the deployed Edge and project regions, and writes `hosted-gate-2b-performance.json` only after all attempts finish. Fewer than 20 successes fails characterization without selecting a timeout. It never writes readiness evidence.

- [ ] **Step 5: Add package commands and run tests**

```json
{
  "scripts": {
    "characterize:hosted": "tsx src/characterize-hosted.ts",
    "test:unit": "vitest run --exclude src/hosted.integration.test.ts --exclude src/characterize-hosted.ts"
  }
}
```

Run: `pnpm --filter @animalhelper/pilot-gate-2b test:unit -- performance.test.ts`

Expected: PASS.

Run: `pnpm --filter @animalhelper/pilot-gate-2b typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the characterization unit**

```powershell
git add tests/pilot-gate-2b/src/performance.ts tests/pilot-gate-2b/src/performance.test.ts tests/pilot-gate-2b/src/characterize-hosted.ts tests/pilot-gate-2b/package.json
git commit -m "feat(gate2b): add latency characterization"
```

### Task 6: Workflow orchestration and operator contract

**Files:**
- Modify: `scripts/run-pilot-gate-2b.mjs`
- Modify: `scripts/run-pilot-gate-2b.test.mjs`
- Modify: `scripts/hosted-gate-2b-workflow-contract.test.mjs`
- Modify: `.github/workflows/hosted-gate-2b.yml`
- Modify: `docs/runbooks/pilot-gate-2b.md`

**Interfaces:**
- Consumes: mode and timeout environment contract from Task 3; markers from Task 4; characterization report from Task 5.
- Produces: default correctness job and manual `characterize` job with distinct artifacts and no shared pass/fail signal.

- [ ] **Step 1: Write failing runner ordering tests**

```js
test('correctness deploys, runs checks, and leaves evidence to the workflow', async () => {
  const calls = await runWithMode('correctness');
  assert.deepEqual(calls.filter((call) => call.package === '@animalhelper/pilot-gate-2b'), [
    ['test:integration'],
  ]);
  assert.equal(calls.some((call) => call.includes('evidence:write')), false);
});

test('characterize uses only the hosted characterization command', async () => {
  const calls = await runWithMode('characterize');
  assert.deepEqual(calls.filter((call) => call.package === '@animalhelper/pilot-gate-2b'), [
    ['characterize:hosted'],
  ]);
});
```

- [ ] **Step 2: Write failing workflow contract assertions**

Assert that:

```js
assert.equal(workflow.on.workflow_dispatch.inputs.mode.default, 'correctness');
assert.deepEqual(workflow.on.workflow_dispatch.inputs.mode.options, ['correctness', 'characterize']);
assert.equal('relaxed_finalize_timeout' in workflow.on.workflow_dispatch.inputs, false);
assert.equal(cleanup.if, 'always()');
assert.match(evidence.if, /success\(\).*correctness/);
assert.match(performanceArtifact.if, /characterize/);
assert.equal(workflow.jobs.attest_evidence.needs, 'hosted_gate_2b');
```

- [ ] **Step 3: Run contract tests and verify they fail against the current workflow**

Run: `node --test scripts/run-pilot-gate-2b.test.mjs scripts/hosted-gate-2b-workflow-contract.test.mjs`

Expected: FAIL because the relaxation input and in-runner evidence write still exist.

- [ ] **Step 4: Refactor the runner mode branch**

Validate `PILOT_GATE_2B_MODE` as `correctness` or `characterize`. Use 10000/12000/15000 only for correctness and 30000 only for characterization. After deployment and source re-verification, invoke exactly one package command and leave cleanup/evidence to later workflow processes.

- [ ] **Step 5: Refactor the workflow steps**

The workflow order is exactly:

```yaml
- name: Run protected Hosted Gate 2B correctness
  if: github.event_name == 'push' || inputs.mode == 'correctness'
- name: Characterize Hosted Gate 2B latency
  if: github.event_name == 'workflow_dispatch' && inputs.mode == 'characterize'
- name: Recover exact hosted fixtures
  if: always()
- name: Write canonical readiness evidence
  if: success() && (github.event_name == 'push' || inputs.mode == 'correctness')
- name: Validate canonical readiness evidence
  if: success() && (github.event_name == 'push' || inputs.mode == 'correctness')
- name: Upload canonical readiness evidence
  if: success() && (github.event_name == 'push' || inputs.mode == 'correctness')
- name: Upload performance characterization
  if: success() && github.event_name == 'workflow_dispatch' && inputs.mode == 'characterize'
```

Keep readiness provenance downstream of successful correctness and cleanup for audit compatibility, but never feed the performance artifact into it. Set `PILOT_GATE_2B_FINALIZE_TIMEOUT_MS` to the characterized selected value checked into the workflow; begin with `15000` only for the first characterization deployment, then replace it in Task 7 with the selector output before correctness acceptance.

- [ ] **Step 6: Update the runbook**

Document the two modes, 20-sample minimum, fixed timeout formula, `p95 <= 5000 ms` SLO, failure/error-rate interpretation, exact cleanup requirement, artifact names, and the rule that a required value over 15000 ms triggers optimization rather than a larger timeout.

- [ ] **Step 7: Run orchestration tests**

Run: `pnpm test:pilot-gate-2b-ci`

Expected: PASS for runner, workflow, input discovery, evidence promotion, and root verification contracts.

- [ ] **Step 8: Commit orchestration**

```powershell
git add scripts/run-pilot-gate-2b.mjs scripts/run-pilot-gate-2b.test.mjs scripts/hosted-gate-2b-workflow-contract.test.mjs .github/workflows/hosted-gate-2b.yml docs/runbooks/pilot-gate-2b.md
git commit -m "ci(gate2b): separate correctness cleanup and latency"
```

### Task 7: Verify locally, characterize hosted latency, and accept the strict gate

**Files:**
- Modify: `.github/workflows/hosted-gate-2b.yml` only if characterization selects a value different from its temporary 15000 ms bootstrap value.
- Create at runtime only: `hosted-gate-2b-performance.json` artifact; do not commit generated reports or readiness evidence.

**Interfaces:**
- Consumes: all units from Tasks 1-6.
- Produces: one characterized timeout selected by code, one passing default Hosted Gate 2B run, exact zero-residual cleanup proof, and canonical readiness evidence from the same immutable SHA.

- [ ] **Step 1: Run all local focused verification**

Run: `pnpm --filter @animalhelper/pilot-gate-2b lint`

Expected: PASS.

Run: `pnpm --filter @animalhelper/pilot-gate-2b typecheck`

Expected: PASS.

Run: `pnpm --filter @animalhelper/pilot-gate-2b test:unit`

Expected: PASS.

Run: `pnpm --filter @animalhelper/pilot-gate-2a test:unit`

Expected: PASS.

Run: `pnpm test:pilot-gate-2b-ci`

Expected: PASS.

- [ ] **Step 2: Run the repository verification gate**

Run: `pnpm verify`

Expected: exit code 0 with no test, typecheck, lint, migration, or contract failure.

- [ ] **Step 3: Commit any verification-only corrections, then push**

```powershell
git status --short
git add --update
git commit -m "test(gate2b): close reliability regressions"
git push origin codex/hosted-gate-2b
```

Skip the commit command when `git status --short` is empty. Confirm the pushed commit equals `git rev-parse HEAD`.

- [ ] **Step 4: Dispatch one characterization run**

Run: `gh workflow run hosted-gate-2b.yml --ref codex/hosted-gate-2b -f mode=characterize`

Wait for the resulting run to complete. Download `pilot-gate-2b-performance-<run-id>-<attempt>` and validate it with the pure `buildPerformanceReport` schema. Expected: at least 20 samples, zero raw identifiers/secrets, cleanup passed, and `selectedTimeoutMs` in `{10000,12000,15000}`.

- [ ] **Step 5: Check in the selected timeout if needed**

Replace both correctness occurrences of `PILOT_GATE_2B_FINALIZE_TIMEOUT_MS` in the workflow with the report's `selectedTimeoutMs`. Do not alter the characterization ceiling of 30000.

Run: `pnpm test:pilot-gate-2b-ci`

Expected: PASS.

```powershell
git add .github/workflows/hosted-gate-2b.yml
git commit -m "ci(gate2b): set characterized finalization deadline"
git push origin codex/hosted-gate-2b
```

Skip this step when the selected value is already checked in.

- [ ] **Step 6: Observe the default push correctness run**

Use `gh run list --workflow hosted-gate-2b.yml --branch codex/hosted-gate-2b` to identify the run for the exact final SHA, then `gh run watch <run-id> --exit-status`.

Expected: correctness passes, the independent cleanup step prints `hosted_cleanup_passed`, evidence validation passes, and the readiness artifact is present. A performance SLO miss may be reported only by the characterization artifact and cannot fail this correctness run.

- [ ] **Step 7: Inspect the authoritative zero-residual proof**

Inspect the completed workflow cleanup step and its canonical cleanup marker. Expected: the durable ledger was removed only after database, Auth, Storage objects, upload jobs, media assets, and sightings were all proven absent. Do not run a selector-free cleanup command after the ledger has been removed, and do not read or upload raw request/response logs.

- [ ] **Step 8: Final repository audit**

Run: `git status --short`

Expected: clean working tree.

Run: `git log -7 --oneline`

Expected: the design, database, Edge, cancellation, process-boundary, characterization, workflow, and any verification correction commits are visible in order.

Record the final SHA, characterization run URL, correctness run URL, selected deadline, p95, max, error rate, and zero-residual result in the user handoff. Leave PR #5 in Draft and do not start an iOS candidate build.
