# WhiskerCommons Reviewed Media Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the authenticated mobile path from sighting creation and an immutable encrypted reviewed-media artifact through private reservation, signed upload and idempotent finalization, with crash-safe recovery and no plaintext persistence.

**Architecture:** Sighting creation becomes recoverable by stable draft dedupe even when its response is lost. Native media reads use the existing AHM1 envelope and an existing-key-only, scoped decrypt callback that clears plaintext. A strict transport client validates every Edge response and reconstructs a canonical signed PUT from trusted configuration. SQLite CAS/lease transitions serialize UI, auth and foreground runners across crashes; local ciphertext is removed only after `quarantined` is durably recorded.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript 6, Expo Crypto/FileSystem/SecureStore/SQLite, Supabase/PostgreSQL/Storage/Edge Functions, Jest/Vitest/pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-27-safe-capture-design.md`

## Global Constraints

- Product display name remains `WhiskerCommons`; package scopes, OAuth scheme, bundle IDs, database identifiers and local encryption-key names remain unchanged.
- Explicit user re-review may replace the media identity/receipt tuple only before sighting attachment and before the first upload claim, through the narrow journal CAS plus durable old-reference cleanup outbox. Once owner+sighting is attached or any upload attempt exists, `(draftId, mediaId, sightingId, receipt.sanitizedSha256, receipt)` is immutable and retries never generate replacement identities.
- Selected source bytes, raw/canonical URIs, coordinates, access tokens, signed URLs, signed-upload tokens and Storage paths are never persisted in offline drafts.
- Only an AHM1 artifact whose envelope, AES-GCM AAD, encryption version, byte length and SHA-256 match the stored receipt may cross the upload boundary.
- Read paths load an existing media key only. They never generate or persist a replacement key; a missing key fails closed without modifying SecureStore.
- In JS, decrypted JPEG data is limited to one controlled full-span `Uint8Array` at a time. Scoped cleanup overwrites it on success and every exception; zero-copy behavior below the React Native/native bridge is not claimed.
- Signed capability validation requires an explicitly trusted Supabase origin, exact `media-staging/jobs/<jobId>.jpg` path, one matching token query, no userinfo/hash/extra query, and a usable time window.
- Storage PUT is reconstructed from trusted base/path/token and uses a controlled `fetch` with `redirect: 'error'`, no bearer/apikey headers, `x-upsert: false`, JPEG content type and no cache. Production never fetches the response-provided URL.
- Server/client errors persist only bounded allow-listed codes. Bodies, URLs, paths, tokens and plaintext never enter logs, SQLite, React state or telemetry.
- Attempts are claimed and incremented before network effects. SQLite revision/lease CAS prevents stale or concurrent runners from moving state backward.
- Crash/retry must converge to one sighting, one active upload job and at most one quarantined media row.
- `quarantined` is the only current mobile success. Public promotion and automatic residual detection remain disabled.
- Web stays fail-closed: no artifact decrypt, signed PUT or background upload is available in Expo web.
- Every behavior change follows red-green-refactor; every task receives independent spec and quality review.

---

### Task 1: Recoverable idempotent sighting creation

**Files:**
- Create: `supabase/migrations/202608270007_sighting_submission_recovery.sql`
- Create: `supabase/tests/009_sighting_submission_recovery.sql`
- Create: `supabase/functions/_shared/sighting-submission.test.ts`
- Create: `supabase/functions/_shared/sighting-submission.ts`
- Modify: `supabase/functions/create-sighting/index.ts`
- Modify: `apps/mobile/src/api/sightings.ts`
- Modify: `apps/mobile/src/api/sightings.test.ts`

**Interfaces:**
- `create_sighting_with_location(...) returns uuid` keeps its signature but uses `INSERT ... ON CONFLICT (reporter_id, client_dedupe_key) DO NOTHING`; only the winning insert writes precise location and audit, while a retry returns the existing sighting ID.
- `create-sighting` accepts either the existing exact create body or `{ clientDedupeKey: string, recoverExisting: true }`.
- Recovery authenticates the actor, returns only their matching sighting and never accepts coordinates or creates a row.
- Mobile produces `submitSighting(...)` and `recoverSightingSubmission(...)`, both returning the exact shape `{ sightingId, visibility, visibleAt, requestId }` after a 64 KiB bounded parse.

- [ ] **Step 1: Write failing pgTAP and Edge helper tests**

Prove two identical RPC calls return the same UUID with exactly one `sightings`, `precise_locations` and create-audit row. Prove recovery cannot return another actor's dedupe key and a recovery miss creates nothing. Edge helper tests reject mixed create/recover fields and map stored visibility rather than caller-provided retry data.

```sql
select is(
  (select count(*) from public.sightings
   where reporter_id = '00000000-0000-4000-8000-000000000911'
     and client_dedupe_key = 'draft-12345678'),
  1::bigint,
  'stable dedupe creates exactly one sighting'
);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @animalhelper/edge-functions test -- sighting-submission.test.ts`

Expected: FAIL because the shared recovery contract does not exist. pgTAP remains a runtime gate if Supabase/Docker is unavailable, but its plan/assertion count must be statically checked.

- [ ] **Step 3: Implement database idempotency without duplicate side effects**

Replace the function in the new migration. If the insert wins, write precise location and audit in the same transaction; if it conflicts, select the caller-owned existing ID and perform no location/audit write. A conflicting payload cannot mutate the existing sighting.

- [ ] **Step 4: Implement exact Edge create/recovery modes**

Use bounded JSON reading, strict bearer parsing and exact schemas. After create/retry, read the stored row by `(id, reporter_id)` and build the response from server state. Recovery miss returns `sighting_submission_not_found` without revealing other actors' rows.

- [ ] **Step 5: Harden the mobile response boundary**

Replace direct `response.json()` and unvalidated return with bounded text parsing, exact keys/types and canonical timestamps. `recoverSightingSubmission` sends no coordinates and treats not-found as a typed recoverable outcome rather than a new sighting.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @animalhelper/edge-functions test && pnpm --filter @animalhelper/mobile test -- sightings.test.ts && pnpm --filter @animalhelper/mobile typecheck && pnpm --filter @animalhelper/mobile build`

