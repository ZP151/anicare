# WhiskerCommons Safe Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fail-closed Sprint 2–3 capture and moderation foundation plus model-free Sprint 4–5 AI contracts.

**Architecture:** Mobile code prepares reviewed media locally and uploads only receipt-bound bytes into private staging. Narrow database functions own public projection, reporting, blocking and audited moderation; the admin console uses the acting user's session. AI remains an assistive, versioned contract behind explicit release gates.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, Supabase/PostgreSQL/Storage/Edge Functions, Next.js 16 App Router, Python 3.12–3.13, FastAPI/Pydantic, Jest/Vitest/unittest/pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-27-safe-capture-design.md`

## Global Constraints

- Product display name is `WhiskerCommons`; keep existing package scopes, Python import path, OAuth scheme, bundle IDs, database identifiers and offline key names unchanged.
- Public clients never receive exact coordinates, exact timestamps, reporter/uploader IDs, storage paths, vectors or internal AI scores.
- Offline drafts never persist coordinates, access tokens or raw selected-image URIs.
- Selected source image bytes are never uploaded; only a newly rendered JPEG tied to a valid review receipt can enter private staging.
- Client attestation never directly publishes media; public promotion remains disabled until trusted residual checks ship.
- AI output is tentative and cannot confirm an animal identity.
- Every behavior change follows red-green-refactor and every task receives spec/quality review.
- Do not use real user images, model weights, production credentials or service-role keys in mobile/admin code.

---

### Task 1: Brand and fail-closed media domain

**Files:**
- Create: `apps/mobile/src/media/contracts.ts`
- Create: `apps/mobile/src/media/review-policy.ts`
- Create: `apps/mobile/src/media/review-policy.test.ts`
- Modify: `apps/mobile/src/offline/draft-policy.ts`
- Modify: `apps/mobile/src/offline/draft-policy.test.ts`
- Modify: `apps/mobile/src/i18n/catalog.ts`
- Modify: `apps/mobile/src/i18n/catalog.test.ts`
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/app/(tabs)/report.tsx`
- Modify: `README.md`, `docs/product-charter.md`, `apps/admin/src/app/layout.tsx`, `apps/admin/src/app/page.tsx`, `services/ai/src/animalhelper_ai/api.py`

**Interfaces:**
- Produces `MediaReviewState`, `NormalizedRect`, `PrivacyMask`, `RenderedMedia`, `ReviewReceipt`, `reduceMediaReview(state, event)` and `canStageMedia(state)`.
- `ReviewReceipt` fields are `sanitizedSha256`, `recipeVersion`, `detectorVersions`, `width`, `height`, `byteLength`, `confirmedAtLocal`.
- The report uses its stable `draftId` as `clientDedupeKey`; it does not generate a new UUID per retry.

- [ ] **Step 1: Write failing policy and draft tests**

```ts
expect(canStageMedia(readyState)).toBe(false);
expect(canStageMedia(reduceMediaReview(readyState, { type: 'confirm' }))).toBe(true);
expect(reduceMediaReview(reviewedState, { type: 'masks_changed', masks })).toMatchObject({ status: 'needs_review', receipt: null });
expect(sanitizeDraftForStorage({ id: 'd1', rawSourceUri: 'file:///raw.jpg', latitude: 1, accessToken: 'x' })).not.toHaveProperty('rawSourceUri');
```

- [ ] **Step 2: Run focused tests and observe missing-contract failures**

Run: `pnpm --filter @animalhelper/mobile test -- review-policy.test.ts draft-policy.test.ts catalog.test.ts`

- [ ] **Step 3: Implement minimal immutable contracts/reducer and stable dedupe use**

```ts
export function canStageMedia(state: MediaReviewState): boolean {
  return state.status === 'reviewed' && state.receipt?.sanitizedSha256 === state.rendered?.sha256;
}
```

- [ ] **Step 4: Apply user-facing WhiskerCommons branding only**

Set Expo display `name` and both `app.name` messages to `WhiskerCommons`; preserve slug, scheme, package and bundle identifiers.

- [ ] **Step 5: Run mobile test/typecheck/build and commit**

Run: `pnpm --filter @animalhelper/mobile test && pnpm --filter @animalhelper/mobile typecheck && pnpm --filter @animalhelper/mobile build`

Commit: `feat(mobile): add fail-closed media review domain`

### Task 2: Canonical render, manual masks and secure retry state

**Files:**
- Create: `apps/mobile/src/media/processor.ts`
- Create: `apps/mobile/src/media/processor.native.ts`
- Create: `apps/mobile/src/media/processor.web.ts`
- Create: `apps/mobile/src/media/processor.test.ts`
- Create: `apps/mobile/src/media/draft-media.native.ts`
- Create: `apps/mobile/src/media/draft-media.web.ts`
- Create: `apps/mobile/src/offline/upload-job.ts`
- Create: `apps/mobile/src/offline/upload-job.test.ts`
- Create: `apps/mobile/app/report/redaction-review.tsx`
- Modify: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/report.tsx`, `apps/mobile/src/offline/draft-store.native.ts`, `apps/mobile/package.json`, `apps/mobile/app.json`

