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

Round 4 review found that the call-site regression used brittle source
substrings: it could miss a double-quoted preempting assertion or pass on an
unrelated decoy string. It is now a TypeScript compiler-AST contract over the
actual `runOwnerHappyPath` implementation and its first-finalize flow.

Round 5 review found that the AST contract still chose the first variable
named `finalized`; an unprotected true finalization under another identifier
could therefore be hidden by a decoy binding and seam. The contract now starts
at the concrete `finalizeMedia` call nested under `atOwnerStep('finalize',
...)`, while preserving and distinguishing the legitimate replay call.

Round 6 adds the remaining source-order boundary: the unique awaited
first-finalize binding and its actor call must precede the unique replay
binding and call inside the actual owner flow.

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
- Round 3 adds final producer-byte-cap coverage.
- Round 4 replaces the brittle call-site substring check with a TypeScript
  compiler-AST contract for the unique `runOwnerHappyPath` implementation,
  its first `finalized` binding, its immediate
  `ownerFinalizedMediaAssetId(finalized)` seam, and preempting literal
  `requireOwnerStep('finalize', ...)` or `requireOwnerStep("finalize", ...)`
  calls.
- Round 5 binds that contract to the unique concrete first-finalize actor call
  and its awaited result rather than a variable name; runtime code remains
  unchanged.
- Round 6 adds AST source-order coverage for the first-finalize and replay
  actor calls and their awaited bindings; runtime code remains unchanged.

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

### Round 4 AST call-site contract

The previous string-only test was removed. The replacement loads
`hosted.integration.test.ts` through the TypeScript compiler program, requires
exactly one `runOwnerHappyPath` implementation, finds its first
`const finalized = await atOwnerStep('finalize', () => finalizeMedia(...))`
binding, and requires the immediately following binding to be
`ownerFinalizedMediaAssetId(finalized)`. It also walks the preceding flow for
any literal `requireOwnerStep` call whose step is `finalize`; string-literal
AST nodes cover both quote styles.

TDD/mutation RED evidence: temporarily inserting
`requireOwnerStep("finalize", ...)` between the first result and seam caused
the focused contract to fail. Separately replacing the real seam while leaving
an unrelated `ownerFinalizedMediaAssetId(finalized)` decoy string caused the
same contract to fail. Both mutations were restored before GREEN. No runtime
production code changed in this round.

Round 4 GREEN focused verification:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/check-diagnostic.test.ts src/execute.test.ts  # 47 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 161 passed
pnpm test:pilot-gate-2b-ci  # 29 passed, 1 Windows symlink capability skip
pnpm --filter @animalhelper/pilot-gate-2b typecheck  # passed
pnpm typecheck  # 8 tasks passed
git diff --check  # passed
pnpm verify  # passed
```

### Round 5 concrete first-finalize binding

The AST contract now requires exactly one `atOwnerStep('finalize', ...)` and
one distinct `atOwnerStep('replay', ...)` within `runOwnerHappyPath`. Each
must directly invoke exactly one `finalizeMedia`; together those are the only
two `finalizeMedia` calls in that function. The first-finalize call must use
`scenario.owner` and the confirmed owner payload
(`scenario.ownerSightingId`, `confirmedMediaId`, and `jpeg.sha256`). Its
awaited binding—regardless of identifier name—must be consumed immediately by
`ownerFinalizedMediaAssetId` before any literal finalize assertion can
preempt it.

TDD/mutation RED evidence: adding an earlier true finalize under a different
identifier while retaining the later `finalized` decoy/seam failed the unique
finalize-step requirement; changing the first call from `scenario.owner` to
`scenario.stranger` failed its concrete argument assertion; and inserting
`requireOwnerStep("finalize", ...)` before the seam failed the immediate-flow
assertion. Each source mutation was restored before GREEN. No production
runtime code changed.

Round 5 GREEN focused verification:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/check-diagnostic.test.ts src/execute.test.ts  # 47 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 161 passed
pnpm test:pilot-gate-2b-ci  # 29 passed, 1 Windows symlink capability skip
pnpm --filter @animalhelper/pilot-gate-2b typecheck  # passed
pnpm typecheck  # 8 tasks passed
git diff --check  # passed
pnpm verify  # passed
```

### Round 6 first-finalize source order

The concrete AST contract now asserts both that the first-finalize
`finalizeMedia` call appears before the replay `finalizeMedia` call and that
the corresponding awaited first-finalize binding appears before the replay
binding. This makes the diagnostic seam contract order-sensitive without
changing the hosted behavior.

TDD/mutation RED evidence: temporarily swapping the `finalize` and `replay`
step literals preserved one direct call for each step but reversed their source
order. The focused contract failed with the expected source-order error. The
mutation was restored before GREEN; no production runtime code changed.

Round 6 GREEN focused verification:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/check-diagnostic.test.ts src/execute.test.ts  # 47 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 161 passed
pnpm test:pilot-gate-2b-ci  # 29 passed, 1 Windows symlink capability skip
pnpm --filter @animalhelper/pilot-gate-2b typecheck  # passed
pnpm typecheck  # 8 tasks passed
git diff --check  # passed
pnpm verify  # passed
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
Round 4 AST call-site contract implementation HEAD: `c74eeb56c182561973265d7707f98168d21433d9`.
Round 5 concrete first-finalize contract implementation HEAD: `02640ba678efa9c0e0216c82a0cccd3f5abb4e36`.
Round 6 source-order contract implementation HEAD: `7003ff4ea2c83ee69b25b3229d8231afb40a44ff`.

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
The call-site contract is structural rather than textual, so a quoted
preempting assertion or a decoy source string cannot satisfy it.
It also binds the seam to the actual owner finalize actor call and inputs, so
a differently named or extra finalization cannot hide behind a decoy binding.
The first-finalize and replay source order is also fixed, preventing a replay
binding from being treated as the diagnostic-bearing first finalization.

## Concerns

None. The optional field is now intentionally omitted, rather than rejecting
the whole diagnostic, when it alone causes the 320-byte cap to be exceeded.