Commit: `fix(sightings): recover committed submissions idempotently`

### Task 2: Versioned existing-key-only scoped artifact access

**Files:**
- Modify: `apps/mobile/src/media/draft-media.native.ts`
- Modify: `apps/mobile/src/media/draft-media.native.test.ts`
- Modify: `apps/mobile/src/media/draft-media.d.ts`
- Modify: `apps/mobile/src/media/draft-media.web.ts`
- Modify: `apps/mobile/src/media/reviewed-draft.ts`
- Modify: `apps/mobile/src/media/reviewed-draft.test.ts`
- Modify: `apps/mobile/src/offline/draft-policy.ts`
- Modify: `apps/mobile/src/offline/draft-policy.test.ts`
- Modify: `apps/mobile/src/offline/draft-store.native.ts`
- Modify: `apps/mobile/src/offline/draft-store.native.test.ts`
- Modify: `apps/mobile/src/offline/draft-store.d.ts`
- Modify: `apps/mobile/app/report/redaction-review.tsx`
- Modify: `apps/mobile/src/api/media.ts`

**Interfaces:**
- Adds `encryptionVersion: 'aes-256-gcm.v1'` to `ReviewedMediaJournal` and media-bearing `StoredDraft`; SQLite adds `encryption_version TEXT` and backfills existing AHM1 reviewed references to v1 before enforcing sanitizer use.
- Splits `loadExistingReviewedMediaKey()` from `getOrCreateReviewedMediaKeyForWrite()`; artifact verification/decrypt uses only the first.
- Replaces the raw reader with `ReviewedArtifactReader.withDecryptedReviewedJpeg<T>(input, consume): Promise<T>`.
- Native scoped artifact is `{ bytes: Uint8Array; sha256: string; byteLength: number }`; bytes are full-span, valid only during `consume`, and overwritten in `finally`.
- Web throws `secure_media_processing_unavailable` before invoking `consume`.
- Produces `saveReviewedMediaJournal(journal, state, error)` that changes only media columns and returns the previous valid encrypted reference for post-commit cleanup when media is replaced.

- [ ] **Step 1: Write failing key/version/scoped-reader tests**

Name these breaks: read-time key creation; unknown/missing encryption version; AAD/hash/length mismatch; plaintext not cleared after `consume` returns or throws; non-full-span decrypt views leaving extra backing bytes; `verifyReviewedMedia` leaving plaintext; and a media journal update overwriting notes/risk.

```ts
await expect(withDecryptedReviewedJpegWithDependencies(input, async (artifact) => {
  observed = artifact.bytes;
  return artifact.sha256;
}, dependencies)).resolves.toBe(receipt.sanitizedSha256);
expect([...observed!]).toEqual(new Array(receipt.byteLength).fill(0));
expect(dependencies.generateKey).not.toHaveBeenCalled();
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- draft-media.native.test.ts reviewed-draft.test.ts draft-policy.test.ts draft-store.native.test.ts`

