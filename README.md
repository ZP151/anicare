# WhiskerCommons

WhiskerCommons is a privacy-first, free community-cat identity and care record platform for a closed Singapore pilot. It treats AI as a review aid, never as an automatic identity authority.

## Current implementation

- Expo SDK 57 mobile app with Nearby, Map, Report, Following and Profile tabs.
- Platform-adaptive Liquid Glass on supported iOS 26 devices, accessible blur/solid fallbacks elsewhere.
- English and Simplified Chinese message catalogue.
- Email, Apple and Google PKCE sign-in entry points with a native deep-link callback.
- SQLCipher offline report drafts whose stored form excludes coordinates and access tokens.
- Event-ledger domain model, H3 resolution 9 public cells, delayed exposure and 24-hour task grants.
- Supabase schema with RLS, separate encrypted precise-location schema, moderation, appeals and audit records.
- Audited Edge Function for atomic sighting plus AES-GCM location storage.
- Retention/deletion functions that destroy 12-month precise-location ciphertext and clear image embeddings before object deletion.
- Private Next.js operations console shell.
- Python candidate-fusion service with Top-3/new-cat contracts and open-set beta metrics.

The UI contains synthetic placeholder content only. It is not connected to production data and must not be used to record real locations until the company, DPO, privacy documents and production secrets are in place.

This repository is the Sprint 0–1 implementation baseline, not a claim that the complete production rollout is finished. Real model weights and qualified cat-identity data, automated on-device bystander/plate redaction, production admin authentication/data wiring, push notifications, app-store signing and Singapore operational/legal setup remain release work.

## Requirements

- Node.js 22+
- pnpm 11.19
- Python 3.12–3.13 for the AI service
- Docker Desktop and Supabase CLI for local database policy tests

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

Copy `.env.example` to a local untracked environment file and populate it with development-only values. `PRECISE_LOCATION_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Never reuse keys across environments. Set `MEDIA_ALLOWED_ORIGIN` to the single trusted web origin for media Edge Functions; it is required there. Native requests have no `Origin` header and are authenticated normally, but browsers from an absent or different origin are rejected.

Configure `animalhelper://**` as an allowed Supabase Auth redirect and enable the Apple/Google providers before testing social sign-in. Invoke `private.apply_location_retention()` and `private.purge_expired_location_grants()` daily from a trusted database scheduler; only `service_role` can execute them. Invoke `cleanup-media-staging` from the same trusted scheduler with its service credential: it handles orphaned private staging jobs, never deletes active quarantined media, and waits through signed-upload replay windows before physical deletion.

## Safety invariants

- Public clients receive H3 r9 cells, not latitude/longitude.
- Normal sightings appear after two hours, sensitive sightings after 24 hours, and critical sightings remain hidden for review.
- Contributor AI selections remain tentative until an independent trusted review.
- Public responses use confidence bands and reasons; internal numeric scores are not exposed.
- Images must be re-encoded, stripped of EXIF and redacted on-device before the public bucket is used.
- Offline drafts never persist coordinates; location is requested again only at explicit submission time.
- Production precise-location access is task-specific, expires within 24 hours and is audited.

## Repository map

- `apps/mobile` — Expo mobile client
- `apps/admin` — private operations console
- `packages/domain` — shared privacy and governance behavior
- `supabase` — migrations, pgTAP tests and Edge Functions
- `services/ai` — candidate fusion, evaluation and Lambda/FastAPI entrypoint

## Release gates

The closed beta requires all privacy/RLS tests to pass, zero unresolved critical location incidents, Recall@3 of at least 85% on qualified identities, unknown rejection of at least 80%, and likely false matches on unknown cats of at most 5%. AI stays behind a feature flag if it misses the gate.
