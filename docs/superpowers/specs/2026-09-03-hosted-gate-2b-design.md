# WhiskerCommons Hosted Gate 2B Design

**Status:** Approved design direction; implementation and remote execution remain gated by this written specification and its implementation plan.

**Goal:** Deploy the reviewed schema and Edge Functions to the dedicated Singapore Supabase project, exercise the safety-critical media path with two synthetic authenticated users, and produce short-lived, machine-verifiable readiness evidence for the iOS Device Lab without exposing privileged credentials to the device build.

**Hosted project:** `anicare-gate-2b`, project ref `fhugdtpjbgiatqhvjioy`, origin `https://fhugdtpjbgiatqhvjioy.supabase.co`, region `ap-southeast-1`.

## Current state

The dedicated hosted project is healthy and has no repository integration, migrations, requests, branches, backups, or application data. The repository has no GitHub Environments, repository secrets, or repository variables. The existing local Gate 2A suite is green, but its environment validator intentionally rejects remote hosts and must not be weakened or reused as a hosted entry point.

The Device Lab already consumes `docs/evidence/pilot-gate-2b-readiness.json` through a strict schema and a fail-closed validator. It does not deploy or refresh Gate 2B and must never receive Gate 2B privileged credentials.

## Non-goals

- Do not use production or personal user data, real cat photographs, real addresses, or real precise locations.
- Do not reset, delete, pause, restore, clone, or otherwise destructively recreate the hosted project.
- Do not claim production readiness, App Store readiness, full Singapore launch readiness, real AI accuracy, or physical-iPhone success.
- Do not wait for or simulate expiry of a real two-hour Storage capability in this readiness slice. The long-lived token-expiry closure remains separate evidence.
- Do not enable automatic identity confirmation, a public AI UI, training, embeddings, or a hosted AI worker.
- Do not store Apple credentials, a Supabase service-role/secret key, a database password, or a Supabase personal access token in the iOS Device Lab environment or an app artifact.

## Selected approach

Use a dedicated, protected GitHub Actions producer and a separate hosted integration package. The producer incrementally deploys only to the fixed test project, runs bounded synthetic checks, writes an allowlisted readiness document on the runner, and uploads that document as a short-retention artifact. A local promotion command verifies the workflow identity and artifact before the exact JSON is committed for Device Lab consumption.

This is preferred over a local-only operator script because the readiness contract requires an auditable workflow run ID and attempt. It is preferred over the Supabase GitHub integration because that integration would introduce broader persistent repository access and less explicit release control.

## Repository and branch isolation

Implementation lives in a linked worktree on `codex/hosted-gate-2b`, created from the exact reviewed Device Lab head. It produces a separate stacked pull request rather than adding Gate 2B deployment code to PR #4.

The first pre-merge hosted run is allowed only from the exact branch `codex/hosted-gate-2b`. The workflow may use a branch-scoped `push` trigger with a narrow path allowlist because a newly added `workflow_dispatch` workflow is not dispatchable until its file exists on the default branch. The protected environment requires the owner to inspect and approve the exact queued SHA before credentials are released. After merge, future refreshes use `workflow_dispatch` from `main`; the bootstrap branch policy is then removed.

Evidence remains valid after merge only when the tested source commit is an ancestor of the candidate. Therefore PR #4 and the stacked Gate 2B PR must be integrated with merge commits. Squash or rebase merging is prohibited for this evidence instance; either would require a new Gate 2B run from the resulting `main` SHA.

## Environment separation

### `hosted-gate-2b`

