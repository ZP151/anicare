# Pilot Gate 2A evidence ledger (Task 8)

## Observed evidence (as of this branch state)

Reference repository: [ZP151/anicare](https://github.com/ZP151/anicare)
Reference commit: [7c457ea409b710b7f51c6297edb0521df54ee395](https://github.com/ZP151/anicare/commit/7c457ea409b710b7f51c6297edb0521df54ee395)
Reference CI run: [33193118991](https://github.com/ZP151/anicare/actions/runs/33193118991)

Verified jobs on that run:

- [verify](https://github.com/ZP151/anicare/actions/runs/33193118991/job/98923364388) — successful
- [database-contracts](https://github.com/ZP151/anicare/actions/runs/33193118991/job/98923364075) — successful

Pinned workflow versions observed in `.github/workflows/ci.yml`:

- pnpm `11.19.0`
- Node `22`
- Deno `v2.9.5`
- Supabase CLI `2.84.2`

CI `database-contracts` uses a frozen dependency install, guarded unit/policy
checks and input discovery, then `pnpm pilot-gate-2a` for local startup plus the
real-stack suite. Sanitized diagnostic cleanup runs unconditionally, while
artifact upload is failure-only.

## Fresh local verification matrix (this task state)

| Check | Command | Result |
|---|---|---|
| Dependency install | `pnpm install --frozen-lockfile` | PASS |
| Peer checks | `pnpm peers check` | PASS |
| Gate 2A unit | `pnpm --filter @animalhelper/pilot-gate-2a test:unit` | PASS: 14 files / 97 tests |
| Gate 2A lint/typecheck | `pnpm --filter @animalhelper/pilot-gate-2a lint`<br>`pnpm --filter @animalhelper/pilot-gate-2a typecheck` | PASS |
| Edge validation | `pnpm --filter @animalhelper/edge-functions test`<br>`pnpm --filter @animalhelper/edge-functions typecheck` | PASS: 6 files / 63 tests |
| Mobile validation | `pnpm --filter @animalhelper/mobile test`<br>`pnpm --filter @animalhelper/mobile typecheck` | PASS: 37 suites / 517 tests |
| Python static checks | `python -m ruff check services/ai`<br>`python -m mypy services/ai/src` | PASS (9 source files) |
| Combined source run | `pnpm exec turbo run lint typecheck test build --force` | PASS: 24/24 tasks (AI 34, Admin 39, Domain 10, Edge 63, Gate 2A 97, Mobile 517; Expo 14 routes) |
| Combined node input tests | `node --test scripts/pilot-gate-inputs.test.mjs scripts/pilot-gate-2a-inputs.test.mjs` | PASS: 17/17 |
| UUID input gate | `node scripts/pilot-gate-inputs.mjs uuid` | PASS |
| Gate 2A input discovery | `node scripts/pilot-gate-2a-inputs.mjs` | PASS: 6 tests, 5 endpoints |
| Deno input gate | `node scripts/pilot-gate-inputs.mjs deno` | PASS (Deno 2.9.5) |
| Git hygiene | `git diff --check` and `git status --short --untracked-files=all` | PASS |

Environment notes:

- Final validated verification used Python `3.12.13` in an isolated environment because `services/ai` requires `>=3.12,<3.14`.
- An initial host default Python `3.14` attempt failed during dependency setup (`FastAPI`/`Pydantic` unavailable); no product-claiming verification was recorded from that run.
- Deno gate command ran against `v2.9.5`.
- In workflow execution, `pnpm pilot-gate-2a` performs local startup before tests, a
  failure-only sanitized diagnostic can be uploaded, and diagnostic cleanup runs in
  an unconditional `always()` step.

## Closure recorded for this Task 8 pass

- Local-stack HTTP/Auth/Storage composition is marked complete for Gate 2A after
  both required jobs in run `33193118991` completed successfully.
- The pinned non-upsert Storage replay behavior at this commit is observed as
  `upload/http/storage_upload_failed` with HTTP `400`.
- Compatibility behavior for prior committed responses is recorded as exact `400` or
  `409` for that status bucket, and it still requires finalization/hash/length
  proof for replay-safe idempotency.
- The run includes the exact commit reference required by Task 8 and no secrets,
  raw logs, or signed URLs were introduced in documentation.

## Explicitly open / not complete in this scope

- Hosted Supabase execution
- EAS/native device execution
- Real user/test-data ingestion
- Legal/operational/drill completion
- Physical-device manual mask verification
- Real AI accuracy evidence on real data
- True post-token-expiry cleanup/replay (Gate 2B)

Task 8 documentation is intentionally bounded to Gate 2A local-stack proof and
does not claim broader Singapore pilot readiness.
