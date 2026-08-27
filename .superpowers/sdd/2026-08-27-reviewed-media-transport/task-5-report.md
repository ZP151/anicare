# Task 5 — Report submission and auth/foreground recovery wiring

## Status

Implemented the native report/media orchestration, runtime composition and
lifecycle recovery wiring on `feature/whisker-commons-safe-capture`. No media
path claims public availability: only a durable `quarantined` terminal state is
success, and it remains private.

## TDD evidence

### RED

```text
pnpm --filter @animalhelper/mobile test -- report-submission.test.ts media-upload-runtime.test.ts MediaUploadRecovery.test.tsx redaction-review.test.tsx
FAIL: report-submission, media-upload-runtime and MediaUploadRecovery modules did not exist; redaction-review passed (5/5).

pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts
FAIL: the new narrow sighting-attach and quarantined-cleanup exports were missing; 31 pre-existing tests passed.

pnpm --filter @animalhelper/mobile test -- media-upload-runtime.test.ts
FAIL: a durable quarantined row was incorrectly sent to claim instead of ordered cleanup.

pnpm --filter @animalhelper/mobile test -- report-submission.test.ts
FAIL: an already attached sighting invented a `hidden` visibility claim.

pnpm --filter @animalhelper/mobile test -- media-upload-runtime.test.ts
FAIL: a lost CAS claim was reported as `not_ready` rather than the durable queued state.
```

### GREEN

```text
pnpm --filter @animalhelper/mobile test -- report-submission.test.ts media-upload-runtime.test.ts MediaUploadRecovery.test.tsx redaction-review.test.tsx draft-store.native.test.ts
PASS: 5 suites, 56 tests.

pnpm --filter @animalhelper/mobile test
PASS: 32 suites, 306 tests.

pnpm --filter @animalhelper/mobile typecheck
PASS: tsc --noEmit.

pnpm --filter @animalhelper/mobile test
PASS: 32 suites, 374 tests.

pnpm --filter @animalhelper/edge-functions test
PASS: 6 files, 48 tests.

pnpm --filter @animalhelper/mobile build
PASS: Expo web export completed.

pnpm --filter @animalhelper/mobile build
PASS: Expo web export completed.

pnpm --filter @animalhelper/edge-functions test
PASS: 6 files, 48 tests.

pnpm install --frozen-lockfile; pnpm peers check
PASS: lockfile already current; no peer dependency issues.
```

## Implementation and invariants

- The report screen durably saves current notes/risk before opening redaction
  review. Submission saves the same coordinate-free draft before remote work.
- Submission first recovers by the stable draft ID, creates only after a
  recovery miss and only while coordinates are present in memory, then uses a
  narrow immutable SQLite update to attach the sighting ID before any media
  claim. Retries with that ID neither send nor persist coordinates.
- Text-only drafts delete only after successful sighting submission. Anything
  media-bearing, unresolved or corrupt is retained. Reserve/PUT/finalizing are
  not success; the UI reports queued/uploading/finalizing/waiting/needs-user
  states without saying the media is public.
- Task 4 persists `quarantined` before cleanup. The native runtime resumes an
  interrupted terminal cleanup only in order: durable quarantine → ciphertext
  deletion → revision/state-guarded SQLite row deletion. A cleanup conflict is
  an error, never silent success.
- The native runtime reads the access token only at use time, retains no token,
  capability, URL, path or plaintext, filters retry candidates by Task 4 due
  and lease rules, and runs a sequential batch of at most four. Expo web exports
  fail-closed no-op transport functions and imports no native reader/PUT path.
- `MediaUploadRecovery` repairs the local AHM1 journal before transport; startup,
  signed-in auth changes and foreground events only enqueue one controller run.
  It has one listener pair and removes timers/listeners on unmount. Signed-out
  states do not run media transport.

## Files changed

- `apps/mobile/src/report/report-submission.ts` and tests
- `apps/mobile/src/media/media-upload-runtime.*` and tests
- `apps/mobile/src/media/MediaUploadRecovery.tsx` and tests
- `apps/mobile/app/(tabs)/report.tsx`, `apps/mobile/app/_layout.tsx`
- Native/web/d.ts draft-store adapters and native storage tests for narrow
  sighting attachment and terminal cleanup
- `README.md`, `docs/iteration-plan.md`

## Self-review

- Traced durable data flow: report save → dedupe recovery/create → append-only
  sighting ID → Task 4 claim/transport → durable quarantine → ciphertext then
  row cleanup.
