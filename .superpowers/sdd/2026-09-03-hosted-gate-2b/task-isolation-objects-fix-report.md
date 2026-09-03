# Hosted Gate 2B isolation objects fix report

## Root cause

`createHostedMaintenanceAdapter(...).inspectIsolation(...)` treated every non-null
Storage `error` as a failure. In pinned `@supabase/storage-js` 2.98.0, a missing
object is represented by `{ data: false, error: StorageUnknownError }` after a
400/404 HEAD response. That expected absence therefore failed as
`isolation_objects` before the cleanup proof could complete.

## Changes

- `tests/pilot-gate-2b/src/inspection.ts`: normalize only the SDK's two valid
  boolean result shapes: present (`true`, `null`) and absent (`false`, non-null
  SDK absence error). The latter is returned as `false`; every other shape fails
  at `isolation_objects`.
- `tests/pilot-gate-2b/src/inspection-isolation-objects.test.ts`: exercise the
  real maintenance adapter while mocking only PostgreSQL and Supabase Storage
  boundaries. It verifies ordered present/absent object results and fail-closed
  behavior for a present result with an error, malformed result, false without
  an error, and a thrown Storage call.

## RED evidence

Command:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/inspection-isolation-objects.test.ts
```

Before the production edit, the focused suite reported 1 failure and 3 passes.
The regression test expected `{ objectExists: [true, false] }` but rejected with
`hosted_inspection_failed` carrying `isolationStep: 'isolation_objects'`, which
is the old `error || typeof data !== 'boolean'` behavior.

## GREEN and verification evidence

| Command | Result |
| --- | --- |
| `pnpm --filter @animalhelper/pilot-gate-2b test -- src/inspection-isolation-objects.test.ts` | 1 file, 5 tests passed |
| `pnpm --filter @animalhelper/pilot-gate-2b test:unit` | 15 files, 136 tests passed |
| `pnpm --filter @animalhelper/pilot-gate-2b typecheck` | passed (`tsc --noEmit`) |
| `git diff --check` | passed |

## Commit

Fix commit: `625d841744e002499ebea1d49502c261ae9d2501`

## Self-review

The change is limited to the isolation object result guard. It does not alter
retry behavior, timeouts, input/path validation, diagnostics, cleanup scope,
SQL, environments, or workflow policy. The new regression would fail again if
the old unconditional non-null-error rejection were restored. The expected
`false` result remains in the same input order. Storage throws, non-boolean
data, `true` plus an error, and `false` without the SDK error all remain
fail-closed as `isolation_objects`.

## Concerns

None. `git diff --check` emitted Git's informational LF-to-CRLF working-copy
warning for the existing edited TypeScript file, but exited successfully and
reported no whitespace errors.
