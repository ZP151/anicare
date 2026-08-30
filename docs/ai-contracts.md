# WhiskerCommons AI alpha contracts

This document is the source of truth for the model-free identity-assistance
boundary. The Python import path remains `animalhelper_ai`; the display brand
is WhiskerCommons.

## Contract versions and privacy boundary

The exact versions are `crop.v1`, `embedding.v1`, `identify.v1`, and
`identify-callback.v1`. Every Pydantic transport model is strict and forbids
unknown fields. IDs are bounded stable identifiers. Timestamps are timezone
aware. Public/untrusted requests and all responses carry no image bytes, source
URI/path, ciphertext, exact location, EXIF/metadata, numeric similarity score,
or embedding vector. The existing compatibility request is a bounded,
trusted-internal adapter shape that may carry numeric evidence for ranking;
those scores are never returned publicly.

The `/v1/identify` route is a private alpha boundary. Authentication runs at
the ASGI boundary before request-body parsing. It is unavailable by default
and requires both `WHISKER_AI_IDENTITY_ASSISTANCE_ENABLED=true` (the exact
lowercase value; absent or any other value keeps the route unavailable) and
`WHISKER_INTERNAL_AI_TOKEN` configured as a nonblank secret of at least 32
characters. Callers are accepted only through the exact
`X-Whisker-Internal-Token` header using constant-time comparison. Missing or
malformed server configuration returns unavailable; missing or incorrect caller
credentials return unauthorized. The token is never logged or serialized.
Enabling this compatibility route activates only the synthetic, model-free
contract; it does not activate live cat-face inference. Deployment must
provision the secret through the runtime secret manager and verify the private
caller path before enabling the route; this contract does not create or embed
production credentials. Anonymous OpenAPI, Swagger, and ReDoc schema routes
are disabled for this private alpha service; `/health` remains the only public
route.

## Crop quality (`crop.v1`)

`CropBox` uses finite normalized `x`, `y`, `width`, and `height` values in
`[0,1]`; width and height are positive and the rectangle cannot overflow the
frame. `assess_identity_crop` is a deterministic policy scaffold, not a face,
person, licence-plate, or cat detector. The detector boundary is represented by
`face_count`; unavailable input yields `needs_review`.

The default policy requires a minimum crop dimension of `0.08`, quality of at
least `0.55`, and padding no greater than `0.35`. Zero or multiple faces,
out-of-bounds/tiny crops, low quality, excess padding, any metadata/EXIF, and
unconfirmed redaction are rejected. Validated wire/model input cannot set
`accepted`; the trusted deterministic policy path emits accepted values using
an in-process Pydantic `model_construct` escape hatch. That bypass is an
explicit internal trust boundary, is not transport-safe, and is never exposed
to callers. Reasons are a bounded code list and bounded text.

## Embeddings (`embedding.v1`)

An `EmbeddingRequest` and `EmbeddingVector` carry the exact wire field
`contractVersion: "embedding.v1"`, binding a crop ID, exact model version,
preprocessing version, and dimension `384`. A provider must return exactly 384 finite values
with L2 norm within `1e-3` of one and the same binding metadata. Comparisons
reject mixed model versions, preprocessing versions, dimensions, or bindings.
`UnavailableEmbeddingProvider` fails closed. `SyntheticEmbeddingProvider` is
deterministic test scaffolding only and uses no images, weights, network, or
real user data.

## Identify response (`identify.v1`)

Results contain at most three unique candidate IDs, broad confidence bands
(`likely`, `possible`, `weak`), bounded reasons, a new-cat recommendation, and
a server timestamp. Candidates are tentative suggestions only: AI never
confirms identity. Independent human review in `match_reviews` is authoritative.

The compatibility adapter accepts the existing `/v1/identify` evidence shape,
including numeric similarity evidence, only at a trusted internal adapter
boundary. It validates that evidence through the strict typed request and emits
only the allow-listed result fields. This score-bearing compatibility shape is
not the public/untrusted API contract; external callers must not send image
paths, bytes, vectors, locations, or arbitrary fields, and no numeric evidence
is ever returned.

## Job callbacks (`identify-callback.v1`)

Lifecycle is `queued -> running -> succeeded|failed|cancelled`; the first
accepted event must be `queued`. A callback is
idempotent by `(jobId,eventId)`: an exact duplicate returns the same state and a
conflicting reuse is rejected. Attempts are bounded integers and nondecreasing;
stale attempts cannot replace a newer state. State-changing event timestamps
must be nondecreasing; equal timestamps are accepted in arrival order.
Terminal states are immutable, and invalid transitions/timestamp rollback are
not recorded as accepted state.
Succeeded events require a bounded `JobResult`; failed events require only a
bounded error code. Result and error are mutually exclusive by status. The
in-memory `CallbackStore` is a pure reducer contract test double: no queue
vendor, database, ANN index, network callback, or deployment is included.

## Persistence mapping and omissions

An identify job is associated with `media_assets.id` and candidate proposals
are persisted as tentative rows in `identity_proposals`. Human decisions belong
in `match_reviews`; that review is the only authoritative identity outcome.
The AI contract does not expose storage paths, exact locations, source media,
vectors, scores, reporter identity, or model internals through any of these
projections.

## Synthetic evaluation gate

`services/ai/tests/fixtures/open_set_cases.json` contains only synthetic IDs and
booleans. The gate reports Recall@3 `>= 0.85`, unknown rejection `>= 0.80`, and
likely false match on unknown `<= 0.05`. A mixed model/preprocessing version is
always rejected before comparison. Passing this fixture is not evidence of
production recognition accuracy and does not enable automatic publication.