**Interfaces:**
- Consumes Task 1 media contracts.
- Produces `prepareCanonical(uri)`, `renderOpaqueMasks(input)`, `inspectRendered(uri)`, `nextUploadAttempt(job, result, now, random)`.
- Canonical recipe is `jpeg-srgb-2048-q88.v1`; longest edge is 2048, no upscaling, JPEG quality is 0.88.
- Retryable outcomes are network, 408, 429 and 5xx; 400/403/hash/metadata/version failures become `needs_user`.

- [ ] **Step 1: Write failing processor and retry tests using dependency injection**

```ts
expect(await prepareCanonical('file:///raw.heic', fakeAdapter)).toMatchObject({ mimeType: 'image/jpeg', recipeVersion: 'jpeg-srgb-2048-q88.v1' });
expect(nextUploadAttempt(job, { kind: 'http', status: 429 }, now, () => 0.5).state).toBe('waiting');
expect(nextUploadAttempt(job, { kind: 'hash_mismatch' }, now, () => 0.5).state).toBe('needs_user');
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- processor.test.ts upload-job.test.ts`

- [ ] **Step 3: Install Expo-aligned dependencies and implement adapters**

Run: `pnpm --filter @animalhelper/mobile exec expo install expo-image-manipulator expo-file-system @shopify/react-native-skia`

The native adapter decodes/re-encodes selected input, burns user masks as opaque blocks, snapshots final pixels, writes new JPEG bytes and returns SHA-256/size/dimensions. The web adapter throws `secure_media_processing_unavailable` and exposes no staging path.

- [ ] **Step 4: Implement encrypted reviewed-media persistence and schema v2**

Store only an encrypted reviewed path, receipt, stable IDs, sighting ID and bounded retry state. Remove raw/canonical transient files best-effort after reviewed encryption succeeds.

- [ ] **Step 5: Implement modal review UI**

Automatic detector status is visibly `unavailable`; users can add opaque masks and confirm the exact rendered preview. Confirmation is invalidated by edits. The UI must not offer public upload.

- [ ] **Step 6: Run mobile tests/typecheck/build and commit**

Commit: `feat(mobile): add private reviewed media workflow`

### Task 3: Private media staging and idempotent finalization

**Files:**
- Create: `supabase/functions/_shared/jpeg-policy.ts`
- Create: `supabase/functions/_shared/jpeg-policy.test.ts`
- Create: `supabase/functions/reserve-media-upload/index.ts`
- Create: `supabase/functions/finalize-media-upload/index.ts`
- Create: `supabase/functions/cleanup-media-staging/index.ts`
- Create: `supabase/migrations/202608270001_safe_media_staging.sql`
- Create: `supabase/tests/002_media_upload_privacy.sql`
- Create: `apps/mobile/src/api/media.ts`
- Create: `apps/mobile/src/api/media.test.ts`

**Interfaces:**
- `inspectJpeg(bytes)` returns dimensions and rejects APP1, APP13, COM, truncation and non-JPEG magic.
- `reserve({sightingId, mediaId, sha256, byteLength, review})` returns private signed staging target and expiry.
- `finalize({sightingId, mediaId, sha256})` returns one `mediaAssetId` with `status: 'quarantined'`.

