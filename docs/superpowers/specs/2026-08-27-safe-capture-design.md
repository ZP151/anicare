# WhiskerCommons Safe Capture Design

## Scope

This design advances the approved product charter through Sprint 2–3 and freezes the contracts needed for Sprint 4–5. It covers user-facing branding, safe media preparation and private staging, a narrow public feed, report/block APIs, authenticated moderation operations, and model-free AI contracts. It does not claim that production cat-face recognition or automatic person/licence-plate detection exists.

## Decisions

1. **Brand:** the product display name is `WhiskerCommons`; the proposed repository slug is `whisker-commons`. Existing package scopes, Python import paths, OAuth scheme, bundle identifiers, database identifiers and local encryption-key names remain unchanged in this iteration.
2. **Fail closed:** a selected source image is never uploaded. Only newly rendered JPEG bytes tied to a review receipt may enter private staging.
3. **No direct public UGC writes:** authenticated clients lose direct insert access to `public-media` and `media_assets`. Staged media is private and idempotent by a client-generated `mediaId`.
4. **Pilot publication:** media remains `quarantined` until a trusted server path validates its hash, JPEG markers, dimensions and review versions. Automatic public publication remains disabled until residual detection is available.
5. **Location:** offline drafts never contain coordinates or tokens. Location is captured once at explicit submission; a stable draft UUID is the sighting dedupe key.
6. **Public projection:** mobile clients consume narrow RPC projections. Raw UGC tables and exact timestamps are not public API surfaces; RLS is not treated as column redaction.
7. **Administration:** the Next.js console uses the acting administrator's Supabase session and publishable key. It never imports a service-role key. Every queue read and moderation action is audited by an atomic database function.
8. **AI authority:** AI contracts carry versions, quality gates and broad confidence bands. They never expose vectors, numeric similarity, storage paths, exact locations or identity confirmation.

## Mobile media pipeline

The persisted state machine is:

```text
empty -> preparing -> needs_review -> rendering -> ready_to_confirm
      -> reviewed -> upload_pending -> uploading -> finalizing
      -> quarantined | complete
```

An edit after confirmation invalidates the receipt. The review receipt binds `sha256`, recipe version, detector versions, dimensions and byte length. Sprint 2–3 ships a manual opaque-mask editor and a detector interface that returns `unavailable`; that state prevents public publication. A later local Expo Module will supply locked automatic person and Singapore licence-plate masks in development builds.

Canonical output is JPEG, sRGB/RGB, maximum longest edge 2048 px, no upscaling, quality 0.88, orientation applied, and metadata removed through decode/re-encode. “Deterministic” means a versioned recipe and repeatable output within the same platform/build; cross-platform byte identity is not promised.

Raw and canonical cache files are transient. A reviewed draft stores an AES-GCM encrypted copy, its receipt, stable draft/media IDs, sighting ID after creation, retry state and bounded non-sensitive errors. It stores no raw source URI, coordinates or access token.

## Media backend

The database adds `media_upload_jobs` in the private schema and a private `media-staging` bucket. Reservation returns a signed upload target plus separate 10-minute reservation and conservative two-hour credential-usable-until times; the latter is captured before Storage mints its token and is never represented as an exact expiry. Finalization verifies object ownership and expected SHA/size/type, runs the pure JPEG marker policy, creates or updates one media row, and returns `quarantined` until a trusted publisher promotes it. Expired unfinalized jobs are retried and ultimately purged by a service-role scheduler. Active quarantined-media jobs remain as deletion bookkeeping; logical deletion waits through the credential replay window before removing the private object and job. Jobs retain cleanup state with a null uploader after profile deletion.

JPEG validation rejects APP1, APP13 and COM markers, malformed/truncated files, dimension/length mismatches and non-JPEG magic bytes. A client attestation alone never enables public publication.

## Public and safety APIs

`list_public_sighting_feed` returns only `sightingId`, `animalId`, alias, verification, public H3 cell, coarse time bucket and an optional safe media ID. It clamps page size to 1–50 and never returns exact timestamps, reporter, notes, traits, risk, storage path or internal scores.

Authenticated report/block functions derive the actor from `auth.uid()`. Clients cannot choose report risk, status, deadline, author, target or reviewer. Moderation actions lock the report, enforce platform-admin role and recusal, update visibility atomically, append a durable action and append an audit record.

## Admin console

Without configuration or an authenticated active platform-admin role, the console renders an unavailable/unauthorised state and no action controls. Login uses a PKCE email link. Queue/detail reads and resolution are server-only wrappers over database functions, uncached, and pass the acting user's JWT.

Area-steward moderation, role-grant management, break-glass, location decryption and appeal adjudication remain disabled.

## AI alpha contract freeze

The Python service adds strict schemas for normalized crops, image-quality results, versioned 384-dimensional embeddings, identify jobs and idempotent callbacks. Unknown fields and non-finite values fail validation. Synthetic fixtures cover known/unknown identities; no model weights, real user media, queue vendor or ANN implementation is introduced.

## Release gates

- A reviewed receipt is invalid after any mask or byte change.
- No selected source bytes, EXIF/GPS/XMP/IPTC/comment segments, coordinates or tokens cross the upload boundary.
- Clients cannot directly write the public media bucket or forge server review time.
- Retry fault injection creates one sighting, one upload job and at most one media row.
- Public projection tests prove that exact timestamp/location and raw UGC columns are absent.
- Moderator recusal and audit writes are proven transactionally.
- AI callback serialization contains no vectors, scores, locations, paths or image data.
- Native automatic detectors and public media promotion remain disabled until device/model, licence, adversarial-corpus and server residual-check gates pass.
