# Hosted Gate 2B owner-finalize outcome diagnostic report

## Root-cause boundary

Protected run `33741286791` reached the first owner finalization and then
reported only `ownerStep: "finalize"`. The bounded `ActorResult` already
contained a safe failure classification, but `HostedCheckFailure`, gate
control, child diagnostic validation, and producer serialization did not carry
it.

Round 1 review found two defects in the first implementation: the owner-path
`requireOwnerStep('finalize', ...)` threw before the typed failure could carry
the outcome, and a maximal allowed cleanup record was rejected wholesale when
the optional field crossed the 320-byte cap. The corrected implementation
routes the first finalization result through one typed seam and removes only
the optional outcome when that is sufficient to restore the canonical size.
It does not inspect raw hosted logs or add any network, deployment, cleanup,
SQL, timeout, retry, or workflow behavior.

## Files changed

- `tests/pilot-gate-2b/src/checks.ts` maps bounded finalization results and
  provides the owner-finalization seam that propagates the enum through
  `HostedCheckFailure`.
- `tests/pilot-gate-2b/src/execute.ts` carries it into `HostedGateControl` only
  for `owner_happy_path` / `finalize`.
- `tests/pilot-gate-2b/src/check-diagnostic.ts` and
  `scripts/run-pilot-gate-2b.mjs` validate the same finite allowlist and retain
  canonical field order.
- `tests/pilot-gate-2b/src/hosted.integration.test.ts` derives the outcome only
  from the first owner `finalizeMedia` `ActorResult`.
- Focused tests cover mapping, propagation, forbidden contexts, producer
  serialization, hostile inputs, the first-finalize regression, missing-asset
  safety, and maximal-record degradation.

## RED/GREEN evidence

Round 1 rework RED commands, run before the corrective production edits:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/check-diagnostic.test.ts
node --test scripts/run-pilot-gate-2b.test.mjs
```

Expected failures occurred because there was no owner-finalization seam (so no
typed outcome reached the failure), the child writer rejected the 324-byte
maximal record, and producer normalization retained the optional field in that
same record.

GREEN focused verification for the rework:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/check-diagnostic.test.ts src/execute.test.ts  # 43 passed
node --test scripts/run-pilot-gate-2b.test.mjs  # 14 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck  # passed
```

## Verification

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 157 passed
pnpm test:pilot-gate-2b-ci  # 29 passed, 1 Windows symlink capability skip
pnpm typecheck  # 8 tasks passed
git diff --check  # passed
pnpm verify  # passed
```

The maximal canonical owner-finalize input is 324 UTF-8 bytes with the longest
enum and all ordered cleanup markers. The child writer and producer normalizer
deterministically omit only `ownerFinalizeOutcome`, preserving the exact
gate/check/owner-step/cleanup diagnostic at 261 bytes. Invalid records and
oversized base records remain fail-closed.

## Commit and self-review

Initial implementation commit: `9a0e67c0d51effa818bddf998d30b0a22725d985`.
Round 1 corrective implementation HEAD: `58debc578d9c1b52ca6662d15323f25f9c8059d5`.

Self-review confirmed that the first failed finalization `ActorResult` now
reaches the typed failure before generic owner-step validation; a successful
result without a media asset is safely `invalid_response`; valid success and
replay add no outcome; every non-owner-finalize context rejects it; and no
free-form actor, HTTP, response, identifier, path, URL, or exception data can
reach either canonical diagnostic.

## Concerns

None. The optional field is now intentionally omitted, rather than rejecting
the whole diagnostic, when it alone causes the 320-byte cap to be exceeded.
