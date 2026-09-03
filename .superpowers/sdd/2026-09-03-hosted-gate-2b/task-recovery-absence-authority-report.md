# Hosted Gate 2B recovery/absence authority report

## Scope delivered

`cleanupHostedScenario` now treats a thrown or invalid
`recoverSightingIds` result as provisional. It keeps the original
best-effort cleanup order and only removes `recover_sighting` after the
final durable `assertAbsent` call returns `true`. A false or throwing
absence proof leaves both `recover_sighting` and `absence_proof` in the
fixed diagnostic order.

The change does not suppress `recover_auth`, storage/row/Auth deletion,
setup, or connection-close failures. It does not change the durable
reference proof, time budgets, input validation, or sanitized error
surface.

## TDD record

RED was recorded before the production change with:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts

20 tests: 18 passed, 2 failed
- accepts authoritative absence after a provisional sighting recovery exception
- accepts authoritative absence after an invalid provisional sighting recovery result

Both failures were hosted_cleanup_failed with operationIds:
[recover_sighting].
```

The tests prove that all deletion categories and the final absence proof
still run. Additional focused coverage proves that a false or throwing
absence proof retains `recover_sighting` followed by `absence_proof`,
and that successful absence proof does not suppress Auth, storage, or
close failures. Diagnostic assertions confirm raw transient error text
is not exposed.

## Verification

All commands completed successfully after the implementation:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts  # 21 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit                       # 166 passed
pnpm test:pilot-gate-2b-ci                                                # 29 passed, 1 Windows symlink skip
pnpm test:hosted-gate-2b-workflow                                         # 2 passed
pnpm test:root-contracts                                                  # 3 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify
```

`pnpm verify` completed its policy, producer-contract, workflow,
lint, workspace typecheck, test, and build gates successfully.

## Round 1 hostile-runtime recovery hardening

The recovery result guard now requires every recovered sighting ID to be
a string before applying the UUID expression. Any malformed result,
including an array containing a `Symbol`, is discarded as a provisional
`recover_sighting` failure before cleanup selectors are assembled. The
recovery validation catch also resets the result to an empty array, so a
throwing runtime value cannot become a later `setup` failure or skip
deletions and durable absence proof.

RED was recorded with the hostile-array case before the production
change:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts

22 tests: 21 passed, 1 failed
- accepts authoritative absence after a hostile malformed sighting recovery array

The observed failure was hosted_cleanup_failed with operationIds:
[setup, recover_sighting].
```

The strengthened success coverage proves `assertAbsent` receives the
complete durable `sightingRecoveryReferences` value, and the hostile
case proves that all deletion stages, absence proof, and close run
before the successful authoritative result is returned.

Round 1 verification completed successfully:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts  # 22 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit                       # 167 passed
pnpm test:pilot-gate-2b-ci                                                # 29 passed, 1 Windows symlink skip
pnpm test:hosted-gate-2b-workflow                                         # 2 passed
pnpm test:root-contracts                                                  # 3 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify
```

## Round 2 adversarial-array copy hardening

Recovery output is now copied and validated inside the existing guarded
block using one bounded length read and indexed element reads into a new
plain `string[]`. The original runtime array is not retained or used by
later cleanup selector construction. Length, indexed getter, and value
validation failures are all contained as provisional `recover_sighting`
failures with an empty sanitized recovery list.

RED was recorded with an array whose element getter returned one valid
UUID for the initial validation read and a hostile `Symbol` on a later
read:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts

23 tests: 22 passed, 1 failed
- copies a stateful sighting recovery array before cleanup selectors use it

The observed failure was hosted_cleanup_failed with operationIds:
[setup].
```

The green regression confirms the untrusted element is read once, all
deletion stages and the durable absence proof run, and the final
authoritative result succeeds.

Round 2 verification completed successfully:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts  # 23 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit                       # 168 passed
pnpm test:pilot-gate-2b-ci                                                # 29 passed, 1 Windows symlink skip
pnpm test:hosted-gate-2b-workflow                                         # 2 passed
pnpm test:root-contracts                                                  # 3 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify
```

## Round 3 Auth recovery preservation hardening

Auth recovery output now follows the same guarded bounded indexed-copy
process as sighting recovery. Any malformed value, length access, or
indexed getter failure is replaced with a fresh empty list and recorded
as `recover_auth`. Unlike provisional sighting recovery, this failure is
never suppressed by a successful final absence proof.

RED was recorded with a stateful Auth-array getter that produced a
hostile non-string value at the first recovery read:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts

24 tests: 23 passed, 1 failed
- contains a stateful Auth recovery array without suppressing recover_auth

The observed failure was hosted_cleanup_failed with operationIds:
[setup].
```

The green regression confirms the hostile Auth value is read once, all
deletions, durable absence proof, and close run, and the final fixed
diagnostic is exactly `recover_auth` without raw hostile content.

Round 3 verification completed successfully:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts  # 24 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit                       # 169 passed
pnpm test:pilot-gate-2b-ci                                                # 29 passed, 1 Windows symlink skip
pnpm test:hosted-gate-2b-workflow                                         # 2 passed
pnpm test:root-contracts                                                  # 3 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify
```

## Round 4 final-proof authority hardening

Only the literal boolean `true` now authorizes final absence proof.
Truthy objects, numbers, and strings become `absence_proof` failures and
cannot clear a provisional `recover_sighting` failure.

Before invoking the sighting recovery adapter, cleanup now creates two
independent plain snapshots of the validated durable recovery
references: one only for the untrusted recovery lookup and one retained
for the final recovered scenario and absence proof. The adapter cannot
mutate the proof snapshot by replacing, splicing, or editing its own
copy.

RED was recorded before the production change:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts

28 tests: 24 passed, 4 failed
- preserves durable sighting recovery references when the recovery adapter mutates its copy
- retains provisional sighting recovery failure when absence proof returns a truthy object
- retains provisional sighting recovery failure when absence proof returns truthy one
- retains provisional sighting recovery failure when absence proof returns a truthy string
```

The mutation regression used an adapter that edited an individual
reference, spliced the received array, and threw. The green test proves
the final proof receives the original durable references and authorizes
only after that preserved proof returns literal `true`.

Round 4 verification completed successfully:

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit -- inspection.test.ts  # 28 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit                       # 173 passed
pnpm test:pilot-gate-2b-ci                                                # 29 passed, 1 Windows symlink skip
pnpm test:hosted-gate-2b-workflow                                         # 2 passed
pnpm test:root-contracts                                                  # 3 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify
```

## Slice commit history

- Initial authority slice: `5ce28d5 fix(pilot): honor authoritative sighting absence proof`
  and `f2874a4 docs(pilot): record recovery absence authority`.
- Round 1: `3769b4b fix(pilot): contain malformed sighting recovery`
  and `e47f894 docs(pilot): record malformed recovery guard`.
- Round 2: `0503451 fix(pilot): sanitize sighting recovery arrays`
  and `a73d781 docs(pilot): record recovery array sanitization`.
- Round 3: `abe45c8 fix(pilot): contain malformed Auth recovery`
  and `35a7444 docs(pilot): record Auth recovery hardening`.
- Round 4: `552d4f4 fix(pilot): harden final absence authority` and this
  report commit, `docs(pilot): record final absence authority hardening`.

No push and no hosted rerun were performed.
