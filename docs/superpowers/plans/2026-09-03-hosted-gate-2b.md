# WhiskerCommons Hosted Gate 2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incrementally deploy the reviewed backend to the fixed Singapore Supabase test project, prove the hosted media contract with two synthetic users, and produce short-lived readiness evidence consumed by the protected iOS Device Lab.

**Architecture:** A separate `@animalhelper/pilot-gate-2b` package validates hosted-only inputs and runs exact synthetic checks while reusing environment-independent Gate 2A media primitives. A fail-closed Node orchestrator owns Supabase deployment, Auth configuration, Edge secrets, fixture execution, evidence generation, redacted diagnostics, and cleanup. A protected GitHub workflow emits an attested evidence artifact; a separate promotion adapter validates it before the fixed repository evidence file can be committed.

**Tech Stack:** Node.js 22.23.1, pnpm 11.19.0, TypeScript 7.0.2, Vitest 4.1.11, `@supabase/supabase-js` 2.98.0, `postgres` 3.4.9, Deno 2.9.5, Supabase CLI 2.84.2, GitHub Actions, Supabase Auth/Storage/Edge Functions/PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-09-03-hosted-gate-2b-design.md`

## Global Constraints

- Target only project ref `fhugdtpjbgiatqhvjioy` at `https://fhugdtpjbgiatqhvjioy.supabase.co`.
- Apply migrations only with `supabase db push`; never call remote reset, repair, seed, dump, restore, prune, delete, pause, or arbitrary SQL commands.
- Keep Gate 2A loopback validation and orchestration unchanged except for narrowing environment-independent actor types.
- Use only two generated `@example.invalid` users, deterministic synthetic coordinates, and the existing 1x1 EXIF-free JPEG.
- Keep passwords, JWTs, access tokens, service-role keys, database URLs, signed upload capabilities, UUIDs, object paths, coordinates, emails, bodies, and receipts out of logs and artifacts.
- `hosted-gate-2b` alone receives privileged Supabase values. `ios-device-lab` receives only the restricted Maps key, exact public origin, and public/anon key.
- Every behavior change follows red-green-refactor. Each task ends with focused verification and a commit.
- Remote mutation and transmission of persistent credentials require immediate owner confirmation after implementation review.
- A green readiness artifact does not authorize merge, candidate dispatch, Apple credential entry, or a physical-device claim.

---

### Task 1: Add hosted input, hash, and evidence policies

**Files:**
- Create: `tests/pilot-gate-2b/package.json`
- Create: `tests/pilot-gate-2b/tsconfig.json`
- Create: `tests/pilot-gate-2b/vitest.config.ts`
- Create: `tests/pilot-gate-2b/vitest.integration.config.ts`
- Create: `tests/pilot-gate-2b/src/environment.ts`
- Create: `tests/pilot-gate-2b/src/environment.test.ts`
- Create: `tests/pilot-gate-2b/src/evidence.ts`
- Create: `tests/pilot-gate-2b/src/evidence.test.ts`
- Modify: `tests/pilot-gate-2a/src/actors.ts`
- Modify: `tests/pilot-gate-2a/src/actors.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export type HostedGateEnvironment = Readonly<{
  apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co';
  anonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  preciseLocationEncryptionKey: string;
  sourceCommit: string;
  workflowRunId: number;
  workflowRunAttempt: number;
}>;

export function readHostedGateEnvironment(source: NodeJS.ProcessEnv): HostedGateEnvironment;
export function buildReadinessEvidence(input: ReadinessEvidenceInput): Gate2BReadinessEvidence;
export function hashMigrationHead(repoRoot: string): Readonly<{ filename: string; sha256: string }>;
export function hashEdgeFunctionsTree(repoRoot: string): string;
```

**First RED test:**

```ts
it('accepts only the fixed hosted project and reviewed pooler identity', () => {
  expect(readHostedGateEnvironment(hostedEnvironment())).toMatchObject({
    apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co',
    sourceCommit: 'a'.repeat(40),
    workflowRunId: 123456789,
    workflowRunAttempt: 1,
  });
  expect(() => readHostedGateEnvironment({
    ...hostedEnvironment(),
    SUPABASE_URL: 'https://other.supabase.co',
  })).toThrow('hosted_environment_invalid');
});
```

