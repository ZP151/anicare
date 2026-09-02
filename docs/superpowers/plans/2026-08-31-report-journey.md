# Whisker Commons Report Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, resumable Report journey with privacy-safe manual-area submission, durable receipts and an owner-only My Reports status surface.

**Architecture:** Extend the encrypted native draft with a strict versioned report payload, retain the existing text-first/media-recovery coordinator, and add two narrow server boundaries: a service-only manual H3-9 submission RPC and an authenticated owner-only My Reports projection. Replace the Report tab form with a hub and focused child routes; keep precise device coordinates invocation-only and keep all AI candidate/model details out of the mobile contract.

**Tech Stack:** Expo SDK 57, React Native 0.86, Expo Router, TypeScript 6, Expo SQLite/SecureStore, React Native Maps/Google Maps, Supabase Edge Functions with Deno/Zod, PostgreSQL/pgTAP, Jest/Vitest, Impeccable and Emil design-engineering guidance.

**Spec:** `docs/superpowers/specs/2026-08-31-report-journey-design.md`

## Global Constraints

- Work only in `codex/report-journey` at `C:/Users/15492/Develop/animalhelper/.worktrees/report-journey`.
- Follow strict RED → verify RED → GREEN → verify GREEN → refactor for every production behavior.
- Precise coordinates may exist only in the active device-location submission invocation. Never persist or route latitude/longitude, tokens, source media paths or exact locations.
- Manual selection is a broad Singapore map tap immediately coarsened to canonical H3 resolution 9. Persist and transmit only the H3 cell; the server accepts centers within latitude `1.10..1.50` and longitude `103.55..104.15`.
- Raw `sightings`, private media jobs, precise locations and identity records remain unavailable to ordinary clients. New SQL functions expose exact allow-listed projections only.
- Public AI UI, live inference, candidates, model metadata, confidence, training consent and automatic identity confirmation remain absent.
- New visible copy ships in English and Simplified Chinese. Touch targets are at least 44 pt iOS / 48 dp Android and state never depends on glass, colour or motion alone.
- Use Material Community Icons. iOS liquid glass is progressive enhancement only; Android and reduced-transparency fallbacks keep equivalent hierarchy and contrast.
- One implementation agent may write in the shared worktree at a time. Each task receives an independent spec-compliance review and code-quality review before the next write-heavy task.
- A Sol/Terra/Luna capacity or model usage-limit error is a routing failure. Retry a model at most once, then route Sol → Terra → Luna/parent without weakening TDD or review gates.

---

### Task 1: Versioned report draft and encrypted-store round trip

**Files:**
- Create: `apps/mobile/src/report/report-draft.ts`
- Create: `apps/mobile/src/report/report-draft.test.ts`
- Modify: `apps/mobile/src/offline/draft-policy.ts`
- Modify: `apps/mobile/src/offline/draft-policy.test.ts`
- Modify: `apps/mobile/src/offline/draft-store.native.ts`
- Modify: `apps/mobile/src/offline/draft-store.native.test.ts`
- Modify: `apps/mobile/src/offline/draft-store.d.ts`
- Modify: `apps/mobile/src/offline/draft-store.web.ts`

**Interfaces:**
- Consumes: existing `StoredDraft`, `saveOfflineDraft`, `listOfflineDrafts`, `getOfflineDraft`, reviewed-media fields and cleanup-aware `deleteOfflineDraft`.
- Produces:

```ts
export type ReportDraftStep = 'photo' | 'details' | 'safety' | 'area' | 'review';
export type ReportCondition = 'appears_well' | 'needs_attention' | 'urgent';
export type ReportDraftPayloadV1 = Readonly<{
  version: 1;
  step: ReportDraftStep;
  occurredAt: string;
  coat: readonly string[];
  markings: readonly string[];
  condition: ReportCondition | null;
  manualPublicCellId: string | null;
  updatedAt: string;
}>;
export function sanitizeReportDraftPayload(value: unknown): ReportDraftPayloadV1;
export function createReportDraftPayload(now: Date): ReportDraftPayloadV1;
export function reportDraftSummary(draft: StoredDraft): Readonly<{
  id: string; updatedAt: string; step: ReportDraftStep; title: string; hasReviewedMedia: boolean;
}> | null;
export function removeReviewedMediaFromDraft(draftId: string): Promise<void>;
```

- `StoredDraft` gains `report?: ReportDraftPayloadV1`; legacy drafts without it remain readable but do not masquerade as resumable wizard drafts.

- [ ] **Step 1: Write failing pure draft-contract tests**

