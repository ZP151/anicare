# Hosted Gate 2B operator runbook

This runbook operates the dedicated Singapore test project `anicare-gate-2b`
(`fhugdtpjbgiatqhvjioy`). It is not a production deployment, a physical-iPhone
result, or proof of the unresolved two-hour Storage-token expiry scenario.

## Protected environments

Create the GitHub environment `hosted-gate-2b`, restrict it initially to
`codex/hosted-gate-2b`, require reviewer `ZP151`, and allow self-review while
the repository has one owner. Store only:

- `SUPABASE_ACCESS_TOKEN`
- the dashboard-provided session-pooler `SUPABASE_DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLIC_KEY`
- a new 32-byte Base64 `PRECISE_LOCATION_ENCRYPTION_KEY`

Creating the Supabase personal access token, reading privileged dashboard
values, or transmitting them into GitHub Secrets requires an immediate owner
confirmation at action time. Never put these values in a command, issue,
artifact, log, source file, chat, or the `ios-device-lab` environment.

The separate `ios-device-lab` environment is `main`-only and contains only the
Google Maps iOS key restricted to bundle `sg.animalhelper.app`, the exact public
Supabase URL, and the public publishable/anon key. It never receives a database
URL, service key, access token, or Apple Account credential.

## First protected run

1. Review the exact `codex/hosted-gate-2b` SHA and all required checks.
2. Push that SHA. The narrow bootstrap `push` trigger queues the producer.
3. Inspect the queued SHA and approve the `hosted-gate-2b` deployment in GitHub.
4. The producer verifies a clean checkout, deploys from an immutable archive
   of the exact workflow SHA, verifies the public origin, incrementally runs
   `db push`, sets the exact Auth redirects, deploys and reads back the six
   allowlisted functions, checks the exact remote migration version/name
   inventory, runs two synthetic users, proves exact cleanup, and uploads one three-day evidence
   artifact. It never resets, repairs, seeds, dumps, restores, prunes, deletes,
   pauses, or queries the project through a general-purpose operator command.
   A mode-0600 exact-ID cleanup ledger is updated before each ambiguous media
   mutation; an unconditional protected cleanup step replays it after timeout
   or failure and refuses to delete by wildcard, time range, email, or domain.
   Recovery attempts every exact deletion category and the final absence proof
   even after a transient failure. The final runner cleanup removes only the
   current numeric run/attempt directory directly under `runner.temp`.
5. Promote it with the successful run ID and attempt:

   `pnpm promote:pilot-gate-2b-evidence -- <run-id> <attempt>`

The promotion command creates a private temporary directory, selects and
downloads the exact attempt-qualified artifact itself, verifies its GitHub
attestation against the fixed repository, workflow, source SHA/ref,
GitHub-hosted runner and SLSA provenance, validates the immutable run identity,
ancestry and current deployment hashes, and
atomically replaces only `docs/evidence/pilot-gate-2b-readiness.json`. It prints
no evidence contents or secrets.

## Merge and refresh

Commit promoted evidence explicitly. Merge the Device Lab PR first and the
stacked Gate 2B PR second, both with merge commits. Squash or rebase invalidates
ancestry and requires a new run. After merge, restrict `hosted-gate-2b` to
`main`, remove the bootstrap branch rule, and use `workflow_dispatch` on `main`.

Evidence expires exactly 72 hours after creation. Refresh it with a new approved
run; never edit timestamps or checks. Roll forward database changes with a new
migration and rerun the gate—do not reset or rewrite hosted migration history.
If a diagnostic artifact is produced, it contains only bounded codes and is
retained for three days; treat any unexpected content as an incident.

The true post-token-expiry cleanup/replay test remains open because it requires
the real capability lifetime. Do not infer that result from readiness evidence.

`PILOT_GATE_2B=1` is required only by the hosted integration-test configuration.
The separate unconditional cleanup process intentionally does not require that
flag: it must be able to replay the durable ledger after the test process is
cancelled before integration configuration is reached.