- [ ] Write failing environment tests that reject every missing value, whitespace, CR/LF/NUL, a nonexact origin, URL credentials/path/query/fragment/port, equal public and privileged keys, privileged public-key formats, nonprivileged service keys, malformed Base64 encryption keys, noncanonical SHA/run metadata, and a database URL whose scheme, username, database, host, port, query, or fragment differs from the reviewed session-pooler shape.
- [ ] Run `pnpm --filter @animalhelper/pilot-gate-2b test:unit -- environment.test.ts` and require failures caused by the missing module.
- [ ] Implement the minimum parser. Error messages are fixed codes and never interpolate input. Export a minimal `MediaActorEnvironment` from Gate 2A `actors.ts` so hosted code can reuse actor operations without inheriting the local database contract; prove existing Gate 2A behavior is unchanged.
- [ ] Write failing evidence tests that require the exact 15-field schema, canonical key order, 72-hour window, current regular non-symlink migration head, deterministic sorted Edge tree hash, exact successful check enums, and no sensitive/free-form field.
- [ ] Run the focused tests and require the expected missing evidence implementation failures.
- [ ] Implement evidence generation and file hashing with `lstat`, `realpath`, repository containment, byte bounds, lowercase SHA-256, sorted POSIX-relative filenames, and domain-separated file framing.
- [ ] Add package scripts `test`, `test:unit`, `test:integration`, `lint`, `typecheck`, and `build`; ordinary Turbo execution runs unit tests only.
- [ ] Run `pnpm install --lockfile-only` once to add the new workspace importer without changing pinned dependency versions, then require the frozen install in verification.
- [ ] Verify:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @animalhelper/pilot-gate-2b test:unit
pnpm --filter @animalhelper/pilot-gate-2a test:unit
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
```

- [ ] Commit `test(pilot): add hosted gate evidence policies`.

---

### Task 2: Add synthetic hosted fixtures, inspection, and exact cleanup

**Files:**
- Create: `tests/pilot-gate-2b/src/fixtures.ts`
- Create: `tests/pilot-gate-2b/src/fixtures.test.ts`
- Create: `tests/pilot-gate-2b/src/inspection.ts`
- Create: `tests/pilot-gate-2b/src/inspection.test.ts`
- Create: `tests/pilot-gate-2b/src/checks.ts`
- Create: `tests/pilot-gate-2b/src/checks.test.ts`

**Interfaces:**

```ts
export type HostedScenario = Readonly<{
  owner: SyntheticActor;
  stranger: SyntheticActor;
  ownerSightingId: string;
  strangerSightingId: string;
  createdUserIds: readonly string[];
  createdObjectPaths: readonly string[];
}>;

export type ReadinessChecks = Readonly<{
  authRedirectCheck: 'passed' | 'failed';
  mediaStagingCheck: 'passed' | 'failed';
  publicKeyOriginCheck: 'passed' | 'failed';
  syntheticOwnerHappyPath: 'passed' | 'failed';
  crossOwnerIsolation: 'passed' | 'failed';
}>;