Add literal fixtures proving that a valid V1 payload round-trips; coat/marking arrays are allow-listed, deduplicated and bounded to 8 values of at most 40 characters; invalid versions, dates, H3-like garbage and unknown fields fail; and latitude, longitude, access tokens and route/media paths never appear in the result.

```ts
expect(sanitizeReportDraftPayload({
  version: 1, step: 'details', occurredAt: '2026-08-31T10:00:00.000Z',
  coat: ['tabby', 'tabby'], markings: ['white-paws'], condition: 'appears_well',
  manualPublicCellId: null, updatedAt: '2026-08-31T10:01:00.000Z',
})).toEqual({
  version: 1, step: 'details', occurredAt: '2026-08-31T10:00:00.000Z',
  coat: ['tabby'], markings: ['white-paws'], condition: 'appears_well',
  manualPublicCellId: null, updatedAt: '2026-08-31T10:01:00.000Z',
});
expect(() => sanitizeReportDraftPayload({
  version: 1, step: 'area', occurredAt: '2026-08-31T10:00:00.000Z', coat: [], markings: [],
  condition: null, manualPublicCellId: null, updatedAt: '2026-08-31T10:01:00.000Z', latitude: 1.3,
})).toThrow('invalid_report_draft');
```

- [ ] **Step 2: Run the pure tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- report-draft.test.ts draft-policy.test.ts --runInBand`

Expected: FAIL because `report-draft.ts` and the V1 sanitizer do not exist.

- [ ] **Step 3: Implement the minimal pure model and draft sanitizer integration**

Implement exact-key validation, canonical ISO timestamps, immutable arrays and the fixed enums above. In `sanitizeDraftForStorage`, include `report` only after `sanitizeReportDraftPayload` succeeds; continue dropping legacy top-level coordinate/token fields and continue validating media independently.

- [ ] **Step 4: Run the pure tests and verify GREEN**

Run: `pnpm --filter @animalhelper/mobile test -- report-draft.test.ts draft-policy.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Write failing native schema and serialization tests**

Require a nullable `report_payload_json TEXT` column, include it in save/list/get SQL, prove JSON round trip through `deserializeDraftRows`, and prove SQL still contains none of `latitude`, `longitude`, `access_token`, `source_uri` or `canonical_uri`. Add a RED test for pre-submission photo removal: the row first durably moves the current encrypted reference into `pending_media_cleanup_ref`, clears the media envelope with a revision compare-and-swap, then removes the file and clears the pending reference; an interrupted file cleanup leaves the pending reference recoverable.

```ts
expect(REPORT_PAYLOAD_COLUMN).toEqual({ report_payload_json: 'TEXT' });
expect(DRAFT_SAVE_SQL).toContain('report_payload_json');
expect(deserializeDraftRows([{ ...baseDraftRow, report_payload_json: JSON.stringify(validPayload) }])[0]?.report)
  .toEqual(validPayload);
```

- [ ] **Step 6: Run native-store tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts --runInBand`

Expected: FAIL because the column and serialization do not exist.

- [ ] **Step 7: Implement the SQLite migration and round trip**

Add the column through the existing `ensureDraftTransportSchemaWithDependencies` path, serialize only sanitized V1 JSON, select it in list/get, and deserialize fail-closed: a malformed report payload omits the resumable report view but preserves cleanup-capable media metadata. Implement `removeReviewedMediaFromDraft` only for an unsubmitted draft in `local_persisting`, `upload_pending` or `needs_user`; reject a sighting-bound or claimed/finalized draft. Keep `draft-store.web.ts` explicitly unavailable for durable encrypted storage.

- [ ] **Step 8: Verify Task 1**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- report-draft.test.ts draft-policy.test.ts draft-store.native.test.ts --runInBand
pnpm --filter @animalhelper/mobile typecheck
git diff --check
```

Expected: all pass with no warnings introduced by changed files.

- [ ] **Step 9: Commit Task 1**

```powershell
git add apps/mobile/src/report/report-draft.ts apps/mobile/src/report/report-draft.test.ts apps/mobile/src/offline
git commit -m "feat(report): persist resumable draft state"
```

---

### Task 2: Manual coarse-area submission without precise-location storage

**Files:**
- Create: `supabase/migrations/202608310009_report_manual_area_submission.sql`
- Create: `supabase/tests/019_report_manual_area_submission.sql`
- Modify: `supabase/functions/_shared/sighting-submission.ts`
- Modify: `supabase/functions/_shared/sighting-submission.test.ts`
- Modify: `supabase/functions/_shared/sighting-policy.ts`
- Modify: `supabase/functions/_shared/sighting-policy.test.ts`
- Modify: `supabase/functions/create-sighting/index.ts`
- Modify: `apps/mobile/src/api/sightings.ts`
- Modify: `apps/mobile/src/api/sightings.test.ts`