- [ ] **Step 3: Implement safe key split and one decrypt primitive**

The writer may create a key only when no reviewed artifact exists. The reader returns `local_media_key_missing` without SecureStore writes. One internal decrypt primitive authenticates AHM1/AAD, version, size and SHA, then feeds both `verifyReviewedMedia` and the scoped reader. Remove whole-image `slice()` hashing copies; normalize a sliced decrypt view into one exact buffer, clear the discarded view, and clear the returned buffer after use.

- [ ] **Step 4: Persist version and narrow media journal updates**

Add the column/backfill and exact sanitizer checks. `ReviewedMediaJournal` always carries v1. `saveReviewedMediaJournal` preserves notes, risk and sighting ID, updates the complete media snapshot atomically, and exposes an old owned reference only after the new snapshot commits. Update the redaction screen to use this narrow operation.

- [ ] **Step 5: Cover replacement and corrupt-version behavior**

Replacing `mediaId` deletes the prior owned ciphertext only after the new reference is durable. Unknown versions become explicit `needs_user/version_mismatch`; they never fall back to v1 or text-only.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @animalhelper/mobile test -- draft-media.native.test.ts reviewed-draft.test.ts draft-policy.test.ts draft-store.native.test.ts redaction-review.test.tsx && pnpm --filter @animalhelper/mobile typecheck && pnpm --filter @animalhelper/mobile build`

Commit: `feat(mobile): scope authenticated reviewed artifact access`

### Task 3: Strict authenticated reserve, signed PUT and finalize client

**Files:**
- Modify: `apps/mobile/src/api/media.ts`
- Modify: `apps/mobile/src/api/media.test.ts`
- Create: `apps/mobile/src/api/media-transport.ts`
- Create: `apps/mobile/src/api/media-transport.test.ts`

**Interfaces:**
- Produces `reserveMediaUpload(input, dependencies)`, `putReservedMedia(input, dependencies)` and `finalizeMediaUpload(input, dependencies)`.
- Produces `parseMediaFinalizationResponse(value): { mediaAssetId: string; status: 'quarantined' }`.
- `parseMediaReservationResponse(value, { expectedMediaId, supabaseUrl, now, insecureOrigins })` verifies response identity and capability.
- `ValidatedUploadCapability` contains only `{ jobId, path: 'jobs/<jobId>.jpg', token, usableUntil }`; the response URL is discarded after validation.
- `MediaTransportFailure` contains only `{ stage: 'reserve' | 'upload' | 'finalize'; kind: 'network' | 'http' | 'invalid_response'; status: number | null; code: allow-listed string }`.
- Edge JSON responses are bounded to 64 KiB; signed PUT response bodies are never retained.

- [ ] **Step 1: Write failing API/capability tests**

Test exact reserve/finalize bodies and Authorization headers. Reject redirects, oversized/malformed/extra response fields, response media-ID mismatch, expired/near-expiry credentials, foreign origin, userinfo, fragment, wrong bucket/job ID, duplicate/mismatched token, extra query and encoded traversal. HTTP is accepted only when its exact origin appears in the injected local-development allowlist.

- [ ] **Step 2: Write failing controlled PUT and secret-containment tests**

Assert PUT reconstructs the URL from trusted `supabaseUrl + canonical path + token`, uses `redirect: 'error'`, `x-upsert: false`, JPEG content type, no cache and no Authorization/apikey header. It receives the scoped artifact's exact backing `ArrayBuffer`, never Blob/FormData/base64/string. Serialized errors must not contain access token, signed token, response URL, path or body.

- [ ] **Step 3: Verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- media.test.ts media-transport.test.ts`

- [ ] **Step 4: Implement bounded Edge calls and exact parsers**

Parse the configured base as an origin-only URL. Construct Edge endpoints locally, set `redirect: 'error'`, and classify non-2xx by status plus an allow-listed error code. Reservation/finalization always pass through the existing strict request builders.

- [ ] **Step 5: Validate then reconstruct signed PUT**

Validate the response signed URL byte-for-byte against the expected trusted origin/path/query. Reconstruct a fresh URL from trusted base, canonical path and the validated token; PUT the exact artifact buffer with the strict headers above. Do not use the configured Supabase client's default fetch because it may attach session headers and follow redirects.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @animalhelper/mobile test -- media.test.ts media-transport.test.ts && pnpm --filter @animalhelper/mobile typecheck && pnpm --filter @animalhelper/mobile build`

