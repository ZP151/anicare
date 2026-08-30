# AI Identity Assistance Disabled-by-Default Plan

> **Spec:** `docs/superpowers/specs/2026-08-29-ai-identity-assistance-provenance-design.md`, especially sections 12–15.

**Goal:** Close the current A1 safety gap by requiring an explicit disabled-by-default runtime flag in addition to the existing private token before the synthetic `/v1/identify` compatibility route can parse or process a request.

**Architecture:** Keep the current ASGI-boundary authentication and model-free deterministic candidate adapter. Add one exact runtime enablement predicate evaluated before token authentication and request-body parsing. Any missing or non-exact flag value returns the same generic unavailable response, so callers cannot use parsing behavior to infer service configuration. This does not introduce a live model, dataset, image access, queue, provider, ANN index, or user-facing entry point.

**Tech stack:** Python 3.12–3.13, FastAPI/ASGI, Pydantic, `unittest`, pnpm/Turbo.

## Global Constraints

- Follow RED/GREEN TDD and capture the expected failure before production edits.
- The route is disabled unless `WHISKER_AI_IDENTITY_ASSISTANCE_ENABLED` is exactly `true`; missing, empty, whitespace-padded, case variants, `1`, and other truthy-looking values remain disabled.
- Disabled state is checked before token authentication and before FastAPI parses the body; response is generic HTTP 503 `AI service unavailable` and never echoes flag/token/body values.
- Enabled state still requires the existing 32–256 character nonblank `WHISKER_INTERNAL_AI_TOKEN` and constant-time caller comparison.
- `/health` remains the only public route; OpenAPI/docs routes remain unavailable.
- Do not add model weights, image bytes/paths, storage access, embeddings, similarity scores in responses, provider selection, live inference, or new network dependencies.
- Do not describe this contract as cat-face recognition accuracy or pilot readiness; it is only an entry-point control-plane safeguard for synthetic contracts.

## Task 1: Gate the private identify route behind an exact runtime flag

**Files:**

- Modify: `services/ai/tests/test_api.py`
- Modify: `services/ai/src/animalhelper_ai/api.py`
- Modify: `docs/ai-contracts.md`
- Modify: `README.md`

**Step 1 — add failing boundary tests**

In `test_api.py`, import `IDENTITY_ASSISTANCE_ENABLED_ENV`. Add a test that sets a valid internal token, sends a malformed body, and asserts HTTP 503 plus no echo for each disabled value: absent, `""`, `"false"`, `"TRUE"`, `"1"`, and `" true "`. This must prove the flag is evaluated before body parsing.

Update every test that intends to exercise token or schema behavior to set `WHISKER_AI_IDENTITY_ASSISTANCE_ENABLED=true`. Add an enabled happy-path assertion showing exact `true` plus the correct token reaches the typed route, while wrong/missing token behavior remains 401.

**Step 2 — confirm RED**

Run:

`pnpm --filter @animalhelper/ai test -- --runTestsByPath tests/test_api.py`

Expected failure: the new constant is absent and/or a valid token still allows the route when the new flag is absent.

**Step 3 — implement the minimum gate**

In `api.py` add:

```py
IDENTITY_ASSISTANCE_ENABLED_ENV = "WHISKER_AI_IDENTITY_ASSISTANCE_ENABLED"

def require_identity_assistance_enabled(configured_value: str | None = None) -> None:
    enabled = os.environ.get(IDENTITY_ASSISTANCE_ENABLED_ENV) if configured_value is None else configured_value
    if enabled != "true":
        raise HTTPException(status_code=503, detail="AI service unavailable")
```

Call it in `authenticate_private_identify` immediately before `require_internal_token`. Catch either generic unavailable/unauthorized exception through the existing response path. Do not read or log the request body.

**Step 4 — document exact deployment behavior**

Update `docs/ai-contracts.md` and the README implementation summary so they state both conditions are required: the exact non-secret enablement flag and the secret token. State explicitly that the flag defaults off and that enabling this compatibility route still activates only the synthetic/model-free contract, not live cat-face inference.

**Step 5 — verify and commit**

Run:

- `pnpm --filter @animalhelper/ai test`
- `pnpm --filter @animalhelper/ai lint`
- `pnpm --filter @animalhelper/ai typecheck`
- `pnpm --filter @animalhelper/ai build`

Commit:

`git add services/ai/src/animalhelper_ai/api.py services/ai/tests/test_api.py docs/ai-contracts.md README.md && git commit -m "fix(ai): disable identity assistance by default"`

## Task 2: Independent safety review

Review the full Task 1 diff against the spec and verify:

- disabled values fail before parsing even with a valid token;
- exact `true` does not bypass private token authentication or strict schema validation;
- no secret/config value reaches response content;
- no live inference or provider behavior was added;
- documentation makes no accuracy or launch claim;
- test output is clean and no unrelated files changed.

Any Critical or Important finding must be fixed and re-reviewed before synchronization.

