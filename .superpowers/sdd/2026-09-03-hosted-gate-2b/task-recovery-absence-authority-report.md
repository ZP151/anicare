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

## Commits

- `5ce28d5 fix(pilot): honor authoritative sighting absence proof`
- This report is committed separately after creation.

No push and no hosted rerun were performed.