**Interfaces:**
- Consumes: `create_sighting_with_location`, existing strict response, Edge bearer authentication, delay/risk policy and stable client dedupe key.
- Produces:

```ts
export type SightingLocationInput =
  | Readonly<{ kind: 'device_once'; latitude: number; longitude: number }>
  | Readonly<{ kind: 'manual_area'; publicCellId: string }>;
export type PreparedSightingRecord = Readonly<{
  publicCellId: string;
  timeBucket: 'overnight' | 'morning' | 'afternoon' | 'evening';
  visibility: 'public' | 'hidden';
  visibleAt: string | null;
}>;
export function prepareManualSightingRecord(input: {
  publicCellId: string; occurredAt: string; risk: SightingRisk;
}): PreparedSightingRecord;
```

- SQL function `public.create_sighting_in_public_cell(p_reporter_id uuid, p_occurred_at timestamptz, p_public_cell_id text, p_time_bucket text, p_risk public.risk_tier, p_visibility public.record_visibility, p_visible_at timestamptz, p_traits jsonb, p_notes text, p_client_dedupe_key text, p_request_id text) returns uuid`, executable by `service_role` only.

- [ ] **Step 1: Write failing Edge contract and policy tests**

Add exact-shape tests for precise creation, manual creation and recovery. Mixed modes, missing modes, invalid/resolution-not-9 H3 cells, out-of-Singapore cell centers and extra keys fail. A valid manual cell yields the same time bucket, risk visibility and delay as a precise submission.

```ts
expect(parseSightingSubmission({
  manualPublicCellId: '89652636d87ffff', occurredAt: '2026-08-31T08:00:00.000Z',
  risk: 'normal', traits: {}, notes: null, clientDedupeKey: 'draft-12345678',
})).toMatchObject({ manualPublicCellId: '89652636d87ffff' });
expect(() => parseSightingSubmission({ ...preciseCreation, manualPublicCellId: '89652636d87ffff' })).toThrow();
```

- [ ] **Step 2: Run Edge tests and verify RED**

Run: `pnpm --filter @animalhelper/edge-functions test -- sighting-submission.test.ts sighting-policy.test.ts`

Expected: FAIL because the manual schema/policy are absent.

- [ ] **Step 3: Implement strict manual parsing and policy**

Split creation into strict precise/manual Zod schemas. Use `isValidCell`, `getResolution` and `cellToLatLng` from `h3-js`; require resolution 9 and the fixed Singapore bounding rectangle. Reuse one delay/time-bucket function so manual and precise paths cannot drift.

- [ ] **Step 4: Run Edge tests and verify GREEN**

Run: `pnpm --filter @animalhelper/edge-functions test -- sighting-submission.test.ts sighting-policy.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing pgTAP behavior tests**

Prove adult/critical/idempotency/audit behavior, service-only execute grants, and that a manual creation produces exactly one sighting and zero `private.precise_locations` rows. A different actor reusing the dedupe key must not recover or overwrite the first actor's row.

```sql
select is(
  (select pg_catalog.count(*) from private.precise_locations where sighting_id = :'manual_sighting_id'),
  0::bigint,
  'manual-area creation stores no precise-location row'
);
select throws_ok(
  $$select public.create_sighting_in_public_cell(null, pg_catalog.now(), '89652636d87ffff', 'afternoon', 'normal', 'public', pg_catalog.now(), '{}'::jsonb, null, 'draft-12345678', 'request')$$,
  '42501', null,
  'ordinary callers cannot invoke the service-only function'
);
```

- [ ] **Step 6: Run the new pgTAP test and verify RED**

Run: `pnpm pilot-gate-2a`

Expected: FAIL because the migration/function is absent.

- [ ] **Step 7: Implement the manual-area database function and Edge branch**

Mirror the current transaction invariants but omit ciphertext/nonce and the precise-location insert. Fully qualify objects, set a restrictive search path, revoke execute from `public`, `anon`, `authenticated`, and grant only to `service_role`. In the Edge route, require the encryption key only for `device_once`; call the new RPC for `manual_area`; never log either coordinates or public cell IDs.

- [ ] **Step 8: Write failing mobile transport tests**

Prove `buildSightingPayload` emits exactly one location mode, converts `Date` to ISO, never emits visibility, and keeps the existing 64 KiB/redirect/origin/strict-response behavior.

- [ ] **Step 9: Run mobile transport tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- sightings.test.ts --runInBand`

