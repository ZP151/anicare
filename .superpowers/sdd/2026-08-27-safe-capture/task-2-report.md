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

## Fix round 2

Independent scoped re-review status before this round: **FAILED** with three Important and two Minor findings. This section supersedes Fix round 1's replace/overwrite design: Expo 57's overwrite move is destructive on both native platforms, so the final design never replaces a ciphertext file.

### RED evidence

The initial adversarial batch was run before production changes:

```text
pnpm --filter @animalhelper/mobile test -- draft-media.coordinator.test.ts reviewed-media-envelope.test.ts reviewed-draft.test.ts render-coordinator.test.ts draft-policy.test.ts draft-store.native.test.ts media-reference.test.ts
```

Observed result:

```text
Test Suites: 7 failed, 7 total
Tests:       23 failed, 23 passed, 46 total
```

Those failures covered missing immutable commit references and no-overwrite behavior, missing authenticated envelope verification, missing durable local-persistence journal/recovery, stale async render coordination, immutable-reference draft policy, corrupt-row containment, and anchored orphan/deletion selection.

Additional focused RED cycles were captured before their corresponding implementation changes:

```text
pnpm --filter @animalhelper/mobile test -- draft-media.native.test.ts reviewed-draft.test.ts --runInBand
Test Suites: 2 failed, 2 total
Tests:       11 failed, 4 passed, 15 total
# persistence still accepted the old stable final and deleted plaintext before DB finalization;
# the durable coordinator/recovery API did not exist

pnpm --filter @animalhelper/mobile test -- reviewed-draft.test.ts --runInBand
Tests: 1 failed, 10 passed, 11 total
# an omitted rendered URI was not included in post-finalization cache cleanup

pnpm --filter @animalhelper/mobile test -- draft-media.native.test.ts --runInBand
Tests: 1 failed, 4 passed, 5 total
# AAD did not yet bind the immutable encrypted reference
```

### Fixes and invariants

1. **Immutable native commit.** Ciphertext now targets `reviewed-media/<mediaId>.<commitId>.agcm`, where every identifier is bounded and validated. A unique temp file in the same app-owned directory is written first and moved to a previously nonexistent final with `{ overwrite: false }`. Existing finals are never deleted or replaced. Partial temp writes and commit failures clean only the owned temp; a final that already exists or appears during a race is preserved. Injected adapter tests assert the exact no-overwrite option and prior-final preservation.
2. **Authenticated, reference-bound envelope.** Native persistence wraps Expo Crypto's AES-256-GCM combined nonce/ciphertext/tag in a length-checked versioned `AHM1` envelope. AAD now binds the draft ID, media ID, immutable encrypted reference, exact receipt/hash/dimensions/recipe/detector status, and encryption version. Recovery reads only an anchored owned reference, parses the envelope, authenticates/decrypts with the SecureStore-held key, and rechecks plaintext length and SHA-256. Existence alone is never treated as a valid commit; absent, valid, and corrupt/tampered artifacts are distinct outcomes.
3. **Durable two-phase journal.** Before any ciphertext operation, SQLCipher persists the stable draft/media IDs, exact receipt, intended immutable reference, and `local_persisting` state. Only after that write succeeds may encryption and immutable commit run. The committed artifact is authenticated before a single SQL upsert moves the row to `upload_pending`; only then are owned canonical/reviewed caches deleted best effort. DB prepare failure performs no encryption. Ciphertext or final-DB failure leaves the durable journal and same reference retryable. Same-session retry uses the same journal/reference; process-restart recovery finalizes a valid artifact without plaintext or re-encryption, while absent and corrupt artifacts become bounded `needs_user` states.
4. **Startup recovery and sweep.** Root startup invokes the platform-split recovery adapter. Native recovery loads durable drafts, processes only `local_persisting` rows, protects every still-referenced immutable ciphertext, and best-effort removes only app-owned temp files and unreferenced immutable ciphertext. The web adapter performs no staging or filesystem recovery. Deleting a draft removes its row and then deletes only a validated anchored owned ciphertext; absolute attacker paths, traversal, content/gallery URIs, unrelated files, and unknown references are untouched.
5. **Synchronous render coordination.** Selection and mask mutation now acquire a synchronous in-flight coordinator before any await or React state scheduling. Each operation receives a generation token; stale completions cannot update state or clear a newer operation's busy flag. Mask arrays and rectangles are copied/frozen so the exact immutable snapshot passed to the renderer is also stored in review state. Tests cover rapid taps, add-vs-clear exclusion, selection invalidating an old render, stale completion order, and snapshot mutation.
6. **Per-row corruption containment.** Draft deserialization parses and sanitizes media fields independently per row. A malformed receipt or other media snapshot corruption produces a valid text-only fail-closed draft (or skips an invalid draft identity) without rejecting the rest of the list.