Commit: `feat(mobile): add strict private media transport client`

### Task 4: SQLite CAS and crash-safe upload coordinator

**Files:**
- Modify: `apps/mobile/src/offline/upload-job.ts`
- Modify: `apps/mobile/src/offline/upload-job.test.ts`
- Modify: `apps/mobile/src/offline/draft-policy.ts`
- Modify: `apps/mobile/src/offline/draft-policy.test.ts`
- Modify: `apps/mobile/src/offline/draft-store.native.ts`
- Modify: `apps/mobile/src/offline/draft-store.native.test.ts`
- Modify: `apps/mobile/src/offline/draft-store.d.ts`
- Create: `apps/mobile/src/media/media-upload-coordinator.ts`
- Create: `apps/mobile/src/media/media-upload-coordinator.test.ts`

**Interfaces:**
- Adds `finalizing` to `UploadJobState` and `resumeState: 'uploading' | 'finalizing' | null`.
- SQLite adds `upload_resume_state`, `upload_attempt_started_at` and `revision INTEGER NOT NULL DEFAULT 0`.
- Produces `getOfflineDraft(id)`, `claimMediaUploadAttempt(id, now, leaseMs)` and `transitionClaimedMediaUpload(id, expectedRevision, next)`; a claim increments attempts before network and returns its new revision.
- A fresh lease prevents another runner from claiming; an expired lease may be reclaimed and increments revision, so stale transitions fail CAS.
- Deserialization returns explicit `mediaFailure: 'local_media_corrupt' | 'version_mismatch'` for a media-bearing corrupt row; it never disguises it as text-only.
- Produces `runMediaUploadAttempt(claim, dependencies)` and per-draft in-process single-flight as a second, not sole, concurrency barrier.

- [ ] **Step 1: Write failing state/schema/CAS tests**

Test: `waiting` requires a valid resume phase; attempts increment before effects; attempt five cannot claim; whole retry snapshots replace resume/start fields; two claimers yield one winner; fresh lease blocks; expired lease advances revision; stale revision cannot move `finalizing`/`quarantined` backward; corrupt media rows remain explicit failures.

- [ ] **Step 2: Write failing fault-injection coordinator tests**

Cover every sequence:

1. `upload_pending → claim/uploading → PUT success → persist finalizing → finalize → persist quarantined`.
2. Reserve commits but response is lost: retry same immutable IDs returns the same active job.
3. PUT succeeds but response is lost: resumed uploading probes finalize before any second PUT and converges if present.
4. Finalize commits but response is lost: resumed finalizing retries finalize without decrypting first.
5. Reservation expired after PUT: finalizing probes, renews reserve, probes again and finalizes without PUT.
6. Cleanup deleted the object: finalizing probes, renews, probes, then performs an authenticated reread/PUT/finalize.
7. The pinned local Storage replay contract is non-upsert PUT HTTP 400 plus finalize success converges. Client recovery intentionally treats only exact `upload`/`http`/`storage_upload_failed` failures with status in `{400, 409}` as possibly committed; the compatibility 409 case plus fresh-reservation finalize 409 becomes `needs_user` and does not remint forever.
8. Network/408/429/5xx becomes bounded waiting with the current resume phase; every crash after a claim consumes an attempt.
9. Artifact/key/version/hash failure makes no network call and becomes explicit `needs_user`.
10. Quarantined persisted before ciphertext cleanup: crashes at quarantine, file delete and row cleanup never retransmit.

- [ ] **Step 3: Verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- upload-job.test.ts draft-policy.test.ts draft-store.native.test.ts media-upload-coordinator.test.ts`

- [ ] **Step 4: Implement phase-aware policy and CAS storage**

Split attempt start from outcome handling: claim performs the increment and lease; `nextUploadOutcome` never increments. Add narrow SQL updates with `WHERE revision = ?` and valid source states. Media-bearing corrupt rows preserve enough owned-reference information for explicit reselection/deletion cleanup.

- [ ] **Step 5: Implement finalize-first recovery with safe fallback**

New upload attempts reserve then PUT. Reclaimed `uploading` and all `finalizing` attempts probe finalize first. A conflict renews reservation and probes again; only a still-missing object triggers scoped reread and PUT. After successful PUT, persist `finalizing` before finalization. Persist `quarantined` before deleting ciphertext. Never interpret reserve or PUT success as terminal.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter @animalhelper/mobile test -- upload-job.test.ts draft-policy.test.ts draft-store.native.test.ts media-upload-coordinator.test.ts && pnpm --filter @animalhelper/mobile typecheck && pnpm --filter @animalhelper/mobile build`

