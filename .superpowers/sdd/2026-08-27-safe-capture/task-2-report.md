# Task 2 report: canonical render, manual masks, and secure retry state

Status: **DONE_WITH_CONCERNS**

Base commit: `b88c3d5c92efa47854238f9a1f4a4d5a615ee0ea`

## Delivered behavior

- Added a frozen canonical processor contract for `jpeg-srgb-2048-q88.v1`: JPEG output, applied decode orientation, maximum longest edge 2048, no upscaling, and quality 0.88.
- Added a native Expo adapter that decodes through `expo-image-manipulator`, uses a lossless PNG intermediate, redraws pixels on a Skia surface, burns normalized manual masks as non-antialiased opaque black rectangles, encodes the final JPEG, rejects unsafe/truncated JPEG marker streams, and calculates SHA-256, byte length, and dimensions from the final encoded bytes.
- Added a web adapter that always fails closed with `secure_media_processing_unavailable` and exposes no staging path. Platform-specific module resolution keeps native Skia, filesystem, and key-storage code out of the web bundle.
- Added private reviewed-media persistence. It gates byte access on the exact Task 1 receipt, encrypts final rendered bytes with AES-256-GCM, uses a fresh 12-byte nonce and 16-byte tag per record, authenticates draft/media/receipt provenance as AAD, stores only the encoded key in SecureStore under `animalhelper.reviewed-media.v1`, and writes encrypted media outside SecureStore as `reviewed-media/<mediaId>.agcm`.
- Deletes selected-source, canonical, and prior reviewed cache files best-effort only after the encrypted write succeeds. Failed persistence leaves transient material available for retry and never stages plaintext.
- Extended draft schema/policy to version 2 fields: stable draft/media IDs, optional sighting ID, encrypted reviewed path, receipt, and bounded retry state. Legacy `photo_uri` is cleared and is absent from save/list queries. Coordinates, tokens, and raw/canonical URIs are rejected or omitted.
- Added deterministic retry policy: network/408/429/5xx receive capped exponential backoff with bounded jitter; 400/403/hash/metadata/version failures require user action; attempts cap at five and error values are bounded. Complete media updates clear stale delay/error values, while text-only draft saves preserve the media snapshot.
- Added a native review modal. It keeps the selected URI only in transient component memory, previews the exact final rendered URI, burns tap-created masks into final pixels, invalidates confirmation on every edit, explicitly labels cat/people/plate detection unavailable, and encrypts only after exact-pixel confirmation. There is no media upload or publication action.

## TDD evidence

### RED

Focused processor/retry command:

```text
pnpm --filter @animalhelper/mobile test -- processor.test.ts upload-job.test.ts
```

Initial result: the processor and retry modules were missing. After adding explicit temporary `not_implemented` boundaries, all 15 focused expectations failed as intended.

Additional focused RED cycles:

- `pnpm --filter @animalhelper/mobile test -- processor.native.test.ts`: missing native implementation, then a regression test showed metadata after JPEG scan data was not rejected.
- `pnpm --filter @animalhelper/mobile test -- draft-media.native.test.ts`: missing reviewed-media persistence.
- `pnpm --filter @animalhelper/mobile test -- draft-policy.test.ts draft-store.native.test.ts`: three failures for absent private media schema/policy fields.
- `pnpm --filter @animalhelper/mobile test -- redaction-review.test.tsx`: missing modal, then an accessibility-role failure.
- `pnpm --filter @animalhelper/mobile test -- processor.web.test.ts`: missing fail-closed web modules.
- Later regression tests failed before fixes for mismatched encrypted-path/media IDs, inherited detector-version maps, non-finite retry randomness, stale nullable retry fields, and same-length rendered-byte mutation after confirmation.

The final retry-state regression RED was:

```text
pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts
FAIL src/offline/draft-store.native.test.ts
Tests: 1 failed, 2 passed, 3 total
Expected next_attempt_at and last_error to use media-aware replacement rather than COALESCE.
```

### GREEN

The retry-state regression became:

```text
pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts
PASS src/offline/draft-store.native.test.ts
Tests: 3 passed, 3 total
```

All focused suites were made green before the full verification run. No test was weakened to bypass a native security requirement; native boundary tests use dependency injection while production code calls the installed Expo primitives.

## Dependency and native-capability decisions

