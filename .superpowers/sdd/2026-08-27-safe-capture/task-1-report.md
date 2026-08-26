# Task 1 report — Brand and fail-closed media domain

## Red

Command:

```text
pnpm --filter @animalhelper/mobile test -- review-policy.test.ts draft-policy.test.ts catalog.test.ts
```

Result: failed as expected. The new review-policy suite could not resolve the not-yet-created `./review-policy` module, and the new catalog assertion received `AnimalHelper` instead of `WhiskerCommons`. The existing draft suite passed (2 tests).

## Green and verification

Focused command:

```text
pnpm --filter @animalhelper/mobile test -- review-policy.test.ts draft-policy.test.ts catalog.test.ts
```

Result: 3 suites passed, 8 tests passed.

Full mobile verification:

```text
pnpm --filter @animalhelper/mobile test
```

Result: 6 suites passed, 15 tests passed.

```text
pnpm --filter @animalhelper/mobile typecheck
```

Result: exit code 0.

```text
pnpm --filter @animalhelper/mobile build
```

Result: exit code 0; Expo web export completed with 13 static routes.

## Changes

- Added immutable media contracts and a fail-closed review reducer/policy. Staging requires reviewed status, a matching receipt hash, and matching dimensions/byte length.
- Added tests for confirmation, mask-change invalidation, draft raw-source exclusion, and bilingual display branding.
- Changed the report retry dedupe key to the stable screen draft ID.
- Applied `WhiskerCommons` to the requested user-facing app, mobile catalogue, admin, AI title, README and product charter surfaces.
- Preserved technical identifiers including package scopes, slug, scheme, bundle/package IDs, offline key names and Python import paths.

## Self-review and concerns

- The design spec referenced by the brief (`docs/superpowers/specs/2026-08-27-safe-capture-design.md`) is not present in the workspace; implementation follows the exact Task 1 brief and plan interfaces.
- `detectorVersions` is initialized empty because automatic detectors are intentionally unavailable in this task; later processing can populate it.
- The existing auth callback copy still says `AnimalHelper`; it was not in the brief’s modification list and is a user-facing surface that may merit a later branding sweep.

## Fix round 1

Red command:

```text
pnpm --filter @animalhelper/mobile test -- review-policy.test.ts draft-policy.test.ts callback.test.tsx
```

Result: failed for the actual unsafe behaviors: stored drafts still returned `photoUri`, callback branding had no WhiskerCommons message export, and a receipt with mismatched recipe provenance was accepted by `canStageMedia`.

Changes:

- Removed `photoUri` from `StoredDraft`, stopped Report from passing the selected URI to draft storage, removed URI reads/writes from the native store, and clear legacy `photo_uri` values during database initialization. Save status now truthfully says the photo must be added again.
- Changed auth callback visible copy to WhiskerCommons and added a source-level assertion under `src` (outside Expo routes).
- Added immutable recipe/detector provenance to `RenderedMedia`; receipts copy it and `canStageMedia` requires exact recipe and detector-version binding.
- Corrected the missing-spec concern: the referenced design spec exists at `docs/superpowers/specs/2026-08-27-safe-capture-design.md`.

Focused green: 3 suites, 7 tests passed.

Full verification: 7 suites, 17 tests passed; mobile typecheck passed; Expo web build passed with 13 static routes (the test is not exported as a route).

## Fix round 2

Red command:

```text
pnpm --filter @animalhelper/mobile test -- review-policy.test.ts draft-policy.test.ts draft-store.native.test.ts
```

Result: failed for the targeted gaps: insertion-order-equivalent detector maps were rejected by `JSON.stringify`, and native SQL regression constants were not yet exposed for verification. The draft privacy test was also corrected to exercise the actual leaked `photoUri` field.

Changes:

- Replaced order-sensitive detector-version serialization with exact key-set/value semantic comparison.
- Added rejection coverage for mismatched hash, width, height, byte length, and missing/extra/different detector versions; equivalent maps in different insertion order are accepted.
- Added native-store source-level regression coverage proving save/read SQL omit `photo_uri` and initialization clears legacy values; no raw URI was reintroduced.

Focused green: 3 suites, 9 tests passed.

Full verification: 8 suites, 20 tests passed; mobile typecheck passed; Expo web build passed with 13 static routes.

## Fix round 3

Red command:

```text
pnpm --filter @animalhelper/mobile test -- review-policy.test.ts
```

Result: the new prototype-chain regression initially passed incorrectly, proving `equalVersionMaps` could accept an inherited detector version property.

Changes:

- Required every compared detector key to be an own property of the right-hand map using `Object.prototype.hasOwnProperty.call`, preserving order-independent exact key/value equality and supporting null-prototype maps.
- Added the inherited-property regression while retaining equivalent insertion-order and missing/extra/value mismatch coverage.

Focused green: 1 suite, 6 tests passed.

Full verification: 8 suites, 21 tests passed; mobile typecheck passed; Expo web build passed with 13 static routes.