- Confirmed coordinates, access tokens, signed capabilities, URLs, paths and
  plaintext are not passed to durable draft writes or React state.
- Confirmed the web runtime contains no decryption, reserve, PUT or background
  execution path, and checked lifecycle listener/timer disposal.
- `git diff --check` was run after the implementation; no whitespace errors.

## Remaining concerns and release gates

- `supabase`, Docker and Deno are unavailable locally, so real migrations,
  pgTAP and Deno/Storage signed-upload/redirect execution were not run. UUID
  literal scan found 368 UUID literals across pgTAP files, but that does not
  replace a real runtime.
- Real signed-capability expiry, redirect and cleanup-race validation; supported
  iOS/Android memory and lifecycle testing; and residual detection/public media
  promotion all remain release gates. Public promotion remains disabled.
- `python -m ruff check services/ai` and `python -m mypy services/ai/src` are
  blocked because this Python 3.14 environment has neither `ruff` nor `mypy`.
- `pnpm exec turbo run lint typecheck test build --force` was uncached but
  blocked in the unrelated AI test task because Python dependencies `fastapi`
  and `pydantic` are absent. Mobile, Edge, domain and TypeScript checks above
  were run directly; this task does not install or alter the AI environment.

## Fix round — review findings

### RED

```text
pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts report-submission.test.ts
FAIL: 1 failed / 43 passed. A raw native row with a valid sighting_id but no
media tuple or upload-workflow fields deserialized as local_media_corrupt /
needs_user rather than a text-only attached draft.

pnpm --filter @animalhelper/mobile test -- report-submission.test.ts media-upload-runtime.test.ts
FAIL: 2 failed / 16 passed. The pre-persistence error and report status
formatters did not exist.

pnpm --filter @animalhelper/mobile typecheck
FAIL: MediaUploadRuntimeResult rejected the valid stored local_persisting state;
the new report exports were also absent.
```

### GREEN

```text
pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts report-submission.test.ts media-upload-runtime.test.ts
PASS: 3 suites, 54 tests.

pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts report-submission.test.ts media-upload-runtime.test.ts MediaUploadRecovery.test.tsx redaction-review.test.tsx
PASS: 5 suites, 61 tests.

pnpm --filter @animalhelper/mobile test
PASS: 32 suites, 311 tests.

pnpm --filter @animalhelper/mobile typecheck
PASS: tsc --noEmit.

pnpm --filter @animalhelper/mobile build
PASS: Expo web export completed.

git diff --check
PASS: no whitespace errors.
```

### Changes and invariants rechecked

- Native deserialization now treats a valid attached sighting ID as text-only
  only when every media-tuple and upload-workflow column is null. A direct
  native-row round-trip test preserves that sighting ID; invalid IDs and any
  residual workflow fields, including a valid sighting plus upload residue,
  remain explicit `local_media_corrupt` / `needs_user` rows.
- The recovered-sighting test records the actual orchestrator seam and asserts
  `attach` precedes `upload`. The runtime declaration now includes every
  stored `UploadJobState`, with a claim-miss `local_persisting` regression test.
- `null` recovered visibility renders neutral confirmation copy. Only the
  explicit server value `public` can use public-facing copy; `hidden` remains
  private-review copy.
- A failed first durable save stops before any recovery/create/attach/upload
  effect and produces copy that does not claim the draft is available. Later
  failures retain the existing durable-recovery copy because initial
  persistence completed.
- Rechecked that no coordinates, token, capability, signed URL/path, or
  plaintext were added to durable state; deletion ordering and the web
  fail-closed runtime are unchanged.

### Self-review and remaining gates

- Reviewed the discriminator against every nullable media/workflow column and
  confirmed no valid-media path can fall into text-only deletion.
- Reviewed report catch routing: only the first persistence call maps to the
  non-durable error; authentication and post-persistence recovery retain their
  truthful existing messages.
- No new deployment, migration, storage, native-device or Supabase/Deno
  evidence was produced. The release gates documented above remain unchanged;
  public promotion and residual auto-detection remain disabled.

## Whole-branch fix — Batch A (identity + entry boundary)

### TDD evidence

#### RED

