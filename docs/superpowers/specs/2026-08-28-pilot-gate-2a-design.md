# WhiskerCommons Pilot Gate 2A Design

**Status:** Approved by the user on 2026-08-28

**Goal:** Prove the reviewed-media backend contract against a fresh, disposable Supabase stack with two real Auth sessions, real Edge handlers, real signed Storage upload, and real database state transitions before any hosted or physical-device pilot work.

**Non-goal:** This gate does not deploy a hosted Supabase project, use persistent credentials or real user data, configure EAS, validate physical devices, publish media, run automatic cat-face identification, or claim Singapore pilot readiness.

## Decision

Use a CI-provisioned ephemeral Supabase local stack. The mandatory integration harness exercises public HTTP/Auth/Storage behavior as two synthetic adult users. A separate privileged fixture adapter may create and inspect synthetic records and advance time-sensitive database state, but it must not add test-only RPCs, policies, routes, or production runtime branches.

The alternatives were rejected for this gate:

- A persistent hosted development project introduces long-lived secrets, mutable shared state, cleanup risk and poorer reproducibility before the local contract is proven.
- Running both local and hosted integration suites now broadens the gate without resolving native credentials, test-data governance or hosted operations.

Hosted staging remains Pilot Gate 2B.

## Evidence baseline

Pilot Gate 1 already proves, on GitHub Actions run `33150070674`, that a fresh PostgreSQL 17 stack applies all migrations, every pgTAP contract passes, every Edge entrypoint type-checks under pinned Deno, warning-level database lint passes, and the repository-wide source gates are green.

That evidence does not prove that Auth, Edge Runtime, Storage and Postgres compose correctly over HTTP. The current missing evidence is:

1. two independent confirmed Auth users can obtain and use real access tokens;
2. an owning adult can reserve, upload and finalize a policy-valid JPEG;
3. another authenticated adult cannot act on the owner's sighting, reservation or media;
4. signed upload capability replay, reservation expiry, recorded token-lifetime deferral and non-upsert behavior are enforced by the composed stack;
5. reservation, finalization and deletion races converge on one valid database outcome;
6. deletion and staging cleanup coordinate with outstanding signed capabilities without recreating deleted media.

## Safety invariants

- All people, sightings, IDs, receipts and images are synthetic and generated per run.
- The JPEG fixture is deterministic, contains no EXIF or location metadata, and is small enough for source control or deterministic in-memory construction.
- Actor operations use only that actor's access token and public HTTP endpoints. Service-role access is confined to fixture setup, bounded state inspection and clock-state manipulation that production clients cannot perform.
- The service-role key, user passwords, access tokens, signed URLs, upload tokens, precise coordinates and database connection strings must never be printed, persisted to disk/artifacts, snapshotted, or written to Git.
- No test-only production RPC, RLS policy, Edge route or environment-triggered authorization bypass is allowed.
- The harness must assert database state through stable semantic predicates rather than retaining response bodies containing capabilities.
- Every CI run tears down the local stack, even after a failing assertion. Teardown targets only the repository-scoped Supabase project.
- A failing local-stack test blocks promotion but does not weaken production authorization, retention, quarantine, deletion or cleanup behavior.

## Architecture

### 1. Dedicated integration workspace

Add a small Node 22 workspace under `tests/pilot-gate-2a` with its own package metadata, strict TypeScript configuration and separate Vitest unit/integration configurations. Ordinary repository tests run only the unit configuration. Integration files run serially against the shared disposable stack; concurrency exists only inside explicit barrier scenarios. Reuse the repository's existing `@supabase/supabase-js` version rather than introducing an HTTP abstraction or a second client library.

The workspace contains four boundaries:

- `environment`: validates only the expected local URL and required ephemeral keys from process memory;
- `fixtures`: creates two confirmed users, adult profiles, owned sightings and deterministic JPEG metadata;
- `actors`: exposes reserve, signed PUT, finalize and delete operations parameterized by a user access token;
- `inspection`: performs narrowly scoped service-role reads and database-only time manipulation for assertions that cannot be reached through public APIs.

Actor results are normalized to status and bounded error codes. Raw headers, bodies, sessions and signed capabilities are kept in memory and never logged.

### 2. Ephemeral stack orchestration

Extend the existing `database-contracts` job after pgTAP and lint:

1. start the pinned Supabase `2.84.2` local stack;
2. capture `supabase start` and `supabase status` output without forwarding it, parse local API URL, anonymous key, service-role key and database URL in process memory, then register CI masks before invoking any downstream command;
3. provide credentials to the harness only through the same process environment;
   write only the fixed synthetic location-encryption key, allowed request origin
   and validated local public Supabase origin to the temporary Edge env file;
   the fixed key protects synthetic ephemeral test data only and is not a deploy
   credential or a confidentiality claim;
4. serve all repository Edge functions through the local Edge Runtime;
5. wait on a bounded readiness probe;
6. run the Gate 2A integration workspace;
7. upload only sanitized runtime logs on failure if they contain no headers, secrets, URLs with query strings or request bodies;
8. stop the repository-scoped local stack in an unconditional final step.

The harness must refuse non-loopback Supabase URLs by default. HTTP API/origin URLs must contain no userinfo. The local database URL necessarily contains credentials, so it is accepted only when its scheme, expected local userinfo, loopback host, port and database name match the disposable stack exactly; it is never stringified or echoed. A separate, explicit future command will be required for hosted Gate 2B; the Gate 2A command cannot accidentally point at a remote project.

### 3. Synthetic identities and sightings

Create two unique confirmed users through the local admin Auth API and sign each in with password authentication to obtain independent access tokens. Insert the minimum adult `user_profiles` rows through the privileged fixture boundary.