export async function createHostedScenario(env: HostedGateEnvironment): Promise<HostedScenario>;
export async function inspectHostedMedia(env: HostedGateEnvironment, input: HostedInspectionInput): Promise<HostedInspection>;
export async function cleanupHostedScenario(env: HostedGateEnvironment, scenario: PartialHostedScenario): Promise<void>;
export async function runHostedChecks(env: HostedGateEnvironment): Promise<ReadinessChecks>;
```

**First RED test:**

```ts
it('cleans every exact fixture after a partial owner creation failure', async () => {
  const adapter = fixtureAdapterThatFailsAfterOwnerProfile();
  await expect(createHostedScenario(hostedEnvironment(), adapter)).rejects.toThrow('hosted_fixture_failed');
  expect(adapter.removedObjectPaths).toEqual([]);
  expect(adapter.deletedProfileIds).toEqual([adapter.ownerId]);
  expect(adapter.deletedAuthUserIds).toEqual([adapter.ownerId]);
  expect(adapter.usedWildcardOrDomainCleanup).toBe(false);
});
```

- [ ] Write failing fixture tests with fake Auth/HTTP adapters proving two distinct confirmed users, two adult profiles, synthetic coordinates, random in-memory passwords, exact created-ID tracking, and cleanup after every partial-creation boundary.
- [ ] Run the fixture tests and verify they fail because the hosted fixture module is absent.
- [ ] Implement fixtures using dependency injection. Do not print credentials or persist them to disk.
- [ ] Write failing inspection tests that accept only UUID/hash/size/dimension inputs, issue fixed parameterized statements, disable prepared statements, bound timeouts, inspect one finalized private upload job plus one quarantined asset, and reject table names or caller-provided SQL.
- [ ] Write cleanup tests that prove exact Storage paths are removed, rows are deleted in fixed foreign-key order by created UUIDs, Auth users are deleted last, absence is rechecked, and no time-range/domain/wildcard/truncate operation exists.
- [ ] Implement inspection and cleanup with one database connection, `max: 1`, `prepare: false`, statement/lock/connect timeouts, and `onnotice: () => undefined`.
- [ ] Write failing check tests for exact Auth redirects, private `media-staging`, public-key/origin binding, owner reserve/upload/finalize/idempotency, and stranger reserve/finalize/delete/list/read denial without an existence oracle.
- [ ] Implement the smallest check coordinator using the existing actor request mapper and deterministic JPEG. A check is returned as `passed` only after its assertions and final cleanup proof succeed.
- [ ] Verify focused tests, Gate 2A unit tests, typecheck, and `git diff --check`.
- [ ] Commit `test(pilot): add hosted synthetic media checks`.

---

### Task 3: Add the hosted execution adapter and sanitized diagnostics

**Files:**
- Create: `tests/pilot-gate-2b/src/execute.ts`
- Create: `tests/pilot-gate-2b/src/execute.test.ts`
- Create: `tests/pilot-gate-2b/src/hosted.integration.test.ts`
- Create: `tests/pilot-gate-2b/src/diagnostics.ts`
- Create: `tests/pilot-gate-2b/src/diagnostics.test.ts`

**Interfaces:**

```ts
export type HostedGateResult = Readonly<{
  checks: ReadinessChecks;
  cleanupPassed: true;
}>;