Expected: FAIL because `SightingLocationInput` is not supported.

- [ ] **Step 10: Implement the mobile union payload and verify Task 2**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- sightings.test.ts --runInBand
pnpm --filter @animalhelper/edge-functions test
pnpm pilot-gate-2a
pnpm --filter @animalhelper/mobile typecheck
git diff --check
```

Expected: all pass.

- [ ] **Step 11: Commit Task 2**

```powershell
git add supabase/migrations/202608310009_report_manual_area_submission.sql supabase/tests/019_report_manual_area_submission.sql supabase/functions apps/mobile/src/api/sightings.ts apps/mobile/src/api/sightings.test.ts
git commit -m "feat(report): submit coarse manual areas safely"
```

---

### Task 3: Owner-only My Reports projection and strict mobile parser

**Files:**
- Create: `supabase/migrations/202608310010_my_reports_projection.sql`
- Create: `supabase/tests/020_my_reports_projection.sql`
- Create: `apps/mobile/src/api/my-reports.ts`
- Create: `apps/mobile/src/api/my-reports.test.ts`

**Interfaces:**
- Consumes: authenticated Supabase RPC client, `sightings.visibility`, `media_assets.deleted_at/status`, `private.media_upload_jobs.status`, `identity_proposals.status`, and `sightings.animal_id`.
- Produces:

```ts
export type MyReportSummary = Readonly<{
  sightingId: string;
  occurredAt: string;
  createdAt: string;
  reportState: 'private_review' | 'delayed' | 'published' | 'archived';
  mediaState: 'none' | 'pending' | 'quarantined' | 'cleanup_pending' | 'removed';
  identityState: 'not_requested' | 'pending_review' | 'linked' | 'closed';
}>;
export type MyReportsCursor = Readonly<{ createdAt: string; sightingId: string }>;
export type MyReportsPage = Readonly<{ items: readonly MyReportSummary[]; nextCursor: MyReportsCursor | null }>;
export function parseMyReports(value: unknown): MyReportsPage;
export function listMyReports(input?: { limit?: number; cursor?: MyReportsCursor | null }, client?: NarrowRpcClient): Promise<MyReportsPage>;
```

- [ ] **Step 1: Write failing pgTAP isolation and mapping tests**

Create two authenticated actors and synthetic rows covering every visibility, media and identity mapping. Prove each actor sees only owned rows; anonymous calls fail; ordering/keyset pagination is stable; limit clamps to 1–50; raw grants remain revoked; output has exactly the seven camelCase columns and none of notes, traits, risk, cell, reporter, proposal source/candidate/model/confidence/reasons.

Mapping precedence:

```text
report: hidden→private_review, limited→delayed, public→published, archived→archived
media: deleted asset→removed; deletion_pending job→cleanup_pending; live quarantined asset/finalized job→quarantined; reserved job→pending; otherwise none
identity: non-null animal_id→linked; any tentative proposal→pending_review; any rejected/superseded proposal→closed; otherwise not_requested
```

The migration also adds the query-supporting indexes `sightings_reporter_created_idx (reporter_id, created_at desc, id desc)`, `media_assets_sighting_status_idx (sighting_id, uploader_id, deleted_at)` and `identity_proposals_sighting_status_idx (sighting_id, status)` when they do not already exist.

- [ ] **Step 2: Run pgTAP and verify RED**

Run: `pnpm pilot-gate-2a`

Expected: FAIL because `list_my_sighting_summaries` is absent.

- [ ] **Step 3: Implement the security-definer projection**

Derive the actor with `auth.uid()`, reject null auth, clamp limit, use `(created_at, id)` descending keyset comparison, and aggregate media/identity state with bounded lateral subqueries. Fully qualify all objects, revoke public/anon execute and grant authenticated only. Return camelCase aliases exactly as declared in `MyReportSummary`.

- [ ] **Step 4: Run pgTAP and verify GREEN**

Run: `pnpm pilot-gate-2a`

Expected: PASS.

- [ ] **Step 5: Write failing mobile parser and RPC tests**

Use hand-written literal rows. Reject arrays over 50, encoded payloads over 64 KiB, invalid UUID/timestamps/enums, unexpected fields and forbidden sensitive fields. Prove cursor arguments use both timestamp and ID and that RPC errors become `my_reports_unavailable` without returning partial rows.

```ts
expect(parseMyReports([safeRow])).toEqual({
  items: [safeRow], nextCursor: { createdAt: safeRow.createdAt, sightingId: safeRow.sightingId },
});
expect(() => parseMyReports([{ ...safeRow, publicCellId: '89652636d87ffff' }]))
  .toThrow('invalid_my_reports_response');
