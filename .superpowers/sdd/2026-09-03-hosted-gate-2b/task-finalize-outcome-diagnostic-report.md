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

Round 3 review found that the producer added its fixed `stage` and `code`
fields after accepting a child control at the same 320-byte boundary. The
specific accepted 319-byte control with all cleanup markers and
`http_401_authentication_required` became a 371-byte producer diagnostic. The
producer now enforces the cap on the complete final record.

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
- Round 2 adds adversarial wrong-code coverage for HTTP 401, 409, and 503.
- Round 3 adds final producer-byte-cap coverage and a narrow source-structure
  contract for the real first-finalize call site.

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

### Round 2 adversarial-code coverage

Three table cases use unexpected or hostile-looking bounded codes at HTTP 401,
409, and 503 and require `http_other`. The mapping was already correct, so no
production code changed. The tests were added first and passed against the
existing implementation; a temporary mutation then removed the exact-code
checks for all three statuses. That focused run failed exactly those three new
cases, proving the coverage would catch the status-only regression. The
original predicates were restored before GREEN verification.

Round 2 GREEN focused verification:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/check-diagnostic.test.ts src/execute.test.ts  # 46 passed
node --test scripts/run-pilot-gate-2b.test.mjs  # 14 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck  # passed
```

### Round 3 complete-producer cap and call-site wiring

The producer RED test supplied the exact accepted 319-byte child control and
failed because its serialized producer diagnostic was 371 bytes. GREEN builds
the complete producer diagnostic first, removes only
`ownerFinalizeOutcome` if that is sufficient, then falls back to the fixed
stage/code record if the remaining base record is still oversized. Tests prove
both paths stay at or below 320 bytes.

Because the hosted integration test is excluded from ordinary unit discovery,
a deliberately narrow source-structure contract verifies that the real first
finalization result goes through `ownerFinalizedMediaAssetId(finalized)` and is
not preceded by `requireOwnerStep('finalize', ...)`. A temporary reversion of
that wiring made the contract fail. A separate temporary removal of the final
producer fallback made the oversized-base contract fail; both mutations were
restored before GREEN verification.

Round 3 GREEN focused verification:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/check-diagnostic.test.ts src/execute.test.ts  # 47 passed
node --test scripts/run-pilot-gate-2b.test.mjs  # 14 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck  # passed
```

## Verification

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 161 passed
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
Round 2 coverage implementation HEAD: `15c3eff22aa6703b6d6d5fed9dbdbe67dbd7d941`.
Round 3 producer-cap implementation HEAD: `b57ca42336912c6958e3b192c8e933814a49553b`.

Self-review confirmed that the first failed finalization `ActorResult` now
reaches the typed failure before generic owner-step validation; a successful
result without a media asset is safely `invalid_response`; valid success and
replay add no outcome; every non-owner-finalize context rejects it; and no
free-form actor, HTTP, response, identifier, path, URL, or exception data can
reach either canonical diagnostic. The 401/409/503 specialized enums also
require their exact bounded codes; unexpected codes collapse to `http_other`.
The complete producer diagnostic, not only the child control, is bounded to
320 bytes; optional-outcome removal preserves the remaining finite control,
while oversized base controls fail closed to the fixed producer record.

## Concerns

None. The optional field is now intentionally omitted, rather than rejecting
the whole diagnostic, when it alone causes the 320-byte cap to be exceeded.