export async function executeHostedGate(options: ExecuteHostedGateOptions): Promise<HostedGateResult>;
export function sanitizeHostedDiagnostic(value: unknown, secrets: readonly string[]): string;
```

**First RED test:**

```ts
it('suppresses passing evidence when cleanup cannot prove absence', async () => {
  const result = executeHostedGate({
    ...executionFixture(),
    cleanup: async () => { throw new Error('synthetic-user@example.invalid'); },
  });
  await expect(result).rejects.toThrow('hosted_gate_failed_at_cleanup');
  expect(executionFixture().evidenceWrites).toEqual([]);
});
```

- [ ] Write failing diagnostic tests covering bearer/JWT/secret prefixes, database URLs, query capabilities, UUIDs, object paths, emails, coordinates, request bodies, receipts, long lines, ANSI escapes, unknown fields, and explicit known-secret replacement. Expected output contains only stage, fixed code, bounded status class, and count.
- [ ] Implement recursive fail-closed sanitization and fixed diagnostic serialization.
- [ ] Write failing execute tests proving readiness runs serially, partial scenarios always reach cleanup, cleanup failure overrides success, cancellation is bounded, no evidence is emitted after a failed check, and only the five check results plus `cleanupPassed` are returned.
- [ ] Implement `executeHostedGate` with injected clock/network/database adapters and `finally` cleanup.
- [ ] Add one integration file guarded by exact `PILOT_GATE_2B=1`; direct integration invocation without the flag fails rather than skips. It calls real hosted services only and outputs a single `hosted_gate_2b_passed` marker.
- [ ] Verify unit tests, typecheck, and the unarmed integration guard.
- [ ] Commit `test(pilot): add hosted gate execution adapter`.

---

### Task 4: Add the fail-closed deployment orchestrator

**Files:**
- Create: `scripts/pilot-gate-2b-inputs.mjs`
- Create: `scripts/pilot-gate-2b-inputs.test.mjs`
- Create: `scripts/run-pilot-gate-2b.mjs`
- Create: `scripts/run-pilot-gate-2b.test.mjs`
- Create: `scripts/fixtures/pilot-gate-2b-child.mjs`
- Modify: `package.json`

**Interfaces:**

```js
export function discoverPilotGate2BInputs(repoRoot) {}
export function validatePilotGate2BInputs(inputs) {}
export async function configureHostedAuth({ fetchAdapter, accessToken }) {}
export async function runPilotGate2B({ repoRoot, processAdapter, fetchAdapter, parentEnvironment, outputAdapter, signal }) {}
```

**First RED test:**

```js
test('deploys incrementally in the fixed order without privileged command arguments', async () => {
  const processAdapter = fakeHostedProcessAdapter();
  await runPilotGate2B({ ...orchestratorFixture(), processAdapter });
  assert.deepEqual(processAdapter.commands.map(({ command, args }) => [command, ...args]), [
    ['supabase', 'link', '--project-ref', 'fhugdtpjbgiatqhvjioy'],
    ['supabase', 'db', 'push', '--dry-run'],
    ['supabase', 'db', 'push'],
    ['supabase', 'secrets', 'set', '--env-file', processAdapter.edgeSecretFile, '--project-ref', 'fhugdtpjbgiatqhvjioy'],
    ...DEPLOYED_FUNCTIONS.map((name) => ['supabase', 'functions', 'deploy', name, '--project-ref', 'fhugdtpjbgiatqhvjioy', '--use-api']),
    [process.execPath, processAdapter.tsxCli, processAdapter.hostedExecuteScript],
  ]);
  assert.equal(processAdapter.commandText.includes(orchestratorFixture().databaseUrl), false);
});
```

- [ ] Write failing discovery tests requiring the exact 20-migration inventory, exact six deployable Edge Function directories, exact hosted integration file, fixed evidence schema, and fixed workflow path. Added or missing inputs must fail before credentials are used.
- [ ] Implement regular-file, non-symlink, containment, name, count, and byte-bound discovery.
- [ ] Write failing process tests proving the orchestrator rejects the wrong repository/ref/event/SHA/environment/project, masks every secret before child execution, passes only minimum environment values, never puts secrets in command arguments, and forbids commands containing `reset`, `repair`, `seed`, `dump`, `restore`, `prune`, `delete`, `pause`, or `query`.
- [ ] Write failing Auth configuration tests for an exact Management API `PATCH` followed by `GET`, bounded redirect refusal, response size/time limits, and exact readback of `animalhelper://` plus `animalhelper://auth/callback`.
- [ ] Write failing deployment-order tests requiring: immutable checkout check; public-origin check; CLI link; `db push --dry-run`; incremental `db push`; Auth update/readback; chmod-600 temporary Edge secret file; secrets set; six individual function deploys without `--prune`; hosted harness; evidence generation; schema/consumer validation; and unconditional temp/diagnostic cleanup.
- [ ] Implement the orchestrator with stage-specific deadlines. Parse the reviewed pooler URL in memory and expose only its password as `SUPABASE_DB_PASSWORD` to the two CLI database stages; pass the full URL only to the hosted harness process.
- [ ] On failure, write one mode-0600 sanitized diagnostic under the OS temporary directory. Add a cleanup-only CLI mode and never upload a success log.
- [ ] Add root scripts `pilot-gate-2b`, `pilot-gate-2b:cleanup-diagnostic`, and `test:pilot-gate-2b-ci`.
- [ ] Verify Node tests, hosted unit tests, Gate 2A orchestration tests, and `git diff --check`.
- [ ] Commit `ci: add hosted gate deployment orchestrator`.

