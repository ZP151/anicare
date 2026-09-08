# Hosted Gate 2B Reliability Remediation Design

**Status:** Approved design direction; implementation starts only after review of this written specification.

**Supersedes:** The latency, timeout, cleanup coupling, performance-attestation, and repeated-run requirements in `docs/superpowers/specs/2026-09-03-hosted-gate-2b-design.md`. The original security, synthetic-data, isolation, idempotency, immutable-source, and credential-separation requirements remain in force.

## Goal

Make Hosted Gate 2B a reliable correctness gate for the media finalization path, while measuring hosted latency as a distribution rather than treating a five-second SLO as a per-request hard timeout. Reduce finalization latency by removing avoidable Edge-to-Postgres round trips, propagate cancellation where the runtime supports it, and verify cleanup independently from request latency.

## Root cause

The current harness conflates four different concerns:

- a five-second performance objective;
- a five-second client hard timeout;
- a shared 75-second fixture-plus-checks deadline;
- cleanup and absence proof inside the same 100-second execution envelope.

The hosted scenario performs many sequential Auth, PostgREST, Storage, and direct Postgres operations. The first owner finalization itself performs Auth lookup, profile lookup, sighting lookup, job lookup, Storage download, hashing and JPEG inspection, and a final transaction RPC. A single hosted latency outlier therefore causes an artificial client timeout.

The manual 30-second exception allowed the first finalization to progress, but the larger scenario then exhausted its shared checks budget. Most actor calls do not consume the gate's `AbortSignal`, and the cleanup callback discards it entirely. When a deadline expires, work can remain unsettled through the cancellation grace period and the executor reports the condition as a generic cleanup failure. This makes the failure category misleading and couples remote mutation lifetime to test-runner timing.

## Non-goals

- Do not require every hosted finalization to complete within five seconds.
- Do not use two consecutive runs as statistical evidence of latency reliability.
- Do not move finalization to a `202 Accepted` background job. The operation is small, immediately user-visible, and already has an idempotent transaction boundary.
- Do not weaken authentication, ownership checks, Storage validation, SHA-256 verification, JPEG inspection, transaction atomicity, cross-owner isolation, or exact fixture cleanup.
- Do not add OpenTelemetry infrastructure, a new hosted observability vendor, or a k6 dependency for this remediation.
- Do not place secrets, user identifiers, object paths, signed URLs, request bodies, or free-form remote errors in logs or artifacts.

## Selected approach

Use a synchronous, deadline-aware finalization path with one consolidated database preflight RPC, followed by Storage validation and the existing atomic finalization RPC. Keep the operation idempotent. Separate PR correctness, cleanup hygiene, and performance characterization into different phases with independent results.

This is preferred over merely increasing timeouts because it removes avoidable work and preserves bounded failure. It is preferred over parallel PostgREST reads because all three authorization/job reads reside in the same Postgres database and can be evaluated in one service-role-only function. It is preferred over background processing because callers need the finalized asset identifier immediately and the current transaction is already replay-safe.

## Finalization data flow

The production request remains synchronous:

1. The Edge Function validates method, origin, content type, bounded JSON, and the exact request schema.
2. Supabase Auth validates the bearer token and returns the caller identity.
3. One service-role-only database RPC validates adult status, sighting ownership, upload-job ownership, media ID, SHA-256, reservation state, and existing finalized state. It returns either a bounded finalization context or no row.
4. If the job is already finalized and its asset is active, the function returns the same asset identifier without downloading Storage content or creating another row.
5. For a reserved job, the function downloads the one exact staging object, verifies byte length, SHA-256, and JPEG dimensions.
6. The existing atomic finalization RPC locks the upload job, revalidates its identity and state, creates or reuses the quarantined asset, and returns the asset identifier.
7. The response remains the exact `{ mediaAssetId, status: "quarantined" }` success shape.

The consolidated preflight function is `security definer`, has a fixed safe `search_path`, fully qualifies all relations, accepts only typed scalar arguments, and is executable only by `service_role`. Public, `anon`, and `authenticated` retain no execute privilege. pgTAP coverage proves the privilege boundary, ownership denial, adult-status denial, reservation expiry handling, and replay behavior.