```

- [ ] **Step 6: Run mobile API tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- my-reports.test.ts --runInBand`

Expected: FAIL because the module is absent.

- [ ] **Step 7: Implement the strict parser/RPC client and verify Task 3**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- my-reports.test.ts --runInBand
pnpm pilot-gate-2a
pnpm --filter @animalhelper/mobile typecheck
git diff --check
```

Expected: all pass.

- [ ] **Step 8: Commit Task 3**

```powershell
git add supabase/migrations/202608310010_my_reports_projection.sql supabase/tests/020_my_reports_projection.sql apps/mobile/src/api/my-reports.ts apps/mobile/src/api/my-reports.test.ts
git commit -m "feat(report): expose owner-only report status"
```

---

### Task 4: Report workflow controller and text-first recovery

**Files:**
- Create: `apps/mobile/src/report/report-flow.ts`
- Create: `apps/mobile/src/report/report-flow.test.ts`
- Modify: `apps/mobile/src/report/report-submission.ts`
- Modify: `apps/mobile/src/report/report-submission.test.ts`

**Interfaces:**
- Consumes: Task 1 `ReportDraftPayloadV1`, Task 2 `SightingLocationInput`, existing `submitReportWithMedia` dependencies and upload states.
- Produces:

```ts
export type ReportPrerequisiteIssue = 'details_required' | 'area_required' | 'review_required';
export function earliestIncompleteStep(draft: StoredDraft): ReportDraftStep;
export function validateReportForSubmission(draft: StoredDraft, location: SightingLocationInput | null): readonly ReportPrerequisiteIssue[];
export function reportTraits(payload: ReportDraftPayloadV1): Readonly<Record<string, unknown>>;
export type ReportTimelineItem = Readonly<{
  key: string;
  kind: 'committed' | 'recovery';
  sightingId: string | null;
  draftId: string | null;
  occurredAt: string;
  reportState: MyReportSummary['reportState'] | 'draft';
  mediaState: MyReportSummary['mediaState'] | 'needs_user';
  identityState: MyReportSummary['identityState'];
}>;
export function mergeReportRecovery(remote: readonly MyReportSummary[], local: readonly StoredDraft[]): readonly ReportTimelineItem[];
```

- `SubmitReportWithMediaInput` replaces `coordinates` with `location: SightingLocationInput | null` and supplies `traits` from the sanitized report payload.

- [ ] **Step 1: Write failing workflow tests**

Cover earliest-incomplete-step recovery, explicit saved Review reopening only when prerequisites remain valid, details/area validation, manual vs device location, trait mapping with literal expected JSON, remote-authoritative merge by sighting ID and local-only recovery rows without exposing encrypted references.

- [ ] **Step 2: Run workflow tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- report-flow.test.ts --runInBand`

Expected: FAIL because the controller is absent.

- [ ] **Step 3: Implement the pure controller and verify GREEN**

Run: `pnpm --filter @animalhelper/mobile test -- report-flow.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 4: Write failing submission recovery tests**

Prove both location modes reach `createSighting`, recovery still occurs before create, a missing location yields `recovery_miss` rather than invented coordinates, text-only success deletes ordinary drafts, media pending retains its bound draft and receipt status, and authentication/ownership conflicts preserve recovery state.

- [ ] **Step 5: Run submission tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- report-submission.test.ts --runInBand`

Expected: FAIL because submission still accepts only coordinates and empty traits.

- [ ] **Step 6: Implement the minimal location-union integration**

Keep `recoverOrCreateSighting` idempotent. Pass no device coordinates to any persistence dependency. Do not delete a media-bearing draft before the existing quarantine cleanup condition. Return receipt-capable outcome data for every committed text sighting, including media pending/waiting/needs-user states.

