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

## Fix round 1: narrow SDK absence recognition

### Review finding and root cause

The initial normalization accepted every `{ data: false, error: non-null }`
result. That was too broad: only the pinned Storage SDK's absent-object result
is safe to normalize. A generic operational error or a `StorageUnknownError`
whose original HTTP status is not 400 or 404 must remain fail-closed.

### RED evidence

After adding the missing generic-error and status-500 cases, before changing
production code, this command failed as expected:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/inspection-isolation-objects.test.ts
```

Result: 1 file failed; 2 tests failed and 5 passed. Both failures showed the
adapter resolving `{ objectExists: [false, true] }` instead of rejecting:

- `a false result paired with a generic error`
- `a false result paired with a non-absence Storage error`

This proves the previous broad false-plus-error branch did not discriminate
the SDK absence contract.

### GREEN implementation and evidence

`isStorageObjectAbsence` now accepts only `data === false` accompanied by the
pinned SDK runtime shape: `__isStorageError === true`,
`name === 'StorageUnknownError'`, and `originalError.status` equal to 400 or
404. The adapter permits only this absence shape or the successful
`{ data: true, error: null }` shape; every other result throws within
`isolation_objects`.

The focused GREEN command above passed: 1 file, 7 tests passed.

### Full verification

| Command | Result |
| --- | --- |
| `pnpm --filter @animalhelper/pilot-gate-2b test -- src/inspection-isolation-objects.test.ts` | 1 file, 7 tests passed |
| `pnpm --filter @animalhelper/pilot-gate-2b test:unit` | 15 files, 138 tests passed |
| `pnpm --filter @animalhelper/pilot-gate-2b typecheck` | passed (`tsc --noEmit`) |
| `git diff --check` | passed; no whitespace errors |

### Correction to the initial RED record

The original `1 failure and 3 passes` result was recorded before the
`false`-with-`null` malformed-result case was added to the test matrix. The
final first-round focused suite contained five tests; that later test addition
did not appear in the original RED snapshot. The narrow-discrimination RED
run above is the current seven-test matrix and is the authoritative evidence
for this fix round.

### Files changed in this round

- `tests/pilot-gate-2b/src/inspection.ts`
- `tests/pilot-gate-2b/src/inspection-isolation-objects.test.ts`
- this report

### Commit and self-review

Fix-round implementation commit: `5ce301062d1afaef87a83739c8835b94e49264a3`.
The guard does not change retries, timeouts, path validation, diagnostics,
cleanup scope, SQL, environments, or workflow policy. The focused test uses
the real adapter with only PostgreSQL and Storage boundaries replaced. It now
proves ordered 404 absence handling and fail-closed behavior for a generic
error, status-500 Storage error, present-with-error, malformed data, false
without the SDK error, and thrown inspection calls.

## Fix round 2: mutation-resistant SDK and path tests

### Scope

This was a test-only wave. Production behavior was retained unchanged.

### Test strengthening

- Replaced sequential Storage results with an exact-path response map.
- Added exact first/second `exists()` assertions for the owner then stranger
  paths, in addition to asserting `[true, false]` result order.
- Added a positive 400 absence result, so the allowed 400/404 pair is covered.
- Added status-404 negative fixtures for wrong and missing
  `__isStorageError`, and wrong and missing `StorageUnknownError` name.

### Explicit mutation checks

After adding the tests, the following temporary production mutations were
applied only for validation and then restored without a commit:

| Temporary mutation | Focused command result | Evidence |
| --- | --- | --- |
| Weakened marker/name discrimination while retaining status validation | 1 file failed; 4 failed, 8 passed | Each new status-404 wrong/missing marker/name case resolved `[false, true]` instead of rejecting. |
| Reversed `observedObjectPaths` traversal | 1 file failed; 2 failed, 10 passed | Both positive 404 and 400 tests returned reversed object arrays. |

Mutation command in both cases:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/inspection-isolation-objects.test.ts
```

After restoring the original production code, the focused command passed: 1
file, 12 tests passed.

### Full verification

| Command | Result |
| --- | --- |
| `pnpm --filter @animalhelper/pilot-gate-2b test -- src/inspection-isolation-objects.test.ts` | 1 file, 12 tests passed |
| `pnpm --filter @animalhelper/pilot-gate-2b test:unit` | 15 files, 143 tests passed |
| `pnpm --filter @animalhelper/pilot-gate-2b typecheck` | passed (`tsc --noEmit`) |
| `git diff --check` | passed; no whitespace errors |
| `git diff -- tests/pilot-gate-2b/src/inspection.ts` | empty; production code unchanged in this round |

### Files and self-review

Only `tests/pilot-gate-2b/src/inspection-isolation-objects.test.ts` and this
report changed. The path-sensitive fixture prevents an unconfigured or
reversed lookup from satisfying the test, and the temporary mutations show the
new identity and ordering checks catch their intended regressions. The round
commit is `e15c19f4d1bbf5cae532085ff0c96af1a85719ae`.
