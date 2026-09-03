# Hosted Gate 2B finalize-timeout classification report

## Delivered scope

The Gate 2A actor now preserves the existing internal `request_timeout`
marker as its own bounded actor code. Every other caught network exception
remains `network_error`; no exception text is retained. Hosted Gate 2B maps
only a failed first owner `finalize` result with that exact actor code to the
new finite diagnostic outcome `timeout`.

The child control writer and producer each admit `timeout` only in the
existing `owner_happy_path` / `finalize` position. They retain their
allowlisted shapes, canonical field ordering, and 320-byte cap behavior;
optional finalization outcomes are omitted when necessary to keep a canonical
record within the cap. Malformed, hostile, and wrong-stage shapes fail closed.

No request budget, retry behavior, cleanup flow, Edge code, workflow, or
permission changed. The regression asserts one fetch invocation for the
5,000 ms finalization deadline, so the change introduces no retry.

## TDD evidence

The initial RED test was written before the production change and exercised a
finalize fetch that remained unsettled until the existing 5,000 ms deadline.
It failed as expected:

```text
expected code: request_timeout
received code: network_error
```

The GREEN implementation recognizes only the fixed internal timeout marker.
Follow-on coverage proves a non-timeout exception remains `network`, timeout
does not project from upload or hostile malformed actor values, and the child
and producer accept it only in the owner/finalize context. Exhaustive tests
cover every finite owner-finalize outcome at the 320-byte boundary in both
child and producer paths.

## Verification

All commands completed after implementation:

```text
pnpm --filter @animalhelper/pilot-gate-2a test:unit  # 14 files, 100 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 175 passed
pnpm test:pilot-gate-2b-ci                           # 30 passed, 1 Windows symlink capability skip
pnpm --filter @animalhelper/pilot-gate-2a typecheck
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify                                           # passed
```

Implementation commit: `69ecddf fix(pilot): classify hosted finalize timeouts`.
No push or hosted producer rerun was performed.