- [ ] **Step 1: Write failing JPEG and mobile mapping tests**

Use literal byte fixtures for minimal valid JPEG and APP1/APP13/COM/truncated variants. Assert the mobile API sends the reviewed SHA and never serializes coordinates, tokens or source URI.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @animalhelper/edge-functions test -- jpeg-policy.test.ts && pnpm --filter @animalhelper/mobile test -- media.test.ts`

- [ ] **Step 3: Implement pure JPEG inspection and staging schema**

Add private `media_upload_jobs`, private `media-staging` bucket, pipeline/detector/dimension/size fields, unique uploader/media idempotency, and revoke authenticated writes to `public-media` and `media_assets`.

- [ ] **Step 4: Implement reservation/finalization/cleanup functions**

Authenticate the caller, check sighting ownership, verify exact object bytes/hash/size/JPEG policy, write server review time, and remain quarantined. Never return storage paths from finalization.

- [ ] **Step 5: Add pgTAP role tests and commit**

Prove clients cannot write public media or forge review timestamps and duplicate finalize calls create one row.

Commit: `feat(media): add private staging and quarantine`

### Task 4: Narrow feed, reporting and blocking

**Files:**
- Create: `supabase/migrations/202608270002_safe_public_and_safety_rpcs.sql`
- Create: `supabase/tests/003_public_and_safety_rpcs.sql`
- Create: `apps/mobile/src/api/feed.ts`
- Create: `apps/mobile/src/api/feed.test.ts`
- Create: `apps/mobile/src/api/safety.ts`
- Create: `apps/mobile/src/api/safety.test.ts`
- Modify: `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/map.tsx`

**Interfaces:**
- `listPublicSightings({cursor?, limit?})` consumes only `list_public_sighting_feed` and returns the allow-listed projection.
- `reportContent({contentType, contentId, reasonCode, detail, requestId})`, `blockUser(blockedId, requestId)`, `unblockUser(blockedId, requestId)` derive actor/operational fields server-side.

- [ ] **Step 1: Write failing payload and projection tests**

Assert raw responses containing `visible_at`, `occurred_at`, `reporter_id`, `storage_path`, notes or traits are rejected rather than silently passed through.

- [ ] **Step 2: Verify RED and implement typed mobile wrappers**

Run: `pnpm --filter @animalhelper/mobile test -- feed.test.ts safety.test.ts`

- [ ] **Step 3: Implement security-definer RPCs and revoke raw public UGC access**

Clamp feed limit 1–50; filter delayed public sightings; accept only reason allow-list; derive risk/status/SLA/targets; write audit events; prohibit self-block.

- [ ] **Step 4: Add pgTAP impersonation tests and connect fail-closed UI**

Without credentials the existing synthetic demo is labelled demo and exposes no mutation controls. With credentials the feed uses only the narrow projection.

- [ ] **Step 5: Run mobile/edge tests and commit**

Commit: `feat(safety): add narrow feed report and block APIs`

### Task 5: Authenticated and audited operations console

**Files:**
- Create: `supabase/migrations/202608270003_moderation_actions.sql`
- Create: `supabase/tests/004_moderation_actions.sql`
- Create: `apps/admin/src/lib/supabase/server.ts`
- Create: `apps/admin/src/lib/admin-session.ts`
- Create: `apps/admin/src/lib/moderation-api.ts`
- Create: `apps/admin/src/lib/moderation-api.test.ts`
- Create: `apps/admin/src/app/actions/moderation.ts`
- Create: `apps/admin/src/app/login/page.tsx`
- Create: `apps/admin/src/app/auth/callback/route.ts`
- Modify: `apps/admin/src/app/page.tsx`, `apps/admin/package.json`, `.env.example`

**Interfaces:**
- Database functions: `admin_list_moderation_queue`, `admin_get_moderation_report`, `admin_resolve_moderation_report`.
- Resolution actions are exactly `hide_sighting`, `restore_sighting`, `no_action` with rationale length 10–2000.

- [ ] **Step 1: Read the relevant Next 16 local docs and write failing wrapper tests**

Test no-config, unauthenticated, unauthorised, valid queue mapping and invalid action/rationale. The production change caught is accidental service-key/broad-record use or unsafe mutation input.

- [ ] **Step 2: Verify RED and install `@supabase/supabase-js` plus `@supabase/ssr`**

- [ ] **Step 3: Implement cookie server client, session gate and narrow wrappers**

Use publishable/anon key only and `getUser()`. Return unavailable/unauthorised states without synthetic audited metrics.

- [ ] **Step 4: Implement atomic moderation schema/RPCs and pgTAP tests**

Lock reports, enforce active platform-admin role and reporter/author/target recusal, append `moderation_actions` and audit in the same transaction.

- [ ] **Step 5: Implement login/callback/actions/page and commit**

Run: `pnpm --filter @animalhelper/admin test && pnpm --filter @animalhelper/admin typecheck && pnpm --filter @animalhelper/admin build`

Commit: `feat(admin): connect authenticated audited moderation`

### Task 6: AI alpha contract freeze

**Files:**
- Create: `services/ai/src/animalhelper_ai/contracts.py`
- Create: `services/ai/src/animalhelper_ai/image_quality.py`
- Create: `services/ai/src/animalhelper_ai/embeddings.py`
- Create: `services/ai/src/animalhelper_ai/jobs.py`
- Create: `services/ai/tests/fixtures/open_set_cases.json`
- Create: `services/ai/tests/test_contracts.py`
- Create: `services/ai/tests/test_image_quality.py`
- Create: `services/ai/tests/test_embeddings.py`
- Create: `services/ai/tests/test_jobs.py`
- Create: `docs/ai-contracts.md`
- Modify: `services/ai/src/animalhelper_ai/api.py`, `services/ai/src/animalhelper_ai/handler.py`, `services/ai/tests/test_handler.py`, `services/ai/tests/test_evaluation.py`

**Interfaces:**
- Contract versions: `crop.v1`, `embedding.v1`, `identify.v1`, `identify-callback.v1`.
- `EmbeddingProvider.embed(request)` returns a finite normalized 384-dimensional vector with exact model/preprocessing versions.
- Callback states are `queued`, `running`, `succeeded`, `failed`, `cancelled`; idempotency key is `(jobId,eventId)` and stale attempts cannot replace newer terminal state.

- [ ] **Step 1: Write failing strict-schema, quality, embedding and callback tests**

Tests reject extra fields, invalid boxes, unconfirmed redaction, EXIF presence, non-finite/wrong-dimension vectors, mixed model versions, stale callback attempts and forbidden serialized fields.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @animalhelper/ai test`