## Timing instrumentation

The Edge Function records fixed labels and integer durations for:

- `request_parse_ms`
- `auth_ms`
- `db_preflight_ms`
- `storage_download_ms`
- `media_validation_ms`
- `finalize_rpc_ms`
- `total_ms`

Labels are constant source strings. Values are non-negative bounded integers. Logs contain no dynamic identifiers or error text. The function records a fixed outcome class such as `success`, `authentication_denied`, `authorization_denied`, `conflict`, or `internal_failure`.

The existing canonical failure-control record remains capped at 320 UTF-8 bytes for compatibility with the existing producer. Performance samples are written to a separate sanitized JSON artifact with a three-day retention period. That artifact contains only source SHA, run ID and attempt, region, sample count, fixed outcome counts, and aggregate `min`, `p50`, `p95`, and `max` durations. It is not an attestation and is not consumed by the iOS Device Lab.

Before changing the production timeout, a manual characterization run invokes the owner finalization at least 20 times against fresh synthetic reservations. It uses a 30-second measurement ceiling solely to avoid an unbounded run. The report confirms the deployed Edge region and the fixed Supabase project region. Individual latency samples are not uploaded; only aggregates are retained.

## Deadline and cancellation model

Five seconds remains the performance SLO but is no longer the hard timeout. The manual characterization run uses a 30-second measurement ceiling, then selects the smallest fixed correctness timeout in `{ 10, 12, 15 }` seconds that is at least the measured successful maximum plus a 25-percent safety margin. If no allowed value covers that margin, the remediation stops for further latency optimization; it does not raise the gate above 15 seconds without a new design decision. The selected value and its inputs are recorded in the aggregate performance artifact.

Actor APIs accept an optional `AbortSignal` and a validated timeout. The network helper combines caller cancellation with its local timer and distinguishes caller cancellation from local timeout without reading exception text. Reserve, upload, finalize, replay, delete, Storage privacy probes, and direct HTTP probes receive the current phase signal.

Direct Postgres inspection uses statement and lock timeouts as before and closes the session when its phase is cancelled. Supabase client operations that expose an abort facility receive the phase signal. Calls whose SDK does not expose cancellation remain individually bounded; the harness does not claim that aborting the client cancels already accepted server-side work.

The executor reports `checks_timeout`, `checks_unsettled`, `cleanup_timeout`, and `cleanup_failure` as distinct fixed categories. An unsettled checks operation never masquerades as a cleanup failure.

## Gate separation

### PR correctness gate

One representative hosted scenario runs per relevant source SHA. It validates:

- Auth redirect and public-key origin;
- owner reserve, signed upload, finalization, inspection, and idempotent replay;
- media-staging privacy;
- cross-owner reserve, finalize, delete, list, and read denial;
- absence of duplicate jobs, assets, and objects.

The request hard timeout is the characterized value from the fixed `{ 10, 12, 15 }` second allowlist. The correctness phase has its own bounded workflow timeout, but it does not include cleanup latency. A correctness failure suppresses passing readiness evidence.

### Cleanup hygiene

Cleanup remains an unconditional workflow phase driven by the durable ledger. It starts only after the correctness process has exited, so no in-process operation can continue mutating the same fixture concurrently. It removes only exact tracked objects, rows, profiles, sightings, and Auth users, then polls bounded absence checks until the hosted state converges or the existing three-minute workflow-step timeout expires.

Cleanup reports its own fixed operation failures. Cleanup failure still fails Hosted Gate 2B and suppresses readiness evidence, but cleanup duration is excluded from finalization latency metrics.

### Performance characterization

Performance characterization is manual initially and may later become scheduled. It is not a per-PR required check. Each report contains at least 20 valid samples and evaluates:

- `p95 finalization latency <= 5,000 ms` as the initial SLO;
- the observed transport and HTTP error rate;
- the 30-second characterization-ceiling timeout count;
- cold versus warm samples when the platform metadata makes that distinction available.

