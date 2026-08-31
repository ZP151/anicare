# Task 6 report — AI alpha contract freeze

## Status

Implemented against the requested base `86d442faf483ca3b111f1532612ba2f176be04bb`.
The commit message is `feat(ai): freeze alpha identity contracts`.
No model weights, real media, user data, network callbacks, queue vendor, ANN,
database, or deployment was used.

## Delivered

- Added strict Pydantic v2 contracts with `extra="forbid"`, strict values,
  bounded identifiers/lists/reasons, exact contract literals, aware timestamps,
  normalized finite crop boxes, and public-field omissions.
- Added a deterministic crop quality policy scaffold. It fails closed for zero
  or multiple faces, unavailable detector metadata, invalid/tiny/low-quality or
  over-padded crops, metadata/EXIF, and unconfirmed redaction. It is explicitly
  not a person, licence-plate, face, or cat detector, and accepted status is
  policy-issued only.
- Added the exact-384 finite L2-normalized embedding protocol, model/preprocess/
  crop binding compatibility checks, a fail-closed unavailable provider, and a
  deterministic synthetic provider.
- Added pure in-memory callback events/store with bounded monotonic attempts,
  `(jobId,eventId)` exact idempotency, conflicting reuse rejection, stale-event
  protection, immutable terminal states, and status-specific result/error
  payloads.
- Typed the `/v1/identify` compatibility adapter and kept its WhiskerCommons
  branding. Public output is limited to candidate IDs, broad bands, reasons,
  recommendation, version, and server timestamp; internal scores never escape.
- Added synthetic open-set fixtures/gate tests and `docs/ai-contracts.md` as the
  source of truth, including `media_assets`/`identity_proposals`/`match_reviews`
  mapping and independent human review authority.

## TDD and verification evidence

- RED: `pnpm --filter @animalhelper/ai test` failed after the new tests were
  added, with the expected missing-contract/import failures (Pydantic was also
  absent in the local runtime).
- Static GREEN checks: `pnpm --filter @animalhelper/ai lint`, `typecheck`, and
  `build` all passed via Python `compileall`; `git diff --check` passed.
- The focused/full AI unit command was re-run after implementation but cannot
  execute in this checkout: Python is 3.14 and has no installed Pydantic, while
  `services/ai/pyproject.toml` requires Python 3.12–3.13 and declares Pydantic
  v2. No fallback or fake Pydantic implementation was added.
- `pnpm verify` ran workspace lint/typecheck and then stopped at the AI test
  task for the same missing-Pydantic error. Other workspace checks reported
  successful before that stop.

## Runtime gate

Install the declared AI dependencies in a supported Python 3.12/3.13 runtime,
then rerun `pnpm --filter @animalhelper/ai test` and the full `pnpm verify`.
There is no production recognition or automatic publication claim from the
synthetic fixture gate.

## Follow-up verification

The supported `.venv` (Python 3.12.13 with declared development dependencies)
was used to correct Python-side Pydantic alias access in quality tests, clean
Ruff import/annotation/timezone findings, and construct typed
`IdentifyCandidate` values in the handler. The follow-up checks passed:

- `.venv\\Scripts\\python -m pytest -q` — 21 passed.
- `.venv\\Scripts\\python -m unittest discover -s services/ai/tests -v` — 21 passed.
- `.venv\\Scripts\\python -m ruff check services/ai/src services/ai/tests` — clean.
- `.venv\\Scripts\\python -m mypy services/ai/src` — clean.
- `.venv\\Scripts\\python -m compileall -q services/ai/src services/ai/tests` — passed.
- `git diff --check` — passed.

## Review follow-up

The callback reducer now requires an initial `queued` event, rejects timestamp
rollback while accepting equal timestamps in arrival order, and keeps stale
attempts out of current state. Crop policy inputs are runtime-checked so
malformed booleans, unknown metadata, nonfinite values, and out-of-range
quality/padding cannot be accepted. Embedding request/vector wire payloads now
carry `contractVersion: "embedding.v1"`, and compatibility checks include it.
The compatibility documentation identifies score-bearing evidence as a
trusted internal adapter boundary and distinguishes it from the public API.

## Closeout follow-up

The private `/v1/identify` route now fails closed without a strong
`WHISKER_INTERNAL_AI_TOKEN` server secret and requires the exact
`X-Whisker-Internal-Token` header with constant-time comparison. Missing or
malformed server configuration is unavailable; missing or wrong caller
credentials are unauthorized. HTTP-layer tests cover both branches and token
non-leakage. Crop documentation/tests now make the exact guarantee explicit:
validated wire/model input cannot set `accepted`, while the trusted in-process
policy path uses Pydantic's `model_construct` escape hatch that is never
transport-exposed.

## Closeout authentication follow-up

The private `/v1/identify` FastAPI route now requires the bounded
`WHISKER_INTERNAL_AI_TOKEN` server secret (minimum 32 characters) and the exact
`X-Whisker-Internal-Token` header, using constant-time comparison. Missing or
malformed server configuration is unavailable; missing or incorrect caller
credentials are unauthorized; neither the secret nor internal scores appear
in responses. HTTP-layer tests cover these cases and strict request validation.
Crop comments/docs/tests now state the precise guarantee: validated wire/model
input cannot set `accepted`; the deterministic policy may emit it through the
trusted in-process `model_construct` escape hatch, which is never transport
exposed.

## Final auth-ordering follow-up

Authentication for `POST /v1/identify` now runs in ASGI middleware before
FastAPI parses the body: missing/weak configuration returns 503 and missing or
wrong caller credentials return 401 even for malformed bodies; only an
authenticated caller reaches strict 422 schema validation. OpenAPI, Swagger,
and ReDoc routes are disabled while `/health` remains public. The policy
documentation and tests explicitly distinguish validated model guarantees from
the trusted in-process `model_construct` escape hatch.