- [ ] **Step 3: Implement minimal typed contracts and pure policies**

Do not add model inference, network callbacks, queue vendors, ANN or real data.

- [ ] **Step 4: Load synthetic fixtures through existing evaluation gates**

Keep thresholds Recall@3 `>= 0.85`, unknown rejection `>= 0.80`, likely false match on unknown `<= 0.05`.

- [ ] **Step 5: Run AI tests/lint/typecheck and commit**

Commit: `feat(ai): freeze alpha identity contracts`

### Task 7: Integration and release-gate verification

**Files:**
- Modify: `README.md`, `docs/iteration-plan.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: Update status truthfully**

Document private staging/manual review as implemented and list automatic detectors, public promotion, real credentials, native-device builds and model weights/data as disabled gates.

- [ ] **Step 2: Run complete verification**

Run: `pnpm install --frozen-lockfile && pnpm peers check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && git diff --check`

- [ ] **Step 3: Run database tests when Docker/Supabase CLI are available**

Run: `supabase start && supabase test db && supabase db lint --level warning`. If unavailable locally, CI remains mandatory and the branch cannot be labelled pilot-ready.

- [ ] **Step 4: Run mobile/admin browser regression and final whole-branch review**

Check Report review gate, fail-closed web behavior, Nearby projection fallback, admin unavailable/login/queue states and bilingual navigation.

- [ ] **Step 5: Commit documentation/CI and push the feature branch**

Commit: `chore: document safe capture release gates`