```text
pnpm --filter @animalhelper/mobile test -- sightings.test.ts
FAIL: the report API had no origin-only contract: the exact function endpoint
was not constructed, redirect:error was absent, and redirected 307/308
responses were accepted. The foreign-origin test fixture was then corrected to
avoid an accidental real-network timeout before the hardening assertions.

pnpm --filter @animalhelper/mobile test -- report-submission.test.ts
FAIL: 1 failed / 12 passed. The terminal draft-rotation helper was absent, so
two terminal reports retained one dedupe key.

pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts
FAIL: 1 failed / 36 passed. A media row without owner_subject deserialized as
upload_pending instead of durable auth_ownership / needs_user.

pnpm --filter @animalhelper/mobile test -- MediaUploadRecovery.test.tsx
FAIL: 1 failed / 2 passed. A queued foreground run still retried after signout.

pnpm --filter @animalhelper/mobile test -- media-upload-runtime.test.ts
FAIL: 1 failed / 8 passed. The composed native runtime did not expose the
development local-origin allowlist. A subsequent ownership-order regression
also failed because a mismatched row requested an access token before rejection.
```

#### GREEN

```text
pnpm --filter @animalhelper/mobile test -- sightings.test.ts report-submission.test.ts draft-store.native.test.ts media-upload-runtime.test.ts media-upload-coordinator.test.ts MediaUploadRecovery.test.tsx redaction-review.test.tsx
PASS: 7 suites, 115 tests.

pnpm --filter @animalhelper/mobile typecheck
PASS: tsc --noEmit.

pnpm --filter @animalhelper/mobile test
PASS: 32 suites, 328 tests.

pnpm --filter @animalhelper/edge-functions test
PASS: 6 files, 48 tests.

pnpm --filter @animalhelper/mobile build
PASS: Expo web export completed.

git diff --check
PASS: no whitespace errors (Git only emitted CRLF conversion warnings).
```

### Changes and lifecycle/deletion invariants

- Terminal `submitted_text_only` and durable `quarantined` outcomes now reset
  the report form/result and rotate to a fresh UUID. Queued, uploading,
  finalizing, waiting, needs-user and recoverable failures deliberately retain
  the original ID. The consecutive submission test exercises the real
  orchestrator and proves distinct dedupe keys, distinct sightings and no old
  sighting attachment.
- The sightings client accepts a configured Supabase **origin**, validates it
  through the strict transport origin parser, constructs exactly
  `/functions/v1/create-sighting`, uses `redirect: 'error'`, rejects redirected
  and 307/308 responses, and retains the 64 KiB response bound. Paths,
  userinfo, query/hash, normalization tricks and arbitrary HTTP origins are
  rejected before fetch. Coordinates remain request-only memory.
- SQLite now migrates `owner_subject`, binds it atomically with sighting ID,
  permits only same-sighting/same-owner idempotence, and requires the live
  session subject before claim, decrypt, token use and transport. Legacy valid
  media rows with no owner fail closed as `auth_ownership`/`needs_user`; owned
  text-only attached rows remain text-only. Signout cancels the queued recovery
  trigger, and a stale account runner stops before decrypt/token effects.
- Development origin composition permits only exact `localhost`, `127.0.0.1`
  and Android-emulator `10.0.2.2` Supabase origins on port 54321, only outside
  production. Production, LAN, suffix and arbitrary HTTP values remain empty.
  The web runtime continues to fail closed and never decrypts, PUTs or
  backgrounds uploads.
- The Task 4 terminal boundary is unchanged: only durable `quarantined` starts
  cleanup; ciphertext deletion happens before the revision/state guarded row
  delete. No reserve, PUT, finalizing or public-visibility claim is success.

### Batch A self-review and remaining gates

- Reviewed SQL shape and parameter order: `DRAFT_SAVE_SQL` has 16 columns and
  16 bindings; the narrow attach update has six bindings in the exact
  sighting/owner/timestamp/id/sighting/owner order; schema upgrades add
  `owner_subject` before reads/writes. Native, web and declaration signatures
  all carry the owner argument/claim field.
- Reviewed persisted fields: no coordinate, access token, signed capability,
  URL, path or plaintext was added. Owner subjects are not logged. The current
  session is read at effect time, so account changes cannot use an old owner’s
  row.
- Real Supabase migration/pgTAP/Deno, signed Storage redirects, native
  SQLite/SecureStore/Crypto behavior, background/foreground/device races and
  residual detection remain release gates. Public promotion and residual
  auto-detection remain disabled.

## Whole-branch fix — Batch D (owner and terminal outbox)

### TDD evidence

#### RED