Commit: `feat(mobile): persist recoverable media upload claims`

### Task 5: Report submission and auth/foreground recovery wiring

**Files:**
- Create: `apps/mobile/src/media/media-upload-runtime.native.ts`
- Create: `apps/mobile/src/media/media-upload-runtime.web.ts`
- Create: `apps/mobile/src/media/media-upload-runtime.d.ts`
- Create: `apps/mobile/src/media/media-upload-runtime.test.ts`
- Create: `apps/mobile/src/media/MediaUploadRecovery.tsx`
- Create: `apps/mobile/src/media/MediaUploadRecovery.test.tsx`
- Create: `apps/mobile/src/report/report-submission.ts`
- Create: `apps/mobile/src/report/report-submission.test.ts`
- Modify: `apps/mobile/app/(tabs)/report.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `README.md`
- Modify: `docs/iteration-plan.md`

**Interfaces:**
- Native produces `uploadDraftMediaNow(draftId)` and `retryRecoverableMediaDrafts()`; absent backend/session is a no-op and consumes no attempt.
- `submitReportWithMedia(input, dependencies)` first tries dedupe recovery, creates only when coordinates are present and no prior sighting exists, persists `sightingId`, then runs media transport.
- Text-only success deletes its draft. Media drafts are deleted only after durable quarantine and ciphertext cleanup; waiting/needs-user/corrupt media never masquerades as text-only.
- `MediaUploadRecovery` runs local journal recovery before transport and reacts to initial session availability, auth change and foreground. Event callbacks schedule work outside the Supabase auth callback and delegate concurrency to Task 4 CAS.

- [ ] **Step 1: Write failing report lifecycle tests**

Prove current notes/risk are saved before opening redaction review; lost create response recovers the same sighting by `draftId`; stored `sightingId` avoids coordinates on retry; text-only deletes; media quarantine deletes only after terminal persistence; waiting/needs-user/corrupt rows remain visible and recoverable.

- [ ] **Step 2: Write failing runtime/recovery tests**

Test no config/session without attempt consumption, due/lease filtering, sequential bounded batch processing, auth/foreground trigger coalescing, stale runner CAS rejection and web fail-closed behavior.

- [ ] **Step 3: Verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- report-submission.test.ts media-upload-runtime.test.ts MediaUploadRecovery.test.tsx redaction-review.test.tsx`

- [ ] **Step 4: Implement trusted runtime and report orchestration**

Runtime gets the current access token only at call time, builds trusted dependencies and never stores it. The report screen persists notes/risk before navigation, recovers/creates the sighting with stable `draftId`, attaches `sightingId` through a narrow update and runs transport. Show separate messages for quarantine, scheduled retry, key/artifact corruption and recapture-required recovery miss.

- [ ] **Step 5: Add lifecycle recovery**

Mount `MediaUploadRecovery` in `_layout.tsx`. Local AHM1 journal recovery runs first. Auth/foreground events enqueue one bounded recovery run; no background location, background fetch or token persistence is introduced.

- [ ] **Step 6: Update truthful release documentation**

Mark authenticated artifact access and transport/retry wiring implemented. Keep real Supabase migration/pgTAP, Deno/Storage redirect behavior, signed capability/expiry/cleanup races, iOS/Android memory/lifecycle and residual detector/public-promotion validation as release gates. Do not call the app pilot-ready.

- [ ] **Step 7: Verify and commit**

Run: `pnpm --filter @animalhelper/mobile test && pnpm --filter @animalhelper/mobile typecheck && pnpm --filter @animalhelper/mobile build && pnpm --filter @animalhelper/edge-functions test`

Commit: `feat(mobile): connect recoverable private media upload`

## Final verification and review

- [ ] Run `pnpm install --frozen-lockfile && pnpm peers check`.
- [ ] Run `python -m ruff check services/ai && python -m mypy services/ai/src`.
- [ ] Validate UUID literals in every pgTAP file; run real migrations/pgTAP if Supabase/Docker becomes available, otherwise retain the explicit release gate.
- [ ] Run `pnpm exec turbo run lint typecheck test build --force` and require 0 cached tasks.
- [ ] Run `git diff --check`; confirm the worktree is clean.
- [ ] Dispatch a whole-range plan/integration reviewer and a separate security/privacy reviewer. Fix all Critical/Important findings and triage Minors.
- [ ] Push only `feature/whisker-commons-safe-capture` with a normal push; never modify or force-push `main`.