- Installed Expo-aligned versions: `expo-image-manipulator ~57.0.13`, `expo-file-system ~57.0.5`, and `@shopify/react-native-skia 2.6.2`.
- The first registry attempt timed out fetching a native tarball. A bounded retry with a five-minute fetch timeout completed. Registry/network retries are no longer active.
- pnpm required explicit native build approval for Skia, recorded as `@shopify/react-native-skia: true` in `pnpm-workspace.yaml`.
- Expo Crypto 57.0.2 has the required native AES-GCM API (`AESEncryptionKey`, `aesEncryptAsync`, combined nonce/ciphertext/tag output), so the implementation uses real authenticated encryption rather than a stub or substitute. Keys are never logged or stored in app data/files, and media bytes never enter SecureStore.
- The lockfile was pruned back to the requested aligned additions; incidental updates caused by pre-existing `latest` ranges were removed. `pnpm install --lockfile-only --frozen-lockfile --offline` passed supply-chain validation for 938 entries.
- Existing technical identifiers were preserved: scheme `animalhelper`, iOS bundle `sg.animalhelper.app`, Android package `sg.animalhelper.app`, draft database `animalhelper-drafts.db`, draft key `animalhelper.offline-drafts.v1`, and the new reviewed-media key `animalhelper.reviewed-media.v1`.

## Verification

Fresh combined command on the completed code tree:

```text
pnpm --filter @animalhelper/mobile test
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
```

Result:

```text
Test Suites: 14 passed, 14 total
Tests:       55 passed, 55 total
tsc --noEmit: exit 0
expo export --platform web: exit 0
Static routes: 14, including /report/redaction-review
```

`git diff --check` also passed; Git printed only the repository's Windows LF-to-CRLF advisory warnings.

## Self-review

- Re-read the Task 2 brief, full safe-capture design, Task 1 contracts/reducer/policy, mobile app configuration, installed dependency typings, and final diff.
- Confirmed hashes, byte lengths, and dimensions are inspected from the final JPEG rather than source or intermediate material.
- Hardened JPEG validation to inspect metadata markers after SOS, not just header segments.
- Required exact detector-map equality for receipt binding and rejected inherited/extra detector entries in stored receipt validation.
- Required encrypted path and stable media ID to agree, and re-hashed the rendered bytes immediately before encryption so a same-length cache mutation cannot pass a receipt's byte-length check.
- Clamped injected random values and selected neutral deterministic jitter for non-finite input.
- Changed retry upserts so successful media updates can clear stale `next_attempt_at` and `last_error` values without text-only draft saves erasing media state.
- Audited the lockfile diff to ensure it contains only requested dependency changes and no unrelated version refreshes.

## Concerns and follow-up gates

- This Windows environment cannot execute an iOS/Android simulator or device build. Native processing, Skia encoding, filesystem, SecureStore, and AES-GCM paths are typechecked and covered at their injected boundaries, but an Expo development build must still exercise the full HEIC/orientation/mask/encrypt lifecycle on representative iOS and Android devices before release.
- Automatic cat, people, and licence-plate detectors remain deliberately unavailable. No model weights or unsupported detector claims were added.
- Upload transport, server finalization, attestation verification, quarantine handling, and any publication flow are outside Task 2. This task provides only private encrypted local persistence and pure retry-state transitions; client attestation does not publish anything.
- No credentials, service-role key, real user data, or model weights were introduced.

## Fix round 1

Independent review status before this round: **FAILED** with six Important findings and one Minor finding.

### RED evidence

The first adversarial regression batch was run before production changes:

```text
pnpm --filter @animalhelper/mobile test -- processor.native.test.ts draft-media.native.test.ts draft-media.coordinator.test.ts reviewed-draft.test.ts redaction-geometry.test.ts upload-job.test.ts draft-policy.test.ts draft-store.native.test.ts
```

Observed result:

```text
Test Suites: 8 failed, 8 total
Tests:       28 failed, 38 passed, 66 total
```

The failures demonstrated the requested gaps rather than incidental syntax issues in existing modules:

- The JPEG policy accepted an empty entropy scan, restart-before-entropy, nested SOI, malformed SOS, and a marker immediately after SOS.
- The key coordinator and temp-file commit APIs did not exist; current persistence still used a direct final write.
- The metadata-retry and contain-mode tap helpers did not exist.
- Retry state accepted negative/fractional/out-of-range attempts, hostile state/clock values, and invalid HTTP statuses including 600, infinity, and fractional values.
- Draft storage still required an arbitrary absolute path and did not reject invalid draft IDs.

Additional focused RED cycles were captured before their fixes:

```text
pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts
Tests: 2 failed, 2 passed, 4 total
# missing opaque reviewed_media_ref schema and legacy absolute-path clearing

pnpm --filter @animalhelper/mobile test -- draft-media.native.test.ts
Tests: 1 failed, 4 passed, 5 total
# caller/gallery rendered URI was read and encrypted instead of rejected

pnpm --filter @animalhelper/mobile test -- draft-policy.test.ts
Tests: 1 failed, 19 passed, 20 total
# bounded invalid_upload_attempt error was discarded
```

### Fixes