```text
pnpm --filter @animalhelper/mobile test -- draft-store.native.test.ts
FAIL: 3 failures. First journal snapshot had ownerSubject undefined; signed-out
review persistence resolved and created a durable row; an otherwise-valid row
with pendingMediaCleanupRef was still claimable.

pnpm --filter @animalhelper/mobile test -- report-submission.test.ts
FAIL: nextReportFormAfterSubmission was absent, so a terminal reset had no
way to preserve a truthful confirmation while rotating the draft identity.
```

#### GREEN

```text
pnpm --filter @animalhelper/mobile test -- media-upload-runtime.test.ts media-upload-coordinator.test.ts MediaUploadRecovery.test.tsx report-submission.test.ts redaction-review.test.tsx draft-store.native.test.ts
PASS: 6 suites, 130 tests.

pnpm --filter @animalhelper/mobile typecheck
PASS: tsc --noEmit.

pnpm --filter @animalhelper/mobile test
PASS: 32 suites, 374 tests.

pnpm --filter @animalhelper/edge-functions test
PASS: 6 files, 48 tests.

pnpm --filter @animalhelper/mobile build
PASS: Expo web export completed.
```

### Batch D invariants and self-review

- The first media journal transaction now requires a live stable owner and
  writes `owner_subject` atomically with its immutable media tuple. A missing
  session fails before the journal commit; replacement only admits that same
  owner. Submission rejects an owner mismatch before recovery/create/network.
- Claim reads require the matching owner and no pending cleanup; the SQLite CAS
  predicate binds owner, revision, source state and `pending_media_cleanup_ref
  IS NULL` in one mutation. Legacy ownerless media remains needs-user.
- Recovery creates an in-memory AbortController for active transport and aborts
  it on signout/stop. Runtime rechecks owner before claim and after a claim;
  coordinator cancellation maps a claimed attempt through bounded retry state
  before decrypt/transport. No token, owner, capability, URL or plaintext is
  persisted or logged.
- Terminal cleanup drains the pending outbox first, rereads the durable row and
  revision, then deletes active ciphertext and finally guarded row state. A
  pending-delete failure retains both references and the row; a pending outbox
  prevents a normal upload claim. Web remains fail-closed.
- Terminal report reset rotates/form-clears but keeps the truthful private
  confirmation visible until the user edits the fresh form.
- Reviewed journal SQL binding order (19 placeholders), owner/pending claim
  predicates, native/web/declaration signatures, cancellation listener cleanup
  and the absence of late-promise rejections. Real Supabase/Storage/Deno and
  native device lifecycle/race validation remain release gates.

## Whole-branch fix — Batch E (auth-switch epoch)

### TDD evidence

#### RED

```text
pnpm --filter @animalhelper/mobile test -- MediaUploadRecovery.test.tsx
FAIL: same-subject auth refresh queued two recovery runs. Earlier owner-attach
and direct A-to-B tests exposed the boolean auth listener’s inability to abort
an active A run before scheduling B.
```

#### GREEN

```text
pnpm --filter @animalhelper/mobile test -- MediaUploadRecovery.test.tsx draft-store.native.test.ts media-upload-coordinator.test.ts media-upload-runtime.test.ts report-submission.test.ts redaction-review.test.tsx
PASS: 6 suites, 133 tests.

pnpm --filter @animalhelper/mobile typecheck
PASS: tsc --noEmit.

pnpm --filter @animalhelper/mobile test
PASS: 32 suites, 377 tests.

pnpm --filter @animalhelper/edge-functions test
PASS: 6 files, 48 tests.

pnpm --filter @animalhelper/mobile build
PASS: Expo web export completed.
```

### Batch E invariants and self-review

- Recovery now carries a nullable authenticated subject rather than a boolean.
  A subject change, including direct A-to-B, aborts the active epoch, cancels
  queued work and schedules exactly one fresh epoch after A settles. Same-owner
  refreshes coalesce without a duplicate claim; signout still aborts/cancels.
- The external signal reaches runtime, token/deadline work, reserve, PUT and
  finalize, including finalizing-first recovery. Cancellation is checked before
  local cleanup, transport and CAS transitions; an already claimed A row can
  only transition through its own owner-bound CAS to bounded waiting.
- The first sighting attach cannot replace a pre-existing media owner: both the
  dependency guard and SQL first-attach branch require its owner, while a truly
  unowned text-only row may bind. Web declarations/signatures now match native
  owner, pending-cleanup and optional-signal APIs while remaining fail-closed.
