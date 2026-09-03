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

## Round 1: timeout-text spoofing hardening

Review found that the first implementation classified an error solely by its
message. An external fetch implementation could therefore reject immediately
with `new Error('request_timeout')` and incorrectly receive the internal
deadline outcome.

RED replaced the ordinary non-timeout fixture with that exact external error:

```text
expected code: network_error
received code: request_timeout
```

`network.ts` now brands only the timer-created error in a private `WeakSet`
and exports `isRequestTimeoutError(error)`. `actors.ts` calls that predicate
and never reads an exception message. The existing fake-timer deadline test
still proves the actual 5,000 ms timer yields `request_timeout` with exactly
one fetch call. Caller cancellation continues to use the fixed non-timeout
abort path, so it cannot be promoted by a caller-controlled message.

Round 1 verification completed successfully:

```text
pnpm --filter @animalhelper/pilot-gate-2a test:unit  # 14 files, 100 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 175 passed
pnpm test:pilot-gate-2b-ci                           # 30 passed, 1 Windows symlink capability skip
pnpm --filter @animalhelper/pilot-gate-2a typecheck
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify                                           # passed
```

Round 1 implementation commit: `e814abe fix(pilot): brand request timeout failures`.

## Round 2: marker-replay and malformed-result hardening

Security review found that the Round 1 branded error was itself passed as the
internal `AbortSignal.reason`. A fetch implementation could retain that object
and reject a later request with it, replaying the timeout classification.

RED captured the first finalize signal reason during a genuine 5,000 ms timer
expiry and threw it from a second finalize request. The second request was
incorrectly classified as `request_timeout`. A companion RED test showed that
the marker predicate accepted the same returned error more than once.

The timer now sets invocation-local `timedOut` state and aborts with only an
unbranded fixed abort error. `fetchWithTimeout` catches that invocation's
failure and creates a fresh private timeout marker only when its own timer
won. The exported predicate consumes its marker with `WeakSet.delete`, so an
already classified error cannot be replayed. External same-message errors,
captured signal reasons, and caller cancellation all remain non-timeout.

The same review also required the Hosted result mapper to fail closed for
hostile object shapes. It now accepts only exact own-key records with either
the plain-object or null prototype. Extra-own fields, custom inherited fields,
and reflective proxy failures return no outcome for timeout, network, HTTP,
and invalid-response mappings. The exact `{ ok: true, status: 200 }`
missing-asset shape remains `invalid_response`; raw values are never
serialized.

Round 2 verification completed successfully:

```text
pnpm --filter @animalhelper/pilot-gate-2a test:unit  # 14 files, 103 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 176 passed
pnpm test:pilot-gate-2b-ci                           # 30 passed, 1 Windows symlink capability skip
pnpm --filter @animalhelper/pilot-gate-2a typecheck
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify                                           # passed
```

Round 2 implementation commit: `b246a06 fix(pilot): prevent timeout marker replay`.

## Round 3: actor-invocation timeout binding

Final security review found that a direct `fetchWithTimeout` caller could
receive a still-live Round 2 marker without consuming it. Throwing that error
from a later actor fetch allowed one unwanted timeout classification. The
global predicate also used `instanceof`, which a hostile proxy can disrupt via
`getPrototypeOf`.

RED first timed out a direct helper call, retained its returned error, and
threw it from a later `finalizeMedia` fetch. The actor incorrectly produced
`request_timeout`. A second RED rejection used a proxy whose
`getPrototypeOf` and `ownKeys` traps throw; the actor escaped with the raw
proxy error instead of its fixed `network_error` result.

Round 3 removes the process-global marker and exported predicate entirely.
`actorPost` creates a fresh private `Symbol` sentinel for each request and
passes it through the narrow optional timeout-result argument of
`fetchWithTimeout`. The helper never supplies that sentinel to fetch or to an
`AbortSignal`; it throws it only when that invocation's own timer won. The
actor maps only strict identity equality with its own sentinel. General helper
callers continue to receive an ordinary unbranded `request_timeout` error.

The regression set proves a direct timeout replay, captured signal reason,
external same-message error, caller cancellation, and hostile proxy rejection
all remain `network_error` at the actor boundary. The genuine 5,000 ms actor
timer remains `request_timeout` with one fetch call. No budget or retry
behavior changed.

Round 3 verification completed successfully:

```text
pnpm --filter @animalhelper/pilot-gate-2a test:unit  # 14 files, 104 passed
pnpm --filter @animalhelper/pilot-gate-2b test:unit  # 15 files, 176 passed
pnpm test:pilot-gate-2b-ci                           # 30 passed, 1 Windows symlink capability skip
pnpm --filter @animalhelper/pilot-gate-2a typecheck
pnpm --filter @animalhelper/pilot-gate-2b typecheck
git diff --check
pnpm verify                                           # passed
```

Round 3 implementation commit: `5253ab6 fix(pilot): bind timeout to actor invocation`.