The durable invariant is: a row may advertise `upload_pending` only after its exact immutable, reference-bound AES-GCM artifact authenticates against the durably stored receipt. `local_persisting` is the only intermediate state. Plaintext never enters SQL or the reviewed-media directory, and cache cleanup cannot precede final metadata commit.

### Preserved properties and dependency decisions

- The strict JPEG structural scanner, real synthetic decoder-valid fixture, contain-mode geometry, serialized key coordinator, hostile retry validation, anchored processor-cache deletion, and invalid-draft-ID checks from Fix round 1 remain covered and unchanged.
- Web media processing/persistence still fails closed with `secure_media_processing_unavailable`; the successful web export confirms platform resolution does not pull native storage/crypto code into the web bundle.
- AES-256-GCM continues to use a fresh 12-byte nonce and 16-byte authentication tag. Media bytes do not enter SecureStore, and raw keys are never logged or written to app files/storage.
- Automatic cat, people, and plate detectors remain explicitly `unavailable`. No upload, publication, or client-attestation publication path was added.
- Drafts still omit coordinates, tokens, selected-source URIs, and canonical URIs. Technical scheme, bundle/package, database, and SecureStore key identifiers are unchanged. No credentials, service role, real user data, or model weights were introduced.
- No package or lockfile change was required. The implementation uses the already aligned Expo 57 Crypto, FileSystem, SecureStore, and SQLCipher-capable SQLite dependencies. Frozen offline installation succeeded; no registry/network retries were attempted or active.

### GREEN and final verification

Focused Fix round 2 suites:

```text
pnpm --filter @animalhelper/mobile test -- draft-media.coordinator.test.ts draft-media.native.test.ts reviewed-media-envelope.test.ts reviewed-draft.test.ts draft-store.native.test.ts media-reference.test.ts render-coordinator.test.ts draft-policy.test.ts processor.web.test.ts redaction-review.test.tsx --runInBand
Test Suites: 10 passed, 10 total
Tests:       62 passed, 62 total
```

Fresh final verification chain:

```text
pnpm --filter @animalhelper/mobile test
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
pnpm install --frozen-lockfile --offline
git diff --check
```

Observed results before commit:

```text
Test Suites: 20 passed, 20 total
Tests:       121 passed, 121 total
tsc --noEmit: exit 0
expo export --platform web: exit 0 (14 static routes, including /report/redaction-review)
frozen offline install: exit 0, already up to date
git diff --check: exit 0 (Windows LF-to-CRLF advisories only)
```

### Self-review and remaining gate

- Re-read the re-review findings against the final data-flow order and tested every requested failure boundary: DB prepare, partial temp write, immutable move, prior/racing final, ciphertext commit, authentication, final DB update, restart with absent/valid/corrupt files, stable retry, stale render completion, corrupt row, startup sweep, and draft deletion.
- Confirmed there is no `overwrite: true` in reviewed-media persistence. Final and temp path resolution accepts only exact relative app-owned reference grammars under `Paths.document/reviewed-media`.
- Confirmed the startup sweep protects all durable references regardless of retry/completion state and deletes only grammar-validated owned temp/orphan entries returned by the app-owned directory listing.
- Confirmed selected source URIs remain transient component inputs and are never included in journal metadata or deletion targets.

