# Whisker Commons Report Journey Design

## Purpose

This design turns the existing Report foundation into the first complete
contributor journey in Sprint 3A: start or resume a privacy-safe report, submit
text even when media recovery fails, receive a durable receipt, and later see a
bounded status in My Reports. It is the first of three sequential product
slices: Report, then Following, then Profile/account/privacy center.

The work is architectural because it changes the on-device draft model, mobile
navigation, submission contract and owner-only server projection together. It
does not reopen the AI or administration control-plane roadmap.

## Fixed product decisions

1. Report is a resumable task, not a long form. The sequence is photo, traits
   and condition, safety sensitivity, location, final review, submission and
   receipt.
2. A photo is optional. Selecting one always enters the existing private manual
   redaction flow. Replace, retake, remove and skip are first-class actions.
3. Precise coordinates are captured only for the active submission invocation.
   They are never written to the offline draft, route parameters, logs or
   analytics.
4. A user who declines or cannot grant location permission can select an
   approved coarse community area. A manual-area submission stores no precise
   location row.
5. A media error cannot discard the text sighting. The user may retry media,
   replace it, remove it and submit text-only.
6. My Reports is backed by a narrow owner-only projection. A local-only list is
   insufficient because it cannot show moderation or cross-device state.
7. Public AI UI, candidate lists, live inference, training consent and automatic
   identity confirmation remain disabled. My Reports may show only a coarse
   identity lifecycle label derived from authoritative records.
8. Per-report deletion is not introduced in this slice. My Reports may show
   existing media cleanup state and links to the future Profile privacy center,
   but it must not render a decorative or non-functional delete button.

## User journeys

### Report hub

The Report tab becomes a compact task hub rather than the form itself. It has:

- a primary **Start a report** action;
- a **Continue drafts** section ordered by most recently updated;
- a **My Reports** entry for authenticated contributors;
- an authentication/eligibility explanation when contribution is unavailable;
- explicit loading, empty, offline and local-storage-unavailable states.

The hub creates a stable draft UUID before navigating to the wizard. Returning
from a child route reloads the draft from durable storage rather than trusting
stale component state.

### Resumable wizard

The wizard has five reviewable stages before submission:

1. **Photo:** optional source selection, private review status and actions to
   review, replace, remove or skip. Only the encrypted reviewed copy can persist.
2. **Cat details:** bounded coat/marking traits, observed condition and optional
   notes. The UI uses selectable, accessible rows rather than a free-form wall
   of controls; notes remain available for observations not covered by traits.
3. **Safety:** normal, sensitive or critical with short contextual consequences.
   Critical reports remain private by server policy.
4. **Area:** use device location once or select an approved coarse area. Device
   coordinates remain in memory only until submit finishes or the screen loses
   the active attempt. Manual area IDs may be saved because they are already
   public, coarse identifiers.
5. **Review:** concise summary, edit links for every stage, privacy statement,
   save-and-exit and submit.

Back navigation changes the current stage without losing saved fields. App
backgrounding saves non-precise changes. A resumed draft opens at the earliest
incomplete stage, except a saved explicit review stage may reopen at Review when
all prerequisites still validate.

### Completion and My Reports

A successful text submission always navigates to a receipt screen, including
when reviewed media remains pending. The receipt shows the stable sighting ID,
submission time, visibility explanation, media state and clear next actions:
view My Reports, report another cat or return to Nearby. It never implies that
quarantined media is public.

My Reports uses server results as authority for committed sightings and merges
them with on-device recovery state by sighting ID. It displays newest first and
supports refresh, initial loading, empty, offline-with-last-result, expired
authentication and malformed-response failure states. Rows show only date,
coarse lifecycle labels and whether identity is linked; they do not echo notes,
traits, exact coordinates, public cell IDs, reporter IDs, internal review
reasons, candidate animals or similarity data.

## Mobile architecture

### Routes

- `app/(tabs)/report.tsx`: Report hub.
- `app/report/new.tsx`: resumable wizard, addressed by a validated `draftId`.
- `app/report/redaction-review.tsx`: existing private review route, retained and
  returned to the same draft.
