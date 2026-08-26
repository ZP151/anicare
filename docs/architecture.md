# Architecture and data decisions

## Stack

- Mobile: Expo SDK 57, React Native 0.86, Expo Router and TypeScript.
- Visual system: native `expo-glass-effect` on supported iOS devices; blur or opaque accessible fallbacks elsewhere. Glass is presentation only and never a business-logic dependency.
- Backend: Supabase Auth, PostgreSQL/PostGIS/pgvector, Storage, RLS and Edge Functions.
- Public location: H3 resolution 9 cell plus time bucket and a risk-dependent delay.
- Admin: Next.js App Router, server-only data access and role-gated operations.
- AI: Python/FastAPI/Mangum service, ONNX Runtime inference target, asynchronous job transport target and versioned embeddings.
- Monorepo: pnpm workspaces, Turborepo, Jest/Vitest/unittest and GitHub Actions.

## Trust boundaries

```text
mobile device
  ├─ encrypted draft DB (no coordinates)
  ├─ one-time precise location ──> create-sighting Edge Function
  └─ redacted, EXIF-free image ──> public-media Storage

create-sighting
  ├─ H3/time/risk projection ──> RLS-protected public tables
  ├─ AES-GCM location material ──> private schema
  └─ append-only access record ──> audit schema

AI worker
  ├─ reads redacted image + versioned reference embeddings
  └─ writes candidate proposal (tentative, not identity truth)

admin
  └─ role + recusal checks ──> moderation, identity review, task grants, audit
```

The private schema is not exposed through the client API. Service-role credentials stay in trusted server runtimes. Public responses never contain ciphertext, nonce, coordinates or internal AI scores.

## Core data model

- `animals`: stable identity root; verification, visibility and derived lifecycle.
- `animal_aliases`: community names with provenance.
- `animal_events`: append-only identity/lifecycle facts and disputes.
- `sightings`: approximate cell, time bucket, risk, traits and delayed visibility.
- `private.precise_locations`: AES-GCM material with a 12-month destruction deadline.
- `care_events`: completed care, not requests or promises.
- `media_assets`: redaction assertion, consent status, hash and optional versioned embedding.
- `identity_proposals` and `match_reviews`: tentative AI/manual proposal and independent decision.
- `moderation_reports`, `appeals`, `user_blocks`: UGC safety loop.
- `role_grants`, `location_access_grants`, `audit.access_audit`: least privilege and accountability.

## Non-negotiable invariants

1. A client cannot self-publish an immediate or precise sighting.
2. Critical locations stay hidden; sensitive locations have a longer delay.
3. A precise-location grant is user/animal/purpose scoped, revocable and no longer than 24 hours.
4. A reviewer cannot decide a case involving themselves as reporter, author or target.
5. Deleting a photo tombstones metadata, disables training eligibility and clears the embedding before object deletion.
6. The 12-month retention job destroys ciphertext and nonce; it does not merely hide rows.
7. An AI output is a proposal and exposes bands/reasons, not numeric similarity.

## Deployment direction

- Keep Singapore user data and secrets in a reviewed production environment; document every subprocesser and any overseas transfer safeguard.
- Deploy separate development, staging and production projects with independent encryption keys.
- Put AI behind a feature flag and queue; never block sighting creation on inference.
- Require two-person approval for production schema changes affecting location, auth, storage or RLS.
- Production admin must use authenticated server-side data access. The current static console is a visual/queue-policy scaffold only.