This environment is restricted initially to `codex/hosted-gate-2b`, requires reviewer `ZP151`, and permits self-review because the repository currently has one owner. It stores only the values needed for hosted deployment and synthetic inspection:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLIC_KEY`
- `PRECISE_LOCATION_ENCRYPTION_KEY`

The database value is the dashboard-provided session-pooler PostgreSQL URL for this project. Its parser requires PostgreSQL, database `postgres`, username `postgres.fhugdtpjbgiatqhvjioy`, the exact reviewed Supabase pooler host and port, no query or fragment, and a nonempty password. The orchestrator derives `SUPABASE_DB_PASSWORD` only in the memory of the minimum child environment required by the CLI; it never prints or writes the connection URL. The harness uses the same URL with prepared statements disabled for narrow parameterized inspection and cleanup.

The project ref, project origin, reviewed pooler host, Auth redirect values, and media public origin are fixed non-secret source constants. Secrets are exposed only to the steps that validate, deploy, test, and clean up. Checkout, dependency setup, hashing, artifact upload, and attestation steps receive no secrets.

### `ios-device-lab`

This environment is restricted to `main`, requires reviewer `ZP151`, and contains only values intended to ship in the client:

- `GOOGLE_MAPS_IOS_API_KEY`, restricted in Google Cloud to Maps SDK for iOS and bundle identifier `sg.animalhelper.app`;
- `EXPO_PUBLIC_SUPABASE_URL`, exactly `https://fhugdtpjbgiatqhvjioy.supabase.co`;
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`, either the hosted publishable key or a legacy JWT whose role is exactly `anon`.

No value is copied between the two environments except the same public Supabase origin and public key. Creating a Supabase personal access token or a Google Maps API key, and transmitting privileged Supabase values from the dashboard to GitHub, requires an immediate action-time owner confirmation.

## Producer workflow

The producer is a manual-security workflow even when the initial event is `push`: environment approval is mandatory before any remote mutation. It uses pinned Node, pnpm, Deno, Supabase CLI, checkout, artifact, and attestation versions. Repository workflow permissions default to `contents: read`; only the evidence attestation job receives `id-token: write` and `attestations: write`. It never receives `contents: write` and cannot commit evidence itself.

The ordered stages are:

1. Check out the immutable event SHA with full history and prove `HEAD == GITHUB_SHA`.
2. Validate the exact repository, allowed event/ref, project ref/origin, environment name, credential shapes, migration inventory, Edge Function inventory, and absence of uncommitted inputs. Emit only bounded validation codes.
3. Verify the public key against `GET /auth/v1/settings` at the exact HTTPS origin without retaining or printing the body.
4. Link the Supabase CLI to the fixed project and apply pending migrations incrementally. Destructive reset, repair, squash, seed, dump, restore, and arbitrary SQL execution are not available to the orchestrator.
5. Configure Auth to use site URL `animalhelper://` and the sole additional redirect `animalhelper://auth/callback`, then read the configuration back and compare it exactly.
6. Set only the three reviewed Edge runtime values: the 32-byte location encryption key, `MEDIA_ALLOWED_ORIGIN` equal to the hosted origin, and `MEDIA_PUBLIC_SUPABASE_ORIGIN` equal to the hosted origin.
7. Deploy the reviewed Edge Function allowlist. Extra remote functions are reported but not deleted automatically.
8. Run readiness, media privacy, owner happy-path, and cross-owner isolation scenarios serially with bounded request and total deadlines.
9. Run unconditional fixture cleanup and prove zero synthetic Auth users, sightings, upload jobs, media rows, and Storage objects associated with the run. A cleanup mismatch fails the producer and suppresses passing evidence.
10. Compute the migration-head and Edge Functions tree SHA-256 values from regular, non-symlink repository inputs.
11. Generate one exact readiness JSON file, validate it against the repository schema and Device Lab policy, attest it, upload it with short retention, and remove runner-local copies in an unconditional cleanup step.

Any deployment or test failure stops later success stages. A rerun is a new attempt and produces new evidence; the producer never edits a previous document in place.

## Hosted harness boundaries

Create `tests/pilot-gate-2b` as a separate workspace package. It reuses only environment-independent Gate 2A primitives after those primitives are moved behind a small shared contract: deterministic EXIF-free JPEG creation, strict actor request/response mapping, bounded network access, endpoint allowlisting, and secret redaction. The Gate 2A local environment validator and local process orchestrator remain unchanged and continue rejecting remote hosts.