- `app/report/receipt.tsx`: committed receipt addressed by a validated
  `sightingId`.
- `app/report/my-reports.tsx`: owner-only committed report list.

Route parameters contain stable opaque IDs only. They never contain notes,
traits, coordinates, access tokens or media paths.

### Local draft model

`StoredDraft` gains a versioned, sanitized report payload:

```ts
type ReportDraftStep = 'photo' | 'details' | 'safety' | 'area' | 'review';
type ReportCondition = 'appears_well' | 'needs_attention' | 'urgent';

type ReportDraftPayloadV1 = Readonly<{
  version: 1;
  step: ReportDraftStep;
  occurredAt: string;
  coat: readonly string[];
  markings: readonly string[];
  condition: ReportCondition | null;
  manualPublicCellId: string | null;
  updatedAt: string;
}>;
```

The existing `notes`, `risk`, reviewed-media envelope, sighting binding, owner
binding and upload state remain canonical. Sanitization allow-lists values,
deduplicates arrays, enforces bounded counts and lengths, rejects invalid dates
and drops unknown fields. It never accepts latitude or longitude. Native SQLite
stores the payload as validated JSON; web remains an explicit non-durable
development fallback and must not claim encrypted persistence.

Draft-list presentation is derived by a pure function from `StoredDraft`; it
does not expose encrypted references, receipts or ownership internals to UI
components. Draft deletion continues to use the existing cleanup-aware delete
path so encrypted reviewed media is not orphaned.

### Submission orchestration

The existing `submitReportWithMedia` remains the authority for dedupe,
owner-binding, sighting recovery, text-first success and media continuation. A
new wizard controller validates prerequisites and supplies one of two mutually
exclusive location inputs:

```ts
type ReportLocationInput =
  | Readonly<{ kind: 'device_once'; latitude: number; longitude: number }>
  | Readonly<{ kind: 'manual_area'; publicCellId: string }>;
```

The controller persists the non-precise draft before any network call. It
clears device coordinates on completion, error, explicit cancellation and
unmount. A missing location input blocks submission with an actionable message;
it does not silently invent a coordinate.

Text-only success deletes an ordinary draft. A draft with reviewed media stays
until the upload reaches the existing safe cleanup condition. The receipt data
is derived from the committed response and durable recovery state, not from
optimistic UI text.

## Server contracts

### Manual coarse-area submission

The authenticated `create-sighting` Edge route accepts exactly one of:

- `latitude` plus `longitude`; or
- `manualPublicCellId`.

Mixed or missing modes are invalid. The manual ID must be a canonical public
H3 cell at the product's approved public resolution. The database function for
manual-area creation derives the actor from the trusted Edge call, applies the
same adult, risk, visibility, delay, idempotency and audit rules as precise
submission, and does not insert into `private.precise_locations`.

The response remains the existing strict `SightingSubmissionResponse`; no
location value is returned.

### Owner-only My Reports projection

Add `list_my_sighting_summaries(p_limit, p_before_created_at,
p_before_sighting_id)` as a `security definer` database function with an empty,
explicit `pg_catalog` search path. It derives the actor from `auth.uid()`, clamps
the page size to 1–50 and keyset-pages by `(created_at, id)`.

Each row contains only:

```ts
type MyReportSummary = Readonly<{
  sightingId: string;
  occurredAt: string;
  createdAt: string;
  reportState: 'private_review' | 'delayed' | 'published' | 'archived';
  mediaState: 'none' | 'pending' | 'quarantined' | 'cleanup_pending' | 'removed';
  identityState: 'not_requested' | 'pending_review' | 'linked' | 'closed';
}>;
```

`reportState` is a coarse mapping of authoritative sighting visibility.
`mediaState` is a coarse aggregate of owned media/upload deletion records.
`identityState` returns `linked` when the sighting has an animal, otherwise only
whether an eligible proposal is absent, pending or closed. It never returns
proposal source, candidate ID, model metadata, confidence or reasons.

The function returns no rows when ownership does not match and cannot be called
by anonymous users. Raw table grants remain revoked. Its SQL and mobile parser
both reject output-shape drift; the client applies a 64 KiB response ceiling and
strict timestamp/UUID/enumeration validation.