1. **Strict JPEG structure.** Replaced the marker-presence check with a structural scanner. SOI is accepted only at byte zero; frame and SOS component layouts/lengths are validated; each scan requires a real entropy byte; stuffed bytes and entropy restart markers are handled; restart markers outside entropy, nested SOI, malformed/truncated segments, empty scans, repeated/early EOI, and trailing data are rejected. APP1, APP13, and COM remain rejected before or after scan data. The positive fixture is a locally generated synthetic black 1×1 decoder-valid JPEG; Skia decode remains a second defense.
2. **Serialized key initialization.** Added one module-level in-flight coordinator for the SecureStore AES-256 key. Concurrent first use shares one load/generate/re-read/persist operation and one key result. Failed initialization clears the shared promise so a later attempt can recover. The key name, AES-256-GCM construction, 12-byte nonce, 16-byte tag, AAD, and device-only SecureStore policy are unchanged.
3. **Recoverable encrypted commit.** Encrypted bytes now write to a unique app-owned temp reference in `reviewed-media`, then move/replace the stable final reference with overwrite semantics; temp state is removed after partial-write or final-commit failure. A prior stable media ID is replaceable rather than permanently blocked. The review UI retains the returned encrypted reference plus confirmed receipt when SQL metadata save fails and retries metadata only, without re-reading plaintext or re-encrypting. Plaintext cache deletion occurs only after durable encrypted commit.
4. **Contain-mode tap geometry.** Added a pure content-rectangle mapper. It derives letterbox/pillarbox offsets from rendered and frame dimensions, rejects taps outside displayed image pixels, and normalizes valid taps relative to those pixels. Tests cover 2:1 and 1:2 images, centers, all content edges, and outside taps. The UI calls this mapper before creating a mask.
5. **Hostile retry inputs.** `nextUploadAttempt` now validates state, integer attempts in 0..5, a finite valid `Date`, known result kind, and integer HTTP status in 100..599. Invalid inputs fail closed deterministically to `needs_user`, attempt 0, no schedule, and bounded `invalid_upload_attempt`. Only 500..599 (plus 408/429/network) retries. Stored waiting jobs require a valid schedule; all other states clear it.
6. **Anchored references and deletion.** Drafts now store only `reviewed-media/<validatedMediaId>.agcm` in `reviewed_media_ref`. Native file creation resolves internal references beneath `Paths.document/reviewed-media`; legacy absolute `reviewed_media_path` values are cleared and excluded from save/list queries. Persistence rejects any rendered URI outside the owned reviewed-cache prefix before reading bytes, and cleanup accepts only owned `animalhelper-canonical-*` or `animalhelper-reviewed-*` JPEGs directly beneath `Paths.cache`. Traversal, attacker absolute paths, unrelated cache files, and gallery/content URIs are neither stored nor deleted. The ImagePicker source URI is no longer put in cleanup targets.
7. **Draft identity.** Missing, empty, short, traversal-shaped, and otherwise invalid draft IDs now fail with `invalid_draft_id` rather than being stringified.

### Preserved properties

- Web processing and persistence adapters still fail closed with `secure_media_processing_unavailable`, and the Expo web bundle does not import native staging paths.
- Final rendered bytes are re-hashed immediately before authenticated encryption and must match the exact confirmed receipt.
- Automatic cat, people, and plate detector versions remain explicitly `unavailable`.
- No media upload, publication, or client-side publication attestation was added.
- Drafts still omit coordinates, tokens, selected-source URIs, and canonical URIs.
- Technical package, scheme, bundle, database, and key identifiers remain unchanged. No credentials, real data, model weights, or service-role material were added.

### GREEN and final verification

Focused review suites:

```text
pnpm --filter @animalhelper/mobile test -- processor.native.test.ts draft-media.native.test.ts draft-media.coordinator.test.ts reviewed-draft.test.ts redaction-geometry.test.ts redaction-review.test.tsx processor.web.test.ts upload-job.test.ts draft-policy.test.ts draft-store.native.test.ts
Test Suites: 10 passed, 10 total
Tests:       75 passed, 75 total
```

Fresh final command chain:

```text
pnpm --filter @animalhelper/mobile test
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
pnpm install --lockfile-only --frozen-lockfile --offline
git diff --check
```

Result:

```text
Test Suites: 17 passed, 17 total
Tests:       96 passed, 96 total
tsc --noEmit: exit 0
expo export --platform web: exit 0 (14 static routes, including /report/redaction-review)
frozen offline lockfile validation: exit 0, already up to date
git diff --check: exit 0 (Windows LF-to-CRLF advisories only)
```

No dependency or lockfile change was needed in fix round 1. The existing Windows-only native-device release gate remains: representative iOS and Android development builds must still validate ImageManipulator, Skia JPEG structure/output, atomic file replacement, SecureStore, and AES-GCM end to end.