---

### Task 5: Add the protected producer workflow and structural contract

**Files:**
- Create: `.github/workflows/hosted-gate-2b.yml`
- Create: `scripts/hosted-gate-2b-workflow-contract.test.mjs`
- Modify: `scripts/root-verify-contract.test.mjs`
- Modify: `package.json`

**Required workflow shape:**

```yaml
on:
  push:
    branches: [codex/hosted-gate-2b]
    paths:
      - .github/workflows/hosted-gate-2b.yml
      - scripts/**
      - tests/pilot-gate-2a/**
      - tests/pilot-gate-2b/**
      - supabase/config.toml
      - supabase/migrations/**
      - supabase/functions/**
      - package.json
      - pnpm-lock.yaml
      - pnpm-workspace.yaml
  workflow_dispatch:
```

**First RED test:**

```js
test('keeps privileged and device environments structurally separated', () => {
  const workflow = parseHostedGateWorkflow();
  assert.equal(workflow.jobs.hosted_gate_2b.environment, 'hosted-gate-2b');
  assert.deepEqual(Object.keys(workflow.jobs.hosted_gate_2b.permissions).sort(), ['contents']);
  assert.equal(JSON.stringify(workflow).includes('ios-device-lab'), false);
  assert.equal(JSON.stringify(workflow).includes('contents":"write'), false);
});
```

- [ ] Write the structural test first. It must reject changes to the workflow name, triggers, exact branch/path allowlist, environment name, reviewer gate assumption, runner, timeouts, permissions, action SHAs, pinned tool versions, secret names, step-scoped environments, deployment order, evidence path, artifact retention, failure diagnostics, and unconditional cleanup.
- [ ] Require repository default `contents: read`; the producer job has `contents: read`; a separate evidence attestation step/job receives only `contents: read`, `id-token: write`, and `attestations: write`. No workflow receives `contents: write`.
- [ ] Implement one `hosted_gate_2b` job on Ubuntu using environment `hosted-gate-2b`, exact source checkout, Node 22.23.1, pnpm 11.19.0, Deno 2.9.5, Supabase CLI 2.84.2, frozen install, policy tests, and the orchestrator.
- [ ] Upload only the canonical readiness JSON and its provenance attestation on success. Upload only the sanitized failure diagnostic for three days on failure. Delete both success and failure local outputs in `if: always()` cleanup.
- [ ] Add the workflow contract to root `verify` and CI as an independent preflight.
- [ ] Verify the new contract, root contracts, YAML parsing, full hosted unit tests, and `git diff --check`.
- [ ] Commit `ci: protect hosted gate 2b producer`.

---

### Task 6: Add fail-closed evidence promotion and operator runbook

**Files:**
- Create: `scripts/promote-pilot-gate-2b-evidence.mjs`
- Create: `scripts/promote-pilot-gate-2b-evidence.test.mjs`
- Create: `docs/runbooks/hosted-gate-2b.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/iteration-plan.md`

**Interface:**

```js
export async function promotePilotGate2BEvidence({ repoRoot, artifactDirectory, runMetadata, now }) {}
```

**First RED test:**

```js
test('rejects evidence from the wrong workflow before replacing the fixed file', async () => {
  const fixture = await promotionFixture();
  await assert.rejects(
    promotePilotGate2BEvidence({
      ...fixture,
      runMetadata: { ...fixture.runMetadata, workflowPath: '.github/workflows/other.yml' },
    }),
    /gate_2b_promotion_invalid/,
  );
  assert.equal(await fixture.destinationExists(), false);
});
```