The remaining release gate is native-device validation. This Windows environment cannot execute an iOS or Android development build, so representative devices must still validate Expo 57's actual no-overwrite move behavior, post-move file visibility, AES-GCM encrypt/decrypt/tamper rejection, SecureStore lock/unlock behavior, SQLCipher restart recovery, and the complete HEIC/orientation/mask/encrypt lifecycle. No native capability was stubbed or claimed as device-verified.

## Fix round 3

Closeout review status before this round: **FAILED** with four Important and three Minor findings.

### RED evidence

All requested behavior was first encoded in adversarial tests and run against Fix round 2:

```text
pnpm --filter @animalhelper/mobile test -- draft-media.coordinator.test.ts media-reference.test.ts draft-media.native.test.ts reviewed-media-envelope.test.ts reviewed-draft.test.ts processor-cache-sweep.test.ts upload-job.test.ts draft-policy.test.ts draft-store.native.test.ts --runInBand
```

Observed result:

```text
Test Suites: 9 failed, 9 total
Tests:       17 failed, 68 passed, 85 total
```

The failures reproduced the Android check-then-replacing-move race, existing-final rejection, startup deletion of unreferenced final ciphertext, missing processor-cache sweep, missing `confirmedAtLocal` AAD binding, unavailable key/crypto being mislabeled corrupt, whole-file read before size rejection, oversized receipts/envelopes, and transport attempts from `local_persisting`.

Two additional focused RED cycles tightened startup and envelope behavior before implementation:

```text
pnpm --filter @animalhelper/mobile test -- media-recovery.native.test.ts --runInBand
Tests: 1 failed, 1 total
# database failure prevented stale plaintext cache cleanup

pnpm --filter @animalhelper/mobile test -- reviewed-media-envelope.test.ts --runInBand
Tests: 1 failed, 3 passed, 4 total
# a payload shorter than the AES-GCM nonce/tag overhead was accepted
```

### Fixes and security boundaries

1. **Same-reference commit serialization.** A module-level per-final-reference async coordinator now covers the complete exists/write/move decision. Concurrent commits for the same immutable journal queue in one JS runtime. The first absent commit writes and moves once with `{ overwrite: false }`; a later caller that observes the final returns the reference for the existing authenticated-verification step without writing, moving, replacing, or deleting it. The regression adapter intentionally models Expo Android's non-atomic check plus replacing fallback; two concurrent calls now perform exactly one final move and preserve the first final bytes. Different immutable references remain independent.
2. **Temp-only automatic sweep.** Startup reviewed-media maintenance now selects only exact app-owned `.tmp` grammar entries. It never automatically deletes a final `.agcm`, even when no sanitized draft snapshot appears to reference it. This removes the stale/corrupt-row snapshot deletion race. Corrupt receipt JSON still degrades to a text-only fail-closed list item, but its raw referenced final is retained. Explicit draft deletion remains the only final-file deletion path: it reads the raw `reviewed_media_ref` column first, deletes the DB row, then best-effort deletes only that exact validated anchored reference.
3. **Startup plaintext cleanup.** Native startup enumerates direct children of `Paths.cache` before attempting to open the draft database and best-effort deletes only exact `animalhelper-canonical-<stable>.jpg` and `animalhelper-reviewed-<stable>.jpg` files. It does this even if SecureStore/SQLCipher is temporarily unavailable. Nested, traversal-shaped, unrelated, attacker-root, gallery/content, and document paths never become deletion targets. After an app restart, no in-memory review operation exists, so every grammar-valid processor cache is stale; committed ciphertext and durable receipt are sufficient for metadata-only recovery.
4. **Conservative artifact availability.** Verification now returns `absent`, `valid`, `corrupt`, or `retryable_unavailable`. Structural envelope/length failure, authenticated plaintext length/hash mismatch, and narrowly recognized AES-GCM authentication failures are corrupt. SecureStore unavailable/locked, unknown native decrypt/runtime errors, file metadata/read errors, and hash-runtime errors remain retryable. Recovery leaves `local_persisting` unchanged for retryable availability and can validate/finalize on a later startup. It never promotes that state to `upload_pending`, `needs_user`, `complete`, or `quarantined` while native capability is unavailable.
5. **Bounded envelope and complete receipt AAD.** Canonical plaintext is capped at 20 MiB in both draft receipt policy and native persistence. The versioned envelope accepts exactly the 12-byte nonce plus plaintext-length ciphertext plus 16-byte tag, with an 8-byte outer header. Native verification checks `File.size` for the exact receipt-derived size and maximum before reading the file, rechecks the bytes read, then parses/decrypts. The parser rejects short, oversized, truncated, or trailing payloads. `confirmedAtLocal` is now included with every other receipt field in AAD.
6. **Transport boundary.** `nextUploadAttempt` accepts only transport states (`upload_pending`, `uploading`, or `waiting`). A `local_persisting` job fails closed to bounded `invalid_upload_attempt`, including when handed `complete` or `quarantined`; local durability cannot transition through the upload state machine.