The hosted environment parser accepts only:

- exact HTTPS origin `https://fhugdtpjbgiatqhvjioy.supabase.co` with no userinfo, path, query, fragment, redirect, or alternate port;
- one public publishable/anon key and one distinct privileged service-role/secret key;
- a canonical 32-byte Base64 location encryption key;
- `PILOT_GATE_2B=1`, exact source SHA, positive workflow run ID/attempt, and canonical millisecond UTC timestamps.

The harness has no general-purpose SQL or shell interface. Privileged inspection and final fixture removal use fixed parameterized statements that accept only the exact in-memory run UUIDs; all other privileged operations use narrowly typed Supabase service operations and exact table/RPC allowlists. Actor operations use only each actor's own access token and the public HTTP surface.

## Synthetic data model

Each run creates two confirmed Auth users with random in-memory passwords and `@example.invalid` addresses, two minimal adult profiles, and two sightings with deterministic synthetic Singapore-area coordinates. The coordinates are fixtures, not observations, and are never printed. The only image is the existing deterministic 1x1 EXIF-free JPEG.

Every fixture carries a random run marker stored only in fields already intended for client deduplication or synthetic traits. Cleanup selects by the exact created IDs retained in memory; it must not use broad timestamp deletion, email-domain deletion, table truncation, or wildcard Storage deletion.

## Required checks

### `authRedirectCheck`

- Management configuration readback reports site URL `animalhelper://`.
- The allowlist contains exactly `animalhelper://auth/callback` for this dedicated project.
- No HTTP wildcard or unrelated redirect is accepted.

### `mediaStagingCheck`

- Bucket `media-staging` exists with `public = false`, JPEG-only MIME policy, and 20 MiB maximum size.
- Anonymous and both ordinary authenticated users cannot list or read arbitrary staging objects.
- Remote migrations contain the exact current migration head before the check passes.

### `publicKeyOriginCheck`

- The public key receives a successful bounded response only from the exact hosted Auth endpoint.
- Redirects, alternate origins, privileged keys, malformed JWTs, and response bodies larger than the bound fail closed.

### `syntheticOwnerHappyPath`

- The owner creates a public delayed sighting through `create-sighting`.
- The owner reserves the deterministic media receipt through `reserve-media-upload`.
- The harness performs one signed non-upsert JPEG upload.
- The owner finalizes through `finalize-media-upload`.
- Service inspection proves one quarantined media asset and one finalized upload job bound to the owner, sighting, media ID, hash, dimensions, bucket, and object path.
- A repeated finalization is idempotent and creates no duplicate asset.

### `crossOwnerIsolation`

- The stranger cannot reserve against, finalize, delete, list, or read the owner's sighting, upload job, media asset, or Storage object.
- Owner and stranger may use the same client media UUID only within their own owner-scoped sightings.
- Denials use the documented bounded response classes and reveal no existence oracle.
- Every denied operation is bracketed by a bounded canonical snapshot covering
  both synthetic users, both fresh sightings, all probe media IDs, and both
  known Storage paths. Database rows, soft-delete state, and object existence
  must remain byte-for-byte equivalent. Storage read denials must also match on
  both HTTP status and an allowlisted normalized error code; unknown, malformed,
  redirected, successful, or oversized responses fail closed.

All five readiness values are `passed` only after cleanup also succeeds. Otherwise no passing evidence is emitted.

## Evidence contract

The producer emits exactly these fields and no others:

```json
{
  "schemaVersion": 1,
  "projectRef": "fhugdtpjbgiatqhvjioy",
  "projectOrigin": "https://fhugdtpjbgiatqhvjioy.supabase.co",
  "sourceCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "migrationHead": {
    "filename": "202608310010_my_reports_projection.sql",
    "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "edgeFunctionsTreeSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "workflowRunId": 1,
  "workflowRunAttempt": 1,
  "createdAt": "2026-09-03T00:00:00.000Z",
  "expiresAt": "2026-09-06T00:00:00.000Z",
  "authRedirectCheck": "passed",
  "mediaStagingCheck": "passed",
  "publicKeyOriginCheck": "passed",
  "syntheticOwnerHappyPath": "passed",
  "crossOwnerIsolation": "passed"
}
```

