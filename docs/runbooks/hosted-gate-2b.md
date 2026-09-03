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
4. The producer verifies the public origin, incrementally runs `db push`, sets
   the exact Auth redirects, deploys the six allowlisted functions, runs two
   synthetic users, proves exact cleanup, and uploads one three-day evidence
   artifact. It never resets, repairs, seeds, dumps, restores, prunes, deletes,
   pauses, or queries the project through a general-purpose operator command.
5. Download the artifact into a new local directory containing only
   `pilot-gate-2b-readiness.json`.
6. Promote it with the successful run ID and attempt:

   `pnpm promote:pilot-gate-2b-evidence -- <artifact-directory> <run-id> <attempt>`

The promotion command queries GitHub for the immutable run identity, validates
the exact workflow/repository/SHA, ancestry and current deployment hashes, and
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