### Installed native capability inspection

- Expo Crypto 57 Android wraps AES decrypt failures in a generic `DecryptionFailed` `CodedException`, including underlying runtime errors, so the classifier does not treat that code alone as proof of tampering. It recognizes only the paired, definitive GCM tag/MAC failure messages. Unknown Android failures remain retryable.
- Expo Crypto 57 iOS calls `AES.GCM.open`; the explicit CryptoKit `authenticationFailure` signature is treated as definitive authentication failure. Other unknown native errors remain retryable.
- Expo SecureStore exposes several coded/native keychain/keystore failures but no stable cross-platform “temporarily locked” discriminator for this non-authenticated key read. All key-load/import failures therefore remain retryable rather than risking permanent data loss.
- Expo FileSystem 57 exposes nullable `File.size`; absent is distinguished from metadata unavailable, and whole-file reads occur only after a finite integer exact-size check.

No dependency or lockfile change was required, and no registry/network retry was used.

### GREEN and final verification

Focused Fix round 3 suites:

```text
pnpm --filter @animalhelper/mobile test -- draft-media.coordinator.test.ts media-reference.test.ts draft-media.native.test.ts reviewed-media-envelope.test.ts reviewed-draft.test.ts processor-cache-sweep.test.ts media-recovery.native.test.ts upload-job.test.ts draft-policy.test.ts draft-store.native.test.ts --runInBand
Test Suites: 10 passed, 10 total
Tests:       87 passed, 87 total
```

Fresh full verification:

```text
pnpm --filter @animalhelper/mobile test
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
pnpm install --frozen-lockfile --offline
git diff --check
```

Observed results:

```text
Test Suites: 22 passed, 22 total
Tests:       132 passed, 132 total
tsc --noEmit: exit 0
expo export --platform web: exit 0 (14 static routes, including /report/redaction-review)
frozen offline install: exit 0, already up to date
git diff --check: exit 0 (Windows LF-to-CRLF advisories only)
```

### Self-review and remaining concerns

- Confirmed reviewed-media persistence contains no `overwrite: true`, final automatic deletion, arbitrary absolute-path resolution, or raw/source/canonical URI persistence.
- Confirmed the per-reference commit lock is module-level and wraps both the existence check and move. Its guarantee is intentionally limited to the app's current single JS runtime; this task enables no headless/background/multi-runtime writer. A future background writer would require a native exclusive-create/transaction primitive before it may share these files.
- Confirmed raw DB deletion reads the exact reference independent of receipt JSON deserialization, while startup maintenance never uses sanitized row absence to delete finals.
- Confirmed processor cache cleanup is anchored to direct `Paths.cache` children and occurs before database access, including after a prior committed-file/final-DB-update crash.
- Confirmed unknown crypto/SecureStore failures cannot permanently mark a journal corrupt, while structural, hash, and definitive authentication failures remain fail closed.

Final ciphertext orphan accumulation is now an accepted safety tradeoff: automatic final deletion is disabled until a future transactional maintenance design can prove against raw durable rows and concurrent updates. Representative iOS and Android development builds remain the release gate for actual Expo move behavior, File metadata, CryptoKit/JCA error surfaces, SecureStore lock/unlock recovery, SQLCipher restart handling, and the full HEIC/orientation/mask/encrypt lifecycle.