With fewer than 100 samples, the report does not claim an error rate below one percent; it reports the observed count and rate. A future rolling window of at least 100 samples may enforce `error_rate < 1%`. Performance regression creates a visible failed monitor or warning but does not rewrite correctness evidence from an already successful source SHA.

## Workflow and evidence changes

- Remove the temporary `relaxed_finalize_timeout` workflow input and all 5,000/30,000 millisecond branching.
- Run the correctness harness and durable-ledger cleanup as separate processes and separately timed workflow steps.
- Generate readiness evidence only when both correctness and cleanup succeed.
- Keep the existing immutable-source, migration inventory, Edge deployment, secret scoping, artifact validation, and Device Lab evidence schema.
- Remove build-provenance attestation as a performance requirement. If the existing readiness provenance is retained for audit compatibility, it is downstream of correctness and cleanup and has no latency semantics.
- Do not require two consecutive strict hosted runs. One successful representative correctness run is the PR gate; distribution claims come only from the characterization workflow.

## Error handling and recovery

Every mutation is either naturally idempotent or keyed by the existing reservation/job identity. A client timeout does not trigger an immediate blind retry. The harness may replay the exact finalization request only after timeout because the server transaction already guarantees the same job returns the same asset and cannot create a duplicate.

The durable ledger is written before each remotely mutating step. If correctness times out or crashes, the workflow terminates that process before launching cleanup. Cleanup is authoritative for test hygiene and retains the ledger until the complete absence proof succeeds.

Failure artifacts expose only fixed stages, fixed outcome classes, bounded integer durations, and fixed cleanup-operation identifiers. Raw child output remains unavailable to the artifact path. Detailed fixed-label timing is inspected in the protected Supabase Function logs.

## Testing strategy

Implementation follows red-green-refactor.

Database tests cover the consolidated preflight RPC, grants, denial cases, expired reservations, active finalized replay, deleted assets, and hostile identity combinations. Edge tests cover exact response shapes and prove that the function uses one preflight RPC before Storage validation and one finalization RPC afterward.

Actor and network tests prove the fixed timeout allowlist and selection rule, caller cancellation, timer cancellation, single-settlement behavior, exact timeout classification, and idempotent replay. Executor tests prove that checks timeout, unsettled checks, cleanup timeout, and cleanup failure remain distinct and that cleanup does not begin while correctness work is still active.

Workflow contract tests prove separate correctness and cleanup steps, unconditional ledger cleanup, removal of the temporary relaxation input, step-scoped secrets, evidence suppression on either failure, and separation of performance artifacts from readiness evidence.

Local verification includes focused packages, Gate 2A regression tests, Gate 2B unit tests, database contracts, Edge lint/type checks, workflow contract tests, `git diff --check`, and full `pnpm verify`.

Hosted verification consists of:

1. one manual 20-sample characterization run to establish the latency distribution and locate the dominant stage;
2. one default PR correctness run with the characterized hard timeout;
3. unconditional cleanup with a complete zero-residual proof;
4. readiness evidence validation if correctness and cleanup pass.

No merge, PR-ready transition, or iOS Device Lab candidate dispatch is authorized by this remediation. Those remain separate owner decisions.

## Acceptance criteria

- The finalization Edge path replaces separate profile, sighting, and job reads with one restricted preflight RPC.
- Finalization remains synchronous, authenticated, owner-bound, SHA/JPEG verified, atomic, and idempotent.
- Five seconds is represented only as the p95 performance objective, not as the hard timeout.
- Correctness uses the smallest characterized hard timeout in the fixed `{ 10, 12, 15 }` second allowlist and never depends on the manual relaxation switch.
- All cancellable hosted operations consume the phase signal; uncancellable SDK calls remain individually bounded and documented.
- Generic cleanup no longer hides checks timeout or unsettled work.
- Correctness, cleanup, and performance results are measured independently.
- Cleanup starts after the correctness process exits and proves zero tracked Auth, database, and Storage residue.
- A characterization artifact reports at least 20 samples with `min`, `p50`, `p95`, `max`, outcome counts, and region, without sensitive values.
- The default Hosted Gate 2B PR check passes without a manual timeout exception.
- All local verification commands pass before the hosted run.
