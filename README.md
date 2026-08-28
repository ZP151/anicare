# WhiskerCommons

WhiskerCommons is a privacy-first, free community-cat identity and care record platform for a closed Singapore pilot. It treats AI as a review aid, never as an automatic identity authority.

## Current implementation

WhiskerCommons is the display brand only. Existing package scopes, Python import
path, OAuth scheme, bundle identifiers, database identifiers and offline-key
names remain compatible technical identifiers.

- Expo SDK 57 mobile app with Nearby, Map, Report, Following and Profile tabs,
  bilingual navigation, and platform-adaptive Liquid Glass/fallbacks.
- Manual opaque-mask review, canonical JPEG rendering and encrypted local
  reviewed-media recovery. Automatic person, licence-plate and cat detectors,
  and native-device execution, are not implemented release gates.
- SQLCipher offline report drafts whose stored form excludes coordinates and
  access tokens, plus local reviewed-media receipt/journal boundaries. Native
  report submission now recovers a stable sighting by its draft ID, appends the
  immutable sighting ID, and drives private media retry through the local CAS
  coordinator; supported-device validation remains a release gate.
- Backend private Supabase staging/quarantine, cleanup contracts and strict JPEG
  marker validation, plus authenticated native artifact access and the
  reserve-to-signed-upload-to-finalize wiring, are implemented. Hosted/native
  redirect coverage and true post-storage-token-expiry cleanup/replay remain
  required before release. No media is promoted to public storage: a durable
  `quarantined` result is private and is not public availability.
- Narrow public-feed/report/block contracts and an authenticated, audited admin
  contract. Their non-media database runtime verification and two-session
  concurrency remain required gates.
- Versioned, model-free AI contracts for crops, embeddings, callbacks and public
  results, plus synthetic evaluation fixtures. The internal identify route
  fails closed behind an ASGI token boundary. There are no model weights,
  labelled dataset, ANN, queue, real callback, or production accuracy claim.

The UI contains synthetic placeholder content only. It is not connected to
production data and must not be used to record real locations. This repository
does not claim pilot readiness.

## Requirements

- Node.js 22+
- pnpm 11.19
- Python 3.12–3.13 for the AI service
- Docker Desktop, Supabase CLI and Deno for local database/Edge contract checks

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @animalhelper/mobile dev
pnpm --filter @animalhelper/admin dev
```

For the AI HTTP service:

```bash
python -m pip install -e "services/ai[dev]"
pnpm --filter @animalhelper/ai dev
```

Copy `.env.example` to a local untracked environment file and populate it with development-only values. `PRECISE_LOCATION_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Never reuse keys across environments. Set `MEDIA_ALLOWED_ORIGIN` to the single trusted web origin for media Edge Functions; it is used only for CORS. Set the non-secret `MEDIA_PUBLIC_SUPABASE_ORIGIN` to the exact public Supabase API origin trusted by clients (scheme, host, and optional port only). Native requests have no `Origin` header and are authenticated normally, but browsers from an absent or different origin are rejected.

Configure `animalhelper://**` as an allowed Supabase Auth redirect and enable the Apple/Google providers before testing social sign-in. Invoke `private.apply_location_retention()` and `private.purge_expired_location_grants()` daily from a trusted database scheduler; only `service_role` can execute them. Invoke `cleanup-media-staging` from the same trusted scheduler with its service credential: it retains active quarantined-job metadata for later deletion, handles orphaned private staging jobs, and waits through signed-upload replay windows before physical deletion. Its client-facing `uploadCredentialUsableUntil` is a conservative pre-mint lower bound, never a claim that the token expires at that exact instant.

## Safety invariants

- Public clients receive H3 r9 cells, not latitude/longitude.
- Normal sightings appear after two hours, sensitive sightings after 24 hours, and critical sightings remain hidden for review.
- Contributor AI selections remain tentative until an independent trusted review.
- Public responses use confidence bands and reasons; internal numeric scores are not exposed.
- Selected source-image bytes are never uploaded. Only a newly rendered JPEG
  tied to a valid review receipt may enter private staging; public media
  promotion is disabled.
- Offline drafts never persist coordinates; location is requested again only at explicit submission time.
- Production precise-location access is task-specific, expires within 24 hours and is audited.

## Repository map

- `apps/mobile` — Expo mobile client
- `apps/admin` — private operations console
- `packages/domain` — shared privacy and governance behavior
- `supabase` — migrations, pgTAP tests and Edge Functions
- `services/ai` — candidate fusion, evaluation and Lambda/FastAPI entrypoint

## Release gates

Gate 2A evidence and the remaining gates that still block pilot-ready status
are:

- Gate 2A media proof is complete for local-stack HTTP/Auth/Storage composition
  with two synthetic sessions, evidenced on the fresh GitHub Actions run
  [33193118991](https://github.com/ZP151/anicare/actions/runs/33193118991) with both
  required jobs green:
  [verify](https://github.com/ZP151/anicare/actions/runs/33193118991/job/98923364388)
  and
  [database-contracts](https://github.com/ZP151/anicare/actions/runs/33193118991/job/98923364075).
- Build and test the manual review flow on supported native devices. Automatic
  person, licence-plate and cat detection remain disabled until device, model,
  licence and adversarial-corpus gates pass.
- Keep public media promotion disabled until trusted server-side residual checks
  are implemented and verified. Client attestation alone never permits it.
- Exercise the authenticated artifact reader and complete
  reserve-to-signed-upload-to-finalize media transport on hosted or native
  paths, including redirects, capability expiry and cleanup races. Local unit
  coverage and local-stack CI are not a substitute for that completion.
- Validate true post-storage-token-expiry cleanup and replay behavior in Gate 2B.
- Complete non-media and cross-functional gates: feed/report/admin runtime,
  legal/compliance operations, Singapore legal structures, real-user/test-data
  policy, and production AI accuracy evidence on consented data.
- Use a qualified, consented labelled dataset before evaluating Recall@3 at
  least 85%, unknown rejection at least 80%, and likely false matches on unknown
  cats at most 5%. Current evaluation is synthetic only and establishes no
  production accuracy result.