- [ ] **Step 7: Verify Task 4**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- report-flow.test.ts report-submission.test.ts sightings.test.ts --runInBand
pnpm --filter @animalhelper/mobile typecheck
git diff --check
```

Expected: all pass.

- [ ] **Step 8: Commit Task 4**

```powershell
git add apps/mobile/src/report/report-flow.ts apps/mobile/src/report/report-flow.test.ts apps/mobile/src/report/report-submission.ts apps/mobile/src/report/report-submission.test.ts
git commit -m "feat(report): orchestrate resumable submissions"
```

---

### Task 5: Report hub, draft actions and safe entry points

**Files:**
- Modify: `apps/mobile/app/(tabs)/report.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/src/report/ReportHub.tsx`
- Create: `apps/mobile/src/report/ReportHub.test.tsx`
- Create: `apps/mobile/src/report/report-copy.ts`
- Create: `apps/mobile/src/report/report-copy.test.ts`
- Modify: `apps/mobile/src/i18n/catalog.ts`
- Modify: `apps/mobile/src/i18n/catalog.test.ts`
- Modify: `apps/mobile/src/components/CatDetailScreen.tsx`
- Modify: `apps/mobile/src/components/CoarseAreaDetailSheet.tsx`
- Modify: corresponding component tests.

**Interfaces:**
- Consumes: Task 1 draft creation/summary/store APIs, Expo Router and authenticated Supabase session.
- Produces: `ReportHub` dependency-injected with `loadDrafts`, `saveDraft`, `deleteDraft`, `getSession`, `createId`, `now` and `navigate`; `getReportCopy(locale)` provides all new English/Chinese copy.

- [ ] **Step 1: Initialize Impeccable context before UI editing**

Run once from the worktree:

```powershell
node C:/Users/15492/.codex/skills/impeccable/scripts/context.mjs --target 'apps/mobile/app/(tabs)/report.tsx'
```

Read the installed Impeccable Operate/new-work guidance selected by the context output. Immediately before editing UI, read `C:/Users/15492/.codex/skills/impeccable/reference/craft-floor.md`. Apply the approved product/brand constraints; do not replace `apps/mobile/PRODUCT.md` or broaden the visual world.

- [ ] **Step 2: Write failing hub and bilingual-copy tests**

Cover loading, empty, multiple draft summaries ordered by updated time, native storage unavailable, signed-out My Reports explanation, start/continue/delete navigation, cleanup-aware delete error, and no hard-coded AI promise. Catalogue tests must prove identical key coverage for `en` and `zh-CN`.

- [ ] **Step 3: Run hub tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- ReportHub.test.tsx report-copy.test.ts catalog.test.ts --runInBand`

Expected: FAIL because hub/copy modules are absent and the tab is still a form.

- [ ] **Step 4: Implement the Report hub and route registration**

The tab renders only the compact hub. Starting creates and saves a V1 draft before navigating to `/report/new?draftId=<uuid>`. Continue uses an existing validated ID. Delete invokes the existing cleanup-aware path and reloads. My Reports navigates only for a session; signed-out users get a real Profile sign-in route. Register `report/new`, `report/receipt`, `report/my-reports` and retain modal `report/redaction-review`.

- [ ] **Step 5: Migrate cat/area report entry points**

Cat detail creates a draft then navigates to the wizard with the selected `animalId` context. Area detail creates a draft and opens the Area stage with manual selection required. Presentation-only `public-area-N` values must never be persisted or treated as H3 cells.

- [ ] **Step 6: Verify Task 5**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- ReportHub.test.tsx report-copy.test.ts catalog.test.ts CatDetailScreen.test.tsx CoarseAreaDetailSheet.test.tsx --runInBand
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
git diff --check
```

Expected: all pass and web export includes the new routes.

- [ ] **Step 7: Commit Task 5**

```powershell
git add apps/mobile/app apps/mobile/src/report apps/mobile/src/i18n apps/mobile/src/components
git commit -m "feat(report): add resumable report hub"
```

---

### Task 6: Five-stage wizard, private photo continuation and manual map area

**Files:**
- Create: `apps/mobile/app/report/new.tsx`
- Create: `apps/mobile/src/report/ReportWizard.tsx`
- Create: `apps/mobile/src/report/ReportWizard.test.tsx`
- Create: `apps/mobile/src/report/ReportAreaPicker.native.tsx`
- Create: `apps/mobile/src/report/ReportAreaPicker.native.test.tsx`
- Create: `apps/mobile/src/report/ReportAreaPicker.web.tsx`
- Modify: `apps/mobile/app/report/redaction-review.tsx`
- Modify: `apps/mobile/src/report/report-copy.ts`
- Modify: `apps/mobile/src/i18n/catalog.ts`

**Interfaces:**
- Consumes: Tasks 1/2/4 draft/location/submission APIs, Google-backed `react-native-maps`, `@animalhelper/domain` H3-9 coarsening, Expo Location and private redaction route.
- Produces: a dependency-injected `ReportWizard` whose device coordinates live only in component memory/ref for the active attempt; `ReportAreaPicker` returns only `{ publicCellId: string }` to its parent.

- [ ] **Step 1: Write failing wizard behavior tests**

Cover validated draft loading, earliest incomplete stage, save on stage transition/background, replace/remove/skip photo, return from redaction by the same draft ID, details/condition, safety consequences, edit links, save-and-exit, submission blocking and disabled reasons. Assert route calls contain only opaque IDs.

- [ ] **Step 2: Write failing manual-area and coordinate-lifecycle tests**

Mock the native map boundary, not the report controller. Prove a map tap is immediately coarsened and only the H3-9 cell reaches `onSelect`; denied permission offers manual selection without prompting again; device coordinates are cleared after success, error, cancel and unmount; web visibly disables device/manual map capture with a truthful development-only reason.

```ts
expect(onSelect).toHaveBeenCalledWith({ publicCellId: '89652636d87ffff' });
expect(saveDraft).not.toHaveBeenCalledWith(expect.objectContaining({ latitude: expect.anything() }));
expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining('latitude'));
```

- [ ] **Step 3: Run wizard tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- ReportWizard.test.tsx ReportAreaPicker.native.test.tsx --runInBand`