- [x] Write failing promotion tests that reject missing/extra/symlinked files, noncanonical JSON, wrong workflow/repository/ref/SHA/run/attempt/conclusion, failed or expired checks, future timestamps, changed migration/function hashes, unrelated source ancestry, and an existing destination that is not the expected prior evidence file.
- [x] Implement validation using exact GitHub run metadata, the existing Device Lab readiness policy, and atomic fixed-path replacement.
- [x] Add a CLI that accepts only a positive run ID/attempt; it selects and downloads the exact attempt-qualified artifact into an owned temporary directory, verifies the artifact attestation against the fixed repository/workflow/source SHA/ref and GitHub-hosted runner, then prints only `gate_2b_evidence_promoted`.
- [x] Document environment names, exact secret classes, action-time confirmation, workflow approval, evidence promotion, merge-commit requirement, 72-hour refresh, redaction, rollback-by-new-migration, and the unresolved two-hour token gate.
- [x] Update project status only to “Hosted Gate 2B producer implemented”; do not mark readiness passed until a real hosted run and committed evidence exist.
- [x] Verify promotion tests, root verify contracts, documentation links, and `git diff --check`.
- [x] Commit `docs: add hosted gate evidence promotion`.

---

### Task 7: Review, configure, run, and record real hosted evidence

**Files:**
- Create after a successful run: `docs/evidence/pilot-gate-2b-readiness.json`
- Create after a successful run: `docs/evidence/pilot-gate-2b.md`
- Modify after a successful run: `README.md`
- Modify after a successful run: `docs/iteration-plan.md`

- [ ] Run fresh local verification:

```powershell
pnpm install --frozen-lockfile
pnpm peers check
pnpm test:pilot-gate-2b-ci
pnpm --filter @animalhelper/pilot-gate-2b test:unit
pnpm --filter @animalhelper/pilot-gate-2b lint
pnpm --filter @animalhelper/pilot-gate-2b typecheck
pnpm --filter @animalhelper/pilot-gate-2a test:unit
pnpm --filter @animalhelper/edge-functions test
pnpm validate:pilot-policies
pnpm test:root-contracts
pnpm verify
git diff --check
git status --short --untracked-files=all
```

- [ ] Obtain independent specification and security/code-quality review of the exact branch. Resolve every Critical and Important finding with a failing regression test before a fix.
- [x] Close review findings for durable best-effort cleanup, a single bounded
  execution deadline with cancellation grace, exact runner-temporary cleanup,
  and two-actor/two-sighting post-denial invariance with normalized Storage
  error classes.
- [ ] Push `codex/hosted-gate-2b` with Git identity `zhouping151140 <zhouping151140@gmail.com>` and open a stacked PR targeting `codex/ios-device-lab`.
- [ ] Stop for immediate owner confirmation before creating a Supabase personal access token or transmitting the five Hosted Gate secrets and three Device Lab client values to GitHub.
- [ ] Create `hosted-gate-2b` with required reviewer `ZP151`, self-review allowed, and exact branch policy `codex/hosted-gate-2b`. Create `ios-device-lab` with reviewer `ZP151` and exact branch policy `main`.
- [ ] Set only the approved environment secrets. Read back names, timestamps, protection rules, and branch policies without reading values.
- [ ] Push or rerun the exact reviewed producer SHA, then stop for owner approval of the queued `hosted-gate-2b` deployment.
- [ ] Wait for completion, inspect sanitized logs and artifact inventory, download the exact evidence artifact, verify its attestation/run metadata, and run the promotion adapter.
- [ ] Validate `docs/evidence/pilot-gate-2b-readiness.json` with the Device Lab consumer at current branch HEAD.
- [ ] Commit the evidence and evidence narrative, push, wait for all CI checks, and repeat independent final review if the evidence commit changes executable inputs.
- [ ] Present PR #4 and the stacked Gate 2B PR for explicit merge approval. Require merge commits rather than squash/rebase so the tested source remains an ancestor. Do not merge or dispatch the iOS candidate in this task.

## Completion Boundary

This plan reaches completion only when a real protected run against `fhugdtpjbgiatqhvjioy` succeeds, synthetic cleanup is proven, the canonical unexpired readiness JSON is committed, all local/remote verification and independent reviews pass, and both PRs are ready for owner merge approval. Full Storage-token-expiry closure, merge, candidate dispatch, AltStore re-signing, and physical-iPhone testing remain separately authorized steps.