## Visual and interaction direction

This is an **Operate** surface. Routine tasks use compact hierarchy, useful
content density and one clear primary action instead of repeated oversized
headings and nested rounded cards. Material Community Icons remain the single
icon family. Safety copy appears at the decision it affects rather than as a
permanent engineering disclaimer.

iOS liquid glass is limited to navigation and the wizard's persistent action
bar when supported. Android and reduced-transparency modes use an opaque
high-contrast fallback with identical layout and semantics. Press feedback is
subtle and immediate. Stage transitions may use short opacity/transform motion
only when they explain direction, respect reduced motion and remain
interruptible; routine list refresh and keyboard actions do not animate.

All controls have at least 44 pt iOS / 48 dp Android targets, meaningful roles
and labels, visible disabled reasons and large-text reflow. Colour, glass and
motion never carry state alone. English and Simplified Chinese catalogue entries
ship together for all new product copy.

## Error and recovery policy

- **No backend configuration:** preserve the draft and state that nothing was
  transmitted.
- **Authentication expired:** preserve the draft, route the user to Profile to
  sign in and resume by the same draft ID.
- **Location denied/unavailable:** offer manual coarse-area selection; never
  loop the permission prompt.
- **Offline:** save locally; My Reports shows a bounded cached snapshot only if
  one exists and labels it as offline.
- **Media needs user action:** keep the text report submittable and provide
  retry, replace, remove and text-only actions.
- **Ambiguous network result:** recover by the stable client dedupe key before
  attempting creation.
- **Malformed server response:** fail closed, preserve local state and render no
  partially parsed row.
- **Draft ownership mismatch:** do not render or upload the draft; require the
  owning account or cleanup through the existing guarded path.

## Testing strategy

Implementation follows strict red-green-refactor cycles. Tests assert behavior,
not source text or mock existence.

- Pure unit tests cover draft payload sanitization, step recovery, prerequisite
  validation, location-mode exclusivity, status mapping and merge of remote
  summaries with local recovery state.
- Native draft-store tests cover schema migration, round-trip persistence,
  unknown-field rejection, no-coordinate storage and cleanup-aware deletion.
- Route/component tests cover hub loading/empty/drafts, wizard resume and back,
  permission denial to manual area, text-only submission after media failure,
  receipt actions, My Reports success/offline/auth/malformed states and large
  accessibility labels.
- Edge tests cover precise/manual mutual exclusion, canonical H3 validation,
  unchanged strict response shape and recovery idempotency.
- pgTAP tests prove actor isolation, anonymous denial, pagination stability,
  absence of forbidden columns, no precise-location row for manual submissions,
  coarse status mapping and raw-table revocation.
- The slice finishes with mobile typecheck/tests/build, Edge tests, database
  Gate 2A, root `pnpm verify`, Impeccable harden/adapt review and a bounded visual
  check of supported phone-width states.

## Non-goals

- Following, Profile/account/privacy-center implementation.
- Per-report deletion, appeal adjudication or push notifications.
- Public media promotion or automatic detector claims.
- AI request, candidate selection, model training or automatic identity linking.
- Exact public pins, routes to cats, location-bearing notifications or draft
  synchronization across devices.
- Production analytics, gamification, payments or donation mechanics.

## Acceptance gates

1. A contributor can start, save, exit, resume, delete and submit a report
   without losing non-precise state.
2. Precise coordinates cannot appear in persisted drafts, route parameters,
   My Reports responses or logs.
3. Permission denial has a functional manual coarse-area path that creates no
   precise-location database row.
4. Media failure never blocks or discards a valid text-only sighting.
5. Every successful text submission reaches a durable receipt and appears in
   My Reports for the same actor only.
6. My Reports contains no raw notes, traits, locations, reporter data, internal
   moderation evidence, identity candidates or AI scores.
7. Public AI controls remain absent and dormant AI/control-plane tests stay
   green.
8. All new copy exists in English and Simplified Chinese; accessibility,
   reduced-motion and reduced-transparency fallbacks pass the documented checks.
9. No visible action is decorative or dead-ended, and the full repository
   verification and database gates pass before integration.
