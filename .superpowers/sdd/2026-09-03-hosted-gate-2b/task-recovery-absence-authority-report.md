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

## Commits

- `5ce28d5 fix(pilot): honor authoritative sighting absence proof`
- This report is committed separately after creation.

No push and no hosted rerun were performed.