The actual expiry is exactly 72 hours after creation. The document contains no user ID, email, password, JWT, object path, signed URL, database locator, coordinates, request/receipt identifier, service key, access token, or free-form diagnostic.

The local promotion adapter accepts only an artifact from the pinned producer workflow, exact repository, exact successful run/attempt and exact source SHA. It rejects symlinks, extra files, noncanonical JSON, unknown fields, failed checks, a future or expired timestamp, changed migrations/functions, and an unrelated source commit. Promotion copies only the validated JSON to the fixed evidence path; committing and pushing remain explicit operator actions.

## Diagnostics and cleanup

Expected output is limited to stage names and fixed snake-case result codes. Failure diagnostics may retain only an allowlisted stage, normalized HTTP status class, count, and fixed code. Sanitization runs before any artifact is written and rejects bearer strings, JWT shapes, secret prefixes, URLs with queries, UUIDs, object paths, emails, coordinates, request bodies, and long lines.

Cleanup runs in `finally` semantics after partial fixture creation, test failure, cancellation, or timeout. It removes exact Storage objects through the service client, deletes only rows bound to the in-memory synthetic IDs through fixed parameterized database statements in foreign-key order, deletes the exact Auth users, and then proves their absence. Every recovery, deletion category, and absence proof is attempted best-effort; failures are aggregated and the durable ledger is retained unless the complete absence proof succeeds. An operation that ignores cooperative cancellation receives only a bounded grace period; in-process cleanup is then suppressed until the parent terminates the harness, and the workflow starts the independent ledger cleanup process. The workflow reserves a separate cleanup budget inside a 30-minute job and removes only its exact numeric run/attempt directory under `runner.temp`. It never truncates tables, selects by time range or email domain, accepts a table name, or executes caller-provided SQL. Cleanup failure is a release failure. Schema and reviewed Edge deployments persist because this is a dedicated hosted test project; the producer does not roll them back to older code.

The integration harness requires `PILOT_GATE_2B=1`. The cleanup-only process
deliberately does not: recovery must remain callable if cancellation occurs
before the integration configuration is evaluated.

## Verification and review gates

Implementation follows red-green-refactor. Required evidence before the hosted run includes:

- focused unit tests for hosted environment validation, public/privileged key separation, evidence generation, redaction, fixture cleanup, workflow input discovery, and promotion;
- unchanged passing Gate 2A tests proving the local-only guard remains intact;
- workflow structure tests proving exact triggers, environment separation, step-scoped secrets, permissions, timeouts, cleanup, artifact allowlists, and no privileged data path into Device Lab;
- full repository lint, typecheck, unit tests, builds, policy validators, and database contracts;
- independent specification and security/code-quality reviews with every Critical or Important finding resolved.

The first remote mutation requires an approved exact producer SHA and an action-time confirmation before creating/transmitting persistent credentials. A successful hosted run plus a validated committed readiness file reaches the merge-approval checkpoint. It does not authorize merging, dispatching the iOS candidate, downloading an IPA, entering an Apple Account, or claiming physical-device success.

## Merge and handoff sequence

1. Implement and independently review the producer on `codex/hosted-gate-2b`.
2. Configure both protected environments after action-time credential confirmation.
3. Queue the exact reviewed producer SHA and have owner `ZP151` approve the `hosted-gate-2b` deployment.
4. Run Hosted Gate 2B and commit the verified readiness artifact to the stacked branch.
5. Present PR #4 and the Gate 2B PR for owner merge approval.
6. Merge PR #4 with a merge commit, then merge the Gate 2B PR with a merge commit.
7. Confirm the tested source is an ancestor of merged `main`, the evidence remains current, and both environment branch policies are `main`-only.
8. Request a separate owner authorization before dispatching the protected iOS candidate.