Expected: FAIL because the components/routes are absent.

- [ ] **Step 4: Implement the minimal wizard and area picker**

Use five stages: Photo, Details, Safety, Area, Review. Persist only the sanitized V1 payload/notes/risk/media envelope. Native manual mode opens a broad Singapore Google map, coarsens the tap immediately and discards the tap coordinate. Device mode requests once, holds coordinates only for submit, and clears them through a single finally/unmount-safe helper. Photo removal uses cleanup-aware draft/media deletion or replacement semantics; it must not orphan the encrypted reference.

- [ ] **Step 5: Integrate submission and receipt navigation**

Recover by dedupe key before create. On any committed text sighting, navigate to `/report/receipt?sightingId=<uuid>` and never pass status text, media paths, notes or location through route params. Preserve the draft when media needs retry/user action; reset only after durable cleanup rules allow it.

- [ ] **Step 6: Verify Task 6**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- ReportWizard.test.tsx ReportAreaPicker.native.test.tsx redaction-review.test.tsx report-submission.test.ts --runInBand
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
git diff --check
```

Expected: all pass.

- [ ] **Step 7: Commit Task 6**

```powershell
git add apps/mobile/app/report apps/mobile/src/report apps/mobile/src/i18n
git commit -m "feat(report): build private reporting wizard"
```

---

### Task 7: Durable receipt and My Reports status surface

**Files:**
- Create: `apps/mobile/app/report/receipt.tsx`
- Create: `apps/mobile/app/report/my-reports.tsx`
- Create: `apps/mobile/src/report/ReportReceipt.tsx`
- Create: `apps/mobile/src/report/ReportReceipt.test.tsx`
- Create: `apps/mobile/src/report/MyReportsScreen.tsx`
- Create: `apps/mobile/src/report/MyReportsScreen.test.tsx`
- Modify: `apps/mobile/src/report/report-flow.ts`
- Modify: `apps/mobile/src/report/report-flow.test.ts`
- Modify: `apps/mobile/src/report/report-copy.ts`
- Modify: `apps/mobile/src/i18n/catalog.ts`

**Interfaces:**
- Consumes: Task 3 `listMyReports`, Task 4 remote/local merge, existing draft upload/recovery states and a validated `sightingId` route parameter.
- Produces: receipt and list components with dependency-injected loading/navigation/session methods and no direct raw-table access.

- [ ] **Step 1: Write failing receipt tests**

Cover submitted text-only/private/delayed states, pending/quarantined/needs-user media, invalid/missing sighting ID, and actions to My Reports, Report hub and Nearby. Prove quarantine is never labelled public and no exact/public cell, note, trait, candidate or path appears.

- [ ] **Step 2: Write failing My Reports screen tests**

Cover initial loading, empty, success, keyset load-more, pull-to-refresh, expired auth to Profile, malformed response, offline with an already-loaded snapshot retained and labelled, offline without snapshot, and local recovery merged by sighting ID. Rows expose only date and coarse report/media/identity labels.

- [ ] **Step 3: Run receipt/list tests and verify RED**

Run: `pnpm --filter @animalhelper/mobile test -- ReportReceipt.test.tsx MyReportsScreen.test.tsx report-flow.test.ts --runInBand`

Expected: FAIL because routes/components are absent.

- [ ] **Step 4: Implement receipt and My Reports**

Receipt resolves the authoritative remote item when available and merges local media recovery; if offline, it renders only durable local state and says remote status is unavailable. My Reports retains only its in-memory last successful snapshot during refresh failure; it does not introduce unencrypted cross-launch caching. Identity labels are lifecycle-only with no action to start AI.

- [ ] **Step 5: Verify Task 7**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- ReportReceipt.test.tsx MyReportsScreen.test.tsx report-flow.test.ts my-reports.test.ts --runInBand
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Commit Task 7**

```powershell
git add apps/mobile/app/report apps/mobile/src/report apps/mobile/src/i18n
git commit -m "feat(report): add receipts and report history"
```

---

### Task 8: Design hardening, privacy audit and integration gate

**Files:**
- Modify only findings-backed files under `apps/mobile/app/report`, `apps/mobile/src/report`, `apps/mobile/src/design`, `apps/mobile/src/i18n` and their tests.
- Modify: `docs/iteration-plan.md`
- Create: `docs/reviews/2026-08-31-report-journey-review.md`

**Interfaces:**
- Consumes: completed Tasks 1–7 and all project gates.
- Produces: recorded Impeccable/Emil/accessibility/privacy evidence and a release-ready Report slice with no open high-severity finding.

- [ ] **Step 1: Run a bounded Impeccable harden/adapt review**

Load `C:/Users/15492/.codex/skills/impeccable/reference/harden.md`, `adapt.native.md` and `craft-floor.md`. Inspect one representative phone state for hub, each wizard stage, receipt and My Reports; batch findings before editing. Check human hierarchy, copy density, repeated cards/headings, touch targets, large text, screen-reader order, empty/error/offline/auth states, reduced transparency and reduced motion.

- [ ] **Step 2: Record failing behavior tests for every code-backed finding**

For each accepted defect, first add a focused test that fails because of the observable issue: missing label/role, unreachable action, wrong fallback, state-only colour, broken large-text structure or leaked sensitive copy. Do not add tests for subjective pixels or prose documents.

- [ ] **Step 3: Apply one bounded UI correction pass**

Use fewer containers, compact task headings, contextual safety copy, accessible Material Community Icons and subtle press feedback. Animate only stage direction/state feedback, keep movement under 300 ms, use no bounce, and respect reduced motion. Do not add a new dependency or broaden the approved visual system.

- [ ] **Step 4: Run targeted UI confirmation**

Run the changed Report tests, typecheck and web build. Confirm with at most one additional visual pass; stop polishing after the bounded confirmation required by Impeccable.

- [ ] **Step 5: Run privacy and forbidden-surface scans**

Run:

```powershell
rg -n "latitude|longitude|accessToken|storage_path|candidate|confidence|embedding|training" apps/mobile/src/report apps/mobile/app/report
rg -n "publicCellId" apps/mobile/src/api/my-reports.ts apps/mobile/src/report/MyReportsScreen.tsx apps/mobile/src/report/ReportReceipt.tsx
```

Review every match. Legitimate invocation-only location code and manual H3 transport may remain; persisted drafts, routes, receipts and My Reports must contain no forbidden data.

- [ ] **Step 6: Run the full local verification matrix**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- --runInBand
pnpm --filter @animalhelper/edge-functions test
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
pnpm test:pilot-gate-2a-ci
pnpm pilot-gate-2a
pnpm verify
.\.venv\Scripts\python.exe -m ruff check services/ai
.\.venv\Scripts\python.exe -m mypy services/ai/src
git diff --check
```