- Rechecked cancellation race windows: an abort after remote commit but before
  local terminal persistence becomes waiting/finalizing-first recovery, never
  stale success; cleanup-only quarantine checks subject/signal between effects.
  Owner/token/capability/plaintext remain unlogged and unpersisted.

## Whole-branch fix — Batch F (cancellation convergence)

### TDD evidence

#### RED

```text
pnpm --filter @animalhelper/mobile test -- MediaUploadRecovery.test.tsx
FAIL: prior Batch E controller logic queued duplicate same-subject refresh work;
the direct A-to-B and post-claim cancellation regressions then established the
required bounded-settlement behavior.
```

#### GREEN

```text
pnpm --filter @animalhelper/mobile test -- media-upload-runtime.test.ts media-upload-coordinator.test.ts MediaUploadRecovery.test.tsx draft-store.native.test.ts
PASS: 4 suites, 114 tests.

pnpm --filter @animalhelper/mobile typecheck
PASS: tsc --noEmit.

pnpm --filter @animalhelper/mobile test
PASS: 32 suites, 378 tests.

pnpm --filter @animalhelper/edge-functions test
PASS: 6 files, 48 tests.

pnpm --filter @animalhelper/mobile build
PASS: Expo web export completed.
```

### Batch F invariants and self-review

- Terminal cleanup now rechecks the cancellation epoch and live owner after
  pending drain, durable reread and active ciphertext deletion, before every
  following destructive state effect. Any changed account retains the row and
  remaining references for idempotent owner-bound recovery.
- A post-claim owner change is fed back through the coordinator with an aborted
  signal, so A’s own claimed CAS becomes bounded waiting (or attempt-five
  retry-limit needs-user) without B decrypting, tokening, networking or
  transitioning that row.
- `persistFinalizing` is inside failure handling. Cancellation after PUT and
  before/during its CAS converges to waiting/finalizing-first recovery; no
  blind re-PUT or stale success is emitted. Cancellation allows only waiting,
  plus the deliberate attempt-five retry-limit terminal needs-user state.
- Rechecked every cancellation await/state boundary and owner/pending CAS;
  deadlines, secret containment, web fail-closed behavior and durable cleanup
  ordering remain unchanged.

## Whole-branch fix — Batch G (await-order cancellation convergence)

### TDD evidence

RED: `pnpm --filter @animalhelper/mobile test -- media-upload-coordinator.test.ts`
failed the new post-PUT cancellation assertion: the durable `finalizing` CAS
was absent and the job resumed as uploading.

GREEN: the same focused command passed: 1 suite, 44 tests. The coordinator
now permits only the owner/revision-bound finalizing bookkeeping after a known
successful PUT, then stores bounded waiting with `resumeState: finalizing`.

### Invariants and review

- Owner reads are split from cancellation checks in terminal cleanup and the
  native terminal path; destructive cleanup is preceded by a post-await
  cancellation/owner check.
- A completed PUT is never blindly repeated after cancellation: finalizing is
  durably recorded first, then retry starts with finalization recovery.
- The exception is limited to finalizing bookkeeping; ordinary post-abort
  mutations remain blocked, while fifth-attempt retry-limit behavior remains
  bounded.

## Whole-branch fix — Batch H (bounded cancellation correction)

### TDD evidence

RED: the post-PUT cancellation regression initially observed no finalizing
transition. GREEN: `pnpm --filter @animalhelper/mobile test --
media-upload-coordinator.test.ts` passed 1 suite / 44 tests after moving the
cancellation to the finalizing CAS boundary.

### Invariants

- A PUT promise is never awaited after cancellation. Token, reserve and PUT
  remain individually deadline/abort bounded while decrypted bytes are scoped;
  late PUT completion cannot write local state.
- A PUT known to have completed before the finalizing CAS is recorded through
  the owner/revision-bound CAS, then cancellation settles bounded waiting with
  `resumeState: finalizing`.

## Whole-branch fix — Batch H2 (direct cancellation regressions)

Focused verification: `pnpm --filter @animalhelper/mobile test --
media-upload-coordinator.test.ts media-upload-runtime.test.ts` passed 2 suites /
63 tests. Added direct coverage for an externally-cancelled never-settling PUT,
claimed fifth-attempt cancellation, coordinator terminal owner-await and
post-delete cancellation, plus native terminal owner-await and post-delete
row-retention paths. Each confirms no late destructive state effect and the
durable terminal/waiting row remains recoverable.