Create one sighting for each actor through the real `create-sighting` Edge function when practical. If that route introduces unrelated location-encryption setup into a media-only scenario, a fixture helper may insert the minimum valid sighting through existing production RPCs while retaining owner binding. The suite must still contain at least one smoke assertion that the owner token can reach the configured Edge Runtime.

Each test receives isolated users and records or performs deterministic cleanup. No test depends on ordering or data from another test.

### 4. Real media happy path

For the owner's sighting:

1. construct a valid receipt and deterministic JPEG fixture;
2. call `reserve-media-upload` with the owner's access token;
3. validate job/media binding, path shape, expiry ordering and signed capability origin without logging the capability;
4. upload bytes with a real signed non-upsert Storage PUT;
5. call `finalize-media-upload` with the expected SHA-256;
6. assert one quarantined media asset is bound to the correct owner, sighting and media ID;
7. verify the staging job reaches the expected finalized state and public clients cannot read private media rows or objects.

Idempotent retry assertions repeat safe operations using the same logical identity and require either the same semantic result or the documented bounded conflict, never a duplicate asset.

### 5. Isolation, replay and expiry matrix

The mandatory suite covers:

- user B cannot reserve for user A's sighting;
- user B cannot finalize or delete user A's media;
- a media identity `(uploader_id, client_media_id)` cannot be rebound to another sighting or upload job; another owner may independently reuse the same client media ID on their own sighting;
- a second signed PUT to the same non-upsert path fails and leaves the original object unchanged;
- a finalized capability cannot create a second asset;
- a forced-expired reservation cannot be finalized;
- deletion remains deferred while an actually minted upload credential may still be valid, and replay cannot overwrite its retained non-upsert object;
- direct anonymous and authenticated reads of private staging/final media are denied.

Reservation expiry is induced only by the privileged test control plane updating existing database time columns. That does not expire an already minted Storage JWT: `upload_token_expires_at` is a conservative cleanup watermark, not the Storage service's signing clock. Gate 2A therefore does not delete the retained object early and does not claim real post-token-expiry replay evidence. A true post-expiry cleanup/replay test requires either waiting beyond the fixed Storage token lifetime or a separately approved Storage clock/token control in a later gate.

### 6. Concurrency and convergence

Use synchronized `Promise.allSettled` starts for small, bounded races:

- two reserves for the same media identity, both of which may idempotently return the same job/path with independently minted signed tokens (the token strings need not differ under deterministic test storage);
- two finalizations for the same uploaded object;
- delete racing with a repeated finalization, which must converge to a tombstoned asset and `deletion_pending` job rather than an active quarantined asset;
- two cleanup invocations claiming the same expired staging job.

Assertions focus on convergence: exactly one job/path for the logical media identity, at most one finalized asset, no owner change, no duplicate finalized asset, the scenario-specific terminal job state, and no public object exposure. Exact winning request order is intentionally unspecified.

### 7. Failure diagnostics

The test reporter prints only scenario names, HTTP status, bounded application error codes, counts and redacted record suffixes. It must not print full UUID-linked URLs, request bodies, raw Supabase errors, environment values or Storage paths. Edge Runtime output is captured only when needed and passed through a secret/query-string redactor before any failure artifact is retained.

Infrastructure readiness failures are reported separately from contract failures. A missing Docker runtime, unavailable local port or failed Edge Runtime startup is not a skipped success.

## TDD and verification strategy

Implementation follows red-green-refactor in vertical slices:

1. Environment and redaction tests fail before the harness accepts any input.
2. A readiness/auth smoke test proves the harness reaches a fresh local stack.
3. The owner happy path is written as a failing integration test, then made green without changing authorization policy.
4. Cross-user isolation and private-read tests are added before any helper broadening.
5. Replay/expiry and deletion/cleanup tests are added before privileged time controls.
6. Concurrency tests are last so failures are attributable to stable sequential contracts.
7. CI orchestration is validated on a pushed branch with a fresh runner.

Local source verification must include the integration workspace's lint, typecheck and non-stack unit tests. Full Gate 2A evidence additionally requires a fresh GitHub Actions runner with Docker and the pinned CLI/runtime versions.

## Acceptance criteria

- A fresh CI runner starts the local Supabase stack and all repository Edge functions without persistent secrets.
- Two confirmed synthetic adults obtain distinct sessions and remain isolated throughout the suite.
- Real reserve, signed PUT, finalize and delete/cleanup flows succeed for the owner and fail closed for the non-owner.
- Replay, reservation expiry, token-lifetime deletion deferral, idempotency and four bounded race scenarios converge without duplicate assets, owner drift or public object exposure.
- Test-only privileged access adds no production endpoint, policy, RPC or runtime branch.
- Logs and artifacts contain no access token, service-role key, signed token, signed URL, precise coordinate, raw request body or unredacted Storage path.
- The existing pgTAP, Deno, mobile, admin, AI and repository-wide verification gates remain green.
- Documentation continues to state that hosted Supabase, EAS/native devices, real test data, operational/legal drills and real AI identity evidence remain unresolved gates.

## Rollout and rollback

Land reviewable commits in this order: harness skeleton and redaction guard, local-stack/auth fixtures, owner flow, isolation/replay/expiry, concurrency/cleanup, CI orchestration and documentation. The integration workspace is additive; if CI orchestration is unstable, revert only the orchestration commit while retaining independently testable harness code. Never resolve flakiness by weakening authorization or accepting multiple terminal database outcomes.

Promotion to Pilot Gate 2B requires this suite to pass on a fresh GitHub Actions runner and a separately approved hosted-test-data and secrets plan. Real post-Storage-token-expiry cleanup/replay evidence remains open until a two-hour wait or approved clock/token control is available. Promotion to physical-device testing still requires EAS authentication, controlled credentials, registered devices and a user-approved test protocol.