`pnpm pilot-gate-2a` is the mandatory local Supabase Gate 2A command used by `.github/workflows/ci.yml`; it starts the pinned local stack, applies every migration, runs every pgTAP file, lints the database and exercises Edge handlers with fresh synthetic inputs. Expected: all migrations, pgTAP tests, mobile/Edge/domain/admin/AI tests, typechecks and builds pass.

- [ ] **Step 7: Update evidence documents**

In `docs/iteration-plan.md`, mark only the completed Report completion/recovery/My Reports slice; leave Following, Profile/privacy, Hosted Gate 2B, native-device media checks and public AI gates open. In the review record, include exact commands/results, Impeccable findings/fixes, remaining native/hosted gates and an explicit statement that public AI remains disabled.

- [ ] **Step 8: Commit Task 8**

```powershell
git add apps/mobile docs/iteration-plan.md docs/reviews/2026-08-31-report-journey-review.md
git commit -m "docs(report): record journey release gates"
```

- [ ] **Step 9: Independent final reviews**

Request one spec-compliance review against `docs/superpowers/specs/2026-08-31-report-journey-design.md` and one code/security review against the complete branch diff. Sol is preferred only for the final high-risk privacy review; route immediately to Terra if Sol is unavailable. Resolve every high/medium finding through a new failing test and rerun the affected plus full gates.

- [ ] **Step 10: Push and update Draft PR #2**

Push `codex/report-journey`, update PR #2 from specification-only to the complete implementation summary, keep it draft until exact-head CI passes, then request user integration approval. Do not merge automatically without that approval.
