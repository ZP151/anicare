# Hosted Gate 2B owner-finalize outcome diagnostic report

## Root-cause boundary

Protected run `33741286791` reached the first owner finalization and then
reported only `ownerStep: "finalize"`. The bounded `ActorResult` already
contained a safe failure classification, but `HostedCheckFailure`, gate
control, child diagnostic validation, and producer serialization did not carry
it. This change propagates one fixed optional enum only from that first owner
`finalizeMedia` result. It does not inspect raw hosted logs or add any network,
deployment, cleanup, SQL, timeout, retry, or workflow behavior.

## Files changed

- `tests/pilot-gate-2b/src/checks.ts` maps bounded finalization results and
  propagates the enum through `HostedCheckFailure`.
- `tests/pilot-gate-2b/src/execute.ts` carries it into `HostedGateControl` only
  for `owner_happy_path` / `finalize`.
- `tests/pilot-gate-2b/src/check-diagnostic.ts` and
  `scripts/run-pilot-gate-2b.mjs` validate the same finite allowlist and retain
  canonical field order.
- `tests/pilot-gate-2b/src/hosted.integration.test.ts` derives the outcome only
  from the first owner `finalizeMedia` `ActorResult`.
- Focused tests cover mapping, propagation, forbidden contexts, producer
  serialization, hostile inputs, and the byte bound.

## RED/GREEN evidence

RED commands, run before production edits:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/execute.test.ts src/check-diagnostic.test.ts
node --test scripts/run-pilot-gate-2b.test.mjs
```

Expected failures occurred because the mapping/extractor and
`ownerFinalizeOutcome` control field did not exist, and the child writer
rejected the new record. The script test also exposed a test placement issue
after its symlink fixture; the test was corrected before GREEN verification.

GREEN focused verification:

```text
pnpm --filter @animalhelper/pilot-gate-2b test -- src/checks.test.ts src/execute.test.ts src/check-diagnostic.test.ts  # 40 passed
node --test scripts/run-pilot-gate-2b.test.mjs  # 14 passed
pnpm --filter @animalhelper/pilot-gate-2b typecheck  # passed
```

## Verification

```text
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 154 passed
pnpm test:pilot-gate-2b-ci  # 29 passed, 1 Windows symlink capability skip
pnpm typecheck  # 8 tasks passed
git diff --check  # passed
pnpm verify  # passed
```

The explicit largest accepted outcome record is 305 UTF-8 bytes, below the
320-byte child-control cap. A longer combination fails closed through the
existing byte guard; existing diagnostics without this optional field retain
their prior complete cleanup lists.

## Commit and self-review

Implementation commit: `9a0e67c0d51effa818bddf998d30b0a22725d985`.

Self-review confirmed that the only emitted values are the eight specified
enum literals; malformed results suppress the field; successful and replay
paths add no outcome; every non-owner-finalize context rejects it; and no
free-form actor, HTTP, response, identifier, path, URL, or exception data can
reach either canonical diagnostic.

## Concerns

None. The optional field is intentionally omitted when a combined canonical
child-control record would exceed the existing 320-byte cap.
