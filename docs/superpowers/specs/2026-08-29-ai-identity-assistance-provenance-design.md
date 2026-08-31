# Whisker Commons AI Identity Assistance Provenance Design

**Status:** Draft for written-spec approval

**Date:** 2026-08-29

**Product:** Whisker Commons
**Decision:** Approved architectural direction (Option A); this document fixes the implementation boundary.

## 1. Outcome

Whisker Commons will let an adult contributor explicitly ask for AI help identifying a community cat from a privacy-reviewed, quarantined photo. The system will persist an auditable relationship between the request, the exact finalized media asset, the inference contract, the bounded candidate set, the contributor's selection, and the independent review decision.

AI is assistance, not authority. It may suggest up to three existing cats using broad confidence bands and bounded reasons. It may not attach a sighting to a cat, create three competing proposals, expose similarity scores or embeddings, or silently convert an uploaded photo into training data. A contributor must select one suggestion or choose “none/new cat”; a different trusted reviewer must still decide the resulting single tentative proposal.

This design advances the requested cat-face identity MVP without claiming that a real model, production queue, physical-device flow, hosted environment, or Singapore pilot gate is already complete.

## 2. Product decisions

### 2.1 User promise

- Reporting a sighting remains free, useful, and complete without AI.
- After a reviewed photo is quarantined, the contributor sees an optional “Ask AI to help identify this cat” continuation.
- The continuation explains the purpose, processing boundary, retention behavior, and that suggestions may be wrong.
- The user can skip, cancel any unselected request (including a completed suggestion set), or delete the source report/media later.
- A completed request shows zero to three candidate cats. It never shows percentages or ranking scores.
- The user explicitly selects one candidate or “This is a different/new cat.” Only that action creates one tentative identity proposal.
- The public record changes only after independent human review.

### 2.2 Consent and purpose separation

An identity-assistance request is a purpose-specific user instruction to process one selected media asset. It is not AI-training consent.

- `training_eligible` remains false unless the separate optional training-consent flow is completed.
- Neither account creation nor sighting contribution bundles identity assistance or training consent.
- The request records the displayed notice version and request time.
- Withdrawing identity assistance stops future processing and removes unneeded candidate results and inference fingerprints.
- Deleting the report, media, or account cancels active work and makes future media access impossible.

### 2.3 Pilot role boundary

The first reviewer UI is platform-admin only. Community trusted-reviewer expansion requires a later privacy and abuse review. Existing direct table-read policies for identity proposals and reviews will be replaced by narrow, audited projections before media review is enabled.

## 3. Non-negotiable invariants

1. Only the adult owner of an unlinked sighting may request identity assistance for a finalized, non-deleted media asset belonging to that sighting.
2. The source media must be the canonical reviewed JPEG already accepted by the safe-media finalization contract.
3. Training consent is never required and is never inferred from an identity request.
4. At most one actionable identity-assistance job (`requested`, `processing`, or unselected `succeeded`) exists per sighting, and at most one tentative identity proposal exists per sighting.
5. A service completion writes a private suggestion set, not an identity proposal.
6. A candidate set contains zero to three unique active animals, ordered by rank, with only `likely`, `possible`, or `weak` bands and allow-listed reason codes.
7. Scores, embeddings, precise coordinates, storage paths, bearer tokens, and raw model evidence never appear in mobile or admin projections.
8. A contributor selection is idempotent and atomically creates no more than one tentative proposal.
9. The reviewer must be independent of the reporter, selector, relevant cat profile creator, and any other existing recusal subject.
10. Media authorization is rechecked immediately before a short-lived URL is minted. A prior queue/detail read is not authorization to view deleted evidence.
11. Erasure preserves only the minimum decision audit needed for integrity; it does not preserve a usable media path, embedding, candidate set, input fingerprint, or erased actor identity.
12. AI failure, timeout, cancellation, or no-match never blocks sighting submission.

## 4. Architecture

```text
reviewed mobile JPEG
        |
        v
private quarantine + finalized media_asset
        |
        | explicit identity-assistance request
        v
private job ledger --claim/lease--> private inference worker
        |                                |
        |<-- bounded completion ----------+
        v
private 0..3 candidate set
        |
        | owner-only safe projection + explicit selection
        v
single tentative identity_proposal
        |
        | narrow audited review queue + short-lived evidence grant
        v
independent reviewer decision
        |
        +--> confirmed link / rejected / needs-more-evidence
```

The transactional database is the authority for job state, idempotency, provenance, and review eligibility. The inference worker is an untrusted result producer behind a dedicated identity-assistance broker: it may not hold a Supabase service key, database password, storage credential, or user JWT, and it may not directly update sightings, proposals, animals, media metadata, or consent. The broker owns the service credential and exposes only lease-bound claim/fetch/complete/fail operations to a rotated worker credential.

The worker will eventually run the approved ONNX cat-face crop/embedding/matching pipeline in the Singapore deployment region. No third-party general-purpose vision API is introduced by this design. Until a consented benchmark and live provider are approved, the broker/database boundary is exercised by a deterministic test fake; the existing synthetic components remain contract-level test doubles, not a media-processing worker.

## 5. Data model

All new job, candidate, request, and evidence tables live in `private`; authenticated clients have no direct table grants.

### 5.1 `private.identity_assistance_jobs`

One durable, purpose-bound inference request.

- `id uuid` primary key.
- `sighting_id uuid` required; cascades with the sighting.
- `media_asset_id uuid` nullable on erasure; the active job requires a valid asset.
- `requester_id uuid` nullable on account erasure.
- `status`: `requested | processing | succeeded | failed | cancelled | expired`.
- `notice_version text` and `purpose text` fixed to the approved identity-assistance purpose.
- `input_sha256 text` is copied only to bind worker input to finalized media; it is cleared on erasure/cancellation once no longer needed.
- `recipe_version`, `crop_contract_version`, `embedding_contract_version`, and `identify_contract_version` are immutable provenance fields.
- `model_version`, `callback_contract_version`, and `new_cat_recommended` are null until completion and then immutable.
- `attempt_count`, `lease_id`, `lease_expires_at`, bounded `failure_code`, and lifecycle timestamps support safe retries.
- `selected_at`, `withdrawn_at`, and `result_invalidated_at` distinguish an actionable successful result from a consumed, withdrawn, or stale result.
- A partial unique index permits only one actionable (`requested`, `processing`, or unselected/non-invalidated `succeeded`) job per sighting. Repeated requests for the same media replay that job. Retryable worker failures create a new attempt on the same job; a new job is allowed only after terminal failure, cancellation, expiry, or invalidation, with no active proposal and subject to rate limits.

The row stores no bucket name, storage path, vector, raw score, free-form worker log, or precise location.

### 5.2 `private.identity_assistance_candidates`

The result set for a successful job. It is immutable during normal operation and removable only by the governed cancellation, retention, or erasure paths.

- Composite key `(job_id, rank)` with rank 1–3.
- `animal_id` references an active candidate and becomes unavailable if the animal is erased/archived.
- `confidence_band` is one of the three broad public bands.
- `reason_codes` contains one to four codes from a database enum/allow-list such as `face_pattern_similar`, `ear_shape_similar`, `coat_marking_similar`, `view_angle_limited`, and `image_quality_limited`.
- Unique `(job_id, animal_id)` prevents duplicate candidates.

Worker-supplied display text is rejected. Mobile and admin map reason codes to reviewed localized copy. There is deliberately no score or embedding column. Offline model evaluation uses a separately governed, consented dataset rather than production transaction rows.

Candidate rows use `on delete cascade`. Archiving or deleting any candidate marks the entire immutable result set `result_invalidated_at`; status then returns a stale/non-actionable result and hides all candidates. The user may request a fresh job if the sighting is still eligible.

### 5.3 Request and event ledgers

- `private.identity_assistance_requests` maps `(actor_id, request_id)` to a payload hash, mutation operation, job, and optional proposal. It makes request, cancel, selection, and retries idempotent. Actor ledger rows cascade on account deletion.
- `private.identity_assistance_service_requests` gives service completions/failures the same payload-conflict protection.
- `private.identity_assistance_events` is append-only and contains only an allow-listed event type, job ID, nullable actor ID, request ID, bounded reason code, and timestamp. It accepts no arbitrary JSON or raw model output.
- Mobile status polling uses a separate aggregated read-audit row keyed by `(actor_id, job_id, UTC day)`, updated at most once per day. It does not create a durable mutation-ledger row per poll. Admin queue/detail reads and every media-capability mint remain individually audited.

### 5.4 Proposal provenance and evidence

`private.identity_proposal_evidence` binds a selected proposal to:

- the originating job;
- the selected candidate rank, or null for “new cat”;
- the exact media asset while it exists;
- immutable recipe/crop/embedding/identify/model version labels;
- the selection timestamp and nullable selector ID.

It never stores a storage path or vector. The media hash may be checked during binding but is not duplicated into long-lived proposal audit. On erasure, media and selector references are nulled or removed while non-identifying contract/version and decision-integrity fields may remain under the retention policy.

### 5.5 Existing control-plane change

`service_submit_ai_identity_proposal` is deprecated and loses executable access. Service completion can only persist candidate sets. The authenticated, owner-bound selection RPC is the sole AI-result bridge: selecting a ranked candidate creates `source = 'ai_candidate'`, with a null public proposer and the selector recorded privately; choosing “new cat” creates `source = 'new_animal'`, a null animal, and the selector as proposer. Both outcomes bind the same job evidence. The existing independent `review_identity_proposal` transition remains authoritative, with recusal extended to the private selector provenance.

For AI-originated proposals, the existing `identity_proposals.reasons` JSON array stores only the same allow-listed reason codes. A new exact validator replaces the current substring-based free-text validator for this source. User-facing localized explanations are never accepted from the worker or persisted as proposal provenance.

## 6. State machines

### 6.1 Job

```text
requested -> processing -> succeeded
    |            |             |
    +----------> failed        +-> selected proposal (separate event)
    |            |
    +----------> cancelled <---+
    |
    +----------> expired
```

- Claiming requires a lease. Only the current unexpired lease may complete or fail the attempt.
- Expired leases return the job to `requested` while attempts remain; otherwise the job fails with a bounded code.
- Successful completion may contain zero candidates and is still a valid no-match outcome.
- Selection sets `selected_at`, appends provenance, and creates the proposal atomically; it never rewrites candidate content.
- Any manual proposal, sighting link, media deletion, request withdrawal, or account-erasure condition makes later selection non-actionable.
- Database checks and triggers enforce legal transitions, immutable purpose/media/version fields, monotonically increasing attempts, one successful completion, append-only events, and candidate insertion only inside the successful-completion transaction.

### 6.2 Proposal

The existing `tentative -> confirmed | rejected` behavior remains. `needs_more_evidence` adds a review record but leaves the proposal tentative, as today. The first pilot UI treats a stale concurrent action as “already handled” rather than adding queue leases.

## 7. RPC and service contracts

### 7.1 Contributor RPCs

`request_identity_assistance(sighting_id, media_asset_id, notice_version, request_id)`:

- authenticates an adult sighting owner;
- verifies the media upload job is finalized and binds the same sighting, uploader, hash, recipe, review time, quarantine state, and non-deleted asset;
- rejects a linked sighting, an active proposal, or conflicting active job;
- records the job and audit event atomically;
- returns only `jobId`, `status`, and `requestedAt`.

`get_identity_assistance(job_id, request_id)`:

- owner-only, narrow, and read-audited through daily aggregation rather than mutation idempotency;
- returns lifecycle status and, after success, safe candidate cards containing rank, opaque/public animal ID, public alias, already-approved coarse public profile fields, confidence band, and reasons;
- returns no path, score, vector, worker identity, internal failure detail, or location.

`cancel_identity_assistance(job_id, request_id)`:

- owner-only and idempotent;
- prevents new claims/completions, removes candidate results, clears the input fingerprint, and records a bounded cancellation event.

`select_identity_assistance_result(job_id, selection, candidate_rank, request_id)`:

- accepts `candidate` with a valid returned rank or `new_animal` with no rank;
- revalidates ownership, sighting state, media state, candidate availability, and absence of another tentative proposal;
- creates exactly one proposal plus evidence provenance in one transaction;
- returns the safe proposal ID/source/status projection.

### 7.2 Service RPCs

`service_claim_identity_assistance_jobs(worker_id, limit, request_id)`:

- broker/service-role only; it is never exposed directly to the worker or client;
- uses `FOR UPDATE SKIP LOCKED`, bounded batch size, leases, and attempt limits;
- returns job ID, opaque media asset ID, expected input hash, and contract versions, not a browser-usable URL.

`service_complete_identity_assistance_job(job_id, lease_id, model_version, candidates, request_id)`:

- broker/service-role only and idempotent;
- verifies the active lease and unchanged, non-deleted media binding;
- validates `identify-callback.v1`, callback event identity, zero to three unique ordered candidates, `newCatRecommended`, current animal eligibility, bands, and reason codes;
- atomically freezes provenance and replaces no prior successful result.

`service_fail_identity_assistance_job(job_id, lease_id, failure_code, retryable, request_id)`:

- accepts only allow-listed codes;
- either releases for retry or transitions terminally based on attempt policy;
- never persists exception text, image data, paths, or model output.

### 7.3 Worker broker contract

The worker authenticates to a private broker endpoint with a dedicated rotated credential. The broker rate-limits the worker, validates a versioned request envelope, and calls the service-role database RPCs. Compromise of the worker credential must not permit general Supabase table, Auth, or Storage access.

- `POST /v1/identity-jobs/claim` returns a bounded lease envelope using `identity-assistance-job.v1`.
- `GET /v1/identity-jobs/{jobId}/media?leaseId=...` rechecks the current lease, tombstone, finalized upload-job relationship, canonical recipe, object key, and hash. The broker then streams the JPEG or issues a worker-only capability valid for at most 60 seconds. The capability is bound to the lease and never returned to a mobile/admin client.
- `POST /v1/identity-jobs/{jobId}/complete` accepts one `identify-callback.v1` result and callback event ID. The broker, not the worker, translates it into the database completion RPC.
- `POST /v1/identity-jobs/{jobId}/fail` accepts an allow-listed failure code and retryability flag.

The existing synthetic crop/embedding/identify components do not read media and are not described as an end-to-end worker. A1 uses a deterministic broker/database test fake plus a narrow adapter that proves versioned callback mapping. Real media fetch, crop, embedding, ANN evidence, and model accuracy remain A3 work.

### 7.4 Admin review RPCs

The first pilot exposes platform-admin-only:

- `admin_list_identity_review_queue(request_id)`;
- `admin_get_identity_review_proposal(proposal_id, request_id)`;
- `admin_authorize_identity_review_media(proposal_id, media_asset_id, request_id)`.

Queue/detail responses contain only proposal IDs, source, safe candidate provenance, public candidate alias, broad confidence band/reasons, timestamps, safe sighting context, and opaque media asset IDs. They exclude storage paths, coordinates, vectors, scores, raw notes, requester identity, and service job internals.

Direct trusted-reviewer `SELECT` policies on `identity_proposals` and `match_reviews` are removed. Contributor self-status, if needed, is provided by a separate narrow owner projection.

For the first pilot, `review_identity_proposal` is also narrowed to the platform-admin capability so a user who learns an opaque proposal ID cannot bypass the queue gate. Re-expanding decisions to trusted contributors or area stewards requires a later capability-scoped queue, training/recusal policy, and abuse review.

Queue and detail RPCs filter out any proposal for which the current admin is a recusal subject. Media authorization repeats the same recusal check; viewing evidence is privileged review activity, not a weaker permission than deciding it.

## 8. Mobile flow

The media submission coordinator must return and retain `sightingId` plus finalized `mediaAssetId`; it must not delete all continuation state before routing.

1. The existing report and manual redaction flow completes.
2. Sighting creation and media quarantine complete independently.
3. The app stores a minimal encrypted continuation record, then opens identity assistance.
4. The user may skip, request assistance, or retry a safe failure.
5. Pending processing is resumable and does not require the report draft to remain.
6. Completed candidate cards allow one explicit selection, “new cat,” or cancellation.
7. Proposal status is shown as awaiting independent review.

No background-execution claim is made until physical-device evidence exists. Foreground resume and authenticated retry are the required first behavior. The stale native-reader comment in `apps/mobile/src/api/media.ts` is corrected in the implementation pass.

## 9. Reviewer media access

`private.identity_proposal_evidence` is the only evidence allow-list. A reviewer cannot browse all media attached to a sighting.

The `get-identity-review-media` Edge function:

1. validates the reviewer JWT;
2. calls the audited authorization RPC;
3. re-reads evidence, media deletion status, current role, proposal actionability, and recusal at signing time;
4. uses service credentials to mint a very short private `media-staging` URL;
5. returns the URL with no storage path field and requires no-store handling.

An already issued URL cannot be recalled, so the initial TTL is at most 60 seconds. Deletion prevents every subsequent mint. Longer grants, public buckets, standalone path fields in browser APIs, and bulk media export are prohibited.

Supabase signed URLs may necessarily contain an opaque object key in their route. The API therefore never returns the bucket/path as a separate field, never uses a user-derived filename, and never logs or persists the capability URL in application state. The reviewer UI treats the URL as an ephemeral capability and does not provide copy/export controls.

## 10. Privacy, deletion, and retention

- The worker processes only a user-requested reviewed media asset and must not retain image bytes after the request lifecycle.
- Live inference will use an ephemeral cat crop; original image download and crop generation stay within the controlled Singapore deployment environment.
- The transactional system stores no production embedding or numeric similarity score in this slice.
- Candidate results are removed on cancellation, source deletion, account erasure, or expiration under the retention schedule.
- Media cleanup clears embeddings, training eligibility, usable object access, job fingerprints, and candidate bindings before or with object deletion.
- Audit retention uses pseudonymous IDs and bounded event codes. It does not retain erased actor identity, path, token, coordinate, free text, or raw inference output.
- Logs and telemetry must redact authorization headers, signed URLs, media IDs where unnecessary, and payload bodies.

### 10.1 Transactional invalidation

Deletion does not have an impossible universal priority over a transaction that already committed. Instead, all relevant mutations are linearizable:

- No request, claim, completion, selection, review, or media mint may commit after it observes a media/sighting/account tombstone.
- A deletion that commits later cancels any active job, purges candidates, clears the input fingerprint, nulls evidence media/actor references, and withdraws any still-tentative proposal so it cannot later be reviewed.
- Detailed job, candidate, evidence, proposal, and review rows may cascade with the sighting/report. The retained audit is a separate minimized tombstone event with actor/resource linkage cleared during erasure; the design does not promise to retain a detailed decision graph after report deletion.
- Identity invalidation is integrated into the existing consolidated `private.prepare_user_profile_account_erasure()` function and the existing `server_request_media_deletion` transaction. No independently ordered account-erasure trigger is added.

Every path follows one lock order: account row when applicable, then sighting, media upload job, media asset, candidate animal, identity-assistance job, identity proposal, and review. Request/resource advisory transaction locks are acquired before those row locks. Candidate eligibility/completion takes `SHARE` locks on candidate animal rows in UUID order before the identity-assistance job and revalidates availability after locking; animal availability UPDATE/DELETE takes the conflicting animal mutation lock before its invalidation trigger locks identity jobs. The animal row is their common per-animal serialization boundary, so no path acquires an animal after an identity-assistance job. Existing review/deletion functions are refactored to acquire and revalidate in that order. Rows within a class are locked by UUID order. Tests exercise animal hide/delete-vs-complete, media delete-vs-complete, delete-vs-select, and delete-vs-review interleavings.

### 10.2 Initial retention defaults

These defaults are conservative implementation constants and remain subject to the approved Singapore retention schedule:

- worker lease: 2 minutes, at most 3 attempts;
- worker and reviewer media capability: at most 60 seconds;
- worker image/crop bytes: memory-only for one attempt, hard timeout 5 minutes, no durable temp file;
- unselected successful suggestion set: 7 days, then expire and purge candidates/fingerprint;
- failed, cancelled, expired, or invalidated job operational rows and mutation ledgers: 30 days;
- selected job/evidence detail: while review is open, then at most 90 days after a terminal review;
- aggregated access/security events: at most 180 days unless an approved incident hold applies; erasure clears actor/resource linkage;
- any source/account deletion: immediate logical invalidation and cleanup scheduling regardless of the above maxima.

`service_cleanup_identity_assistance(batch_size, cutoff_time)` performs bounded, idempotent cleanup and is pgTAP-tested with controlled timestamps. Production invokes it at least every 15 minutes through the approved scheduler; missed schedules are observable and block pilot readiness.

Before a Singapore closed pilot, the DPIA, purpose/notice text, DPO/contact, processor and cross-border inventory, retention schedule, account-erasure evidence, incident response, and store disclosures must be approved. This design is technical support for those decisions, not legal approval.

## 11. Failure and concurrency behavior

- Duplicate request IDs with the same payload replay the original safe result; changed payloads fail with an idempotency conflict.
- Two workers cannot own a valid lease simultaneously. A late completion from an expired lease is rejected.
- A candidate archived between completion and selection is rejected and the client refreshes the result.
- A proposal created manually while AI runs causes later AI selection to return non-actionable; it never overwrites the manual proposal.
- Concurrent contributor selections produce one proposal and one safe replay/conflict outcome.
- Concurrent reviewer terminal decisions produce one review/decision/audit outcome; the loser receives “already handled.”
- Media deletion/erasure and competing operations serialize under the documented lock order: no later operation may commit against a tombstone, and a later deletion invalidates still-actionable identity work in the same transaction.
- Worker unavailability leaves the sighting intact and exposes a retryable or terminal safe status without internal diagnostics.

## 12. Delivery slices

### A1 — Provenance-bound data and service control plane

- Database types, private job/candidate/ledger/evidence tables, grants, triggers, and indexes.
- Contributor request/status/cancel/select RPCs.
- Broker-only service claim/complete/fail/cleanup RPCs, lease-bound media-fetch contract, and deterministic callback adapter/test fake.
- Deprecation of direct service-created proposals.
- Consolidated erasure/deletion invalidation, fixed retention defaults, and database/AI contract tests.

This is the next implementation slice. It is complete only when local pgTAP, Edge/service tests, type checks, builds, and privacy-contract tests pass.

### A2 — Mobile continuation and narrow admin review

- Start only after the Sprint 3A five-tab function/state inventory and the
  Sprint 3B visual direction/token system in `docs/iteration-plan.md` are
  approved; identity assistance must extend a complete product journey rather
  than add another isolated shell page.
- Preserve encrypted sighting/media continuation state.
- Add optional request/status/candidate-selection UI.
- Add platform-admin queue/detail RPCs and admin pages.
- Add audited 60-second reviewer media authorization.
- Remove broad identity-table reviewer reads and add concurrency/erasure tests.
- Apply the approved Impeccable/Emil-guided design system, purposeful native
  motion, real iconography, accessible glass fallbacks and complete
  loading/empty/offline/error/cancel/resume states.

### A3 — Live cat-face provider and pilot evidence

- Build a purpose-consented, Singapore-relevant evaluation dataset outside production tables.
- Approve preprocessing/crop and embedding model versions, thresholds, false-match targets, subgroup/environment tests, and rollback criteria.
- Pass residual people/licence-plate privacy validation for the reviewed-media-to-cat-crop path; detector unavailability remains visible and prevents an unsupported automatic-safety claim.
- Deploy the ONNX worker and queue in the approved Singapore region behind a disabled-by-default feature flag.
- Run hosted Supabase, signed EAS physical-device, token-expiry, process-kill, cleanup, two-user, observability, incident, and legal gates.

The synthetic provider remains the default until A3 gates pass. Passing A1/A2 does not authorize live inference or a public/pilot launch.

All identity-assistance entry points remain disabled by default through A1. The legacy service-created proposal function is revoked only after repository-wide caller enumeration proves there is no active caller. Before the feature can be enabled in A2, broad reviewer table reads and the review mutation capability must already be narrowed to the platform-admin audited path; this is an enablement prerequisite, not optional follow-up work.

## 13. Verification matrix

### Database and RLS

- owner/non-owner/adult/role gates;
- exact media-to-sighting/upload-job binding;
- training-consent independence;
- one active job and one tentative proposal invariants;
- request, service completion, and selection idempotency conflicts;
- lease expiry and stale-worker rejection;
- zero/one/three candidate results and malformed/duplicate candidate rejection;
- strict reason-code allow-list and rejection of worker display text;
- legal-transition/immutability triggers and candidate insertion boundary;
- no score/vector/path columns or projected fields;
- manual-vs-AI and selection concurrency;
- reviewer recusal including selector provenance;
- direct-table read denial and audited narrow reads;
- account/media/sighting/animal erasure races and post-delete URL denial.

### Mobile

- report submission retains `sightingId + mediaAssetId` safely;
- skip never starts a job;
- request is explicit and separate from training consent;
- pending resume survives normal app restart;
- candidate/new-cat selection is explicit and idempotent;
- auth expiry, retry, cancellation, media failure, no-match, and stale candidate paths;
- no percentage, score, vector, path, or precise location rendering.

### Service and Edge

- private-token/service-role authentication;
- proof that the worker credential cannot access general Supabase tables, Auth, or Storage;
- lease-bound broker media fetch with tombstone/hash/path revalidation;
- claim batching and lease ownership;
- input hash/contract binding;
- strict callback schema and bounded error codes;
- no request body, signed URL, vector, or raw score logging;
- media authorization before signing and deletion recheck immediately before mint.

### Admin

- strict queue/detail response parsing that rejects extra sensitive fields;
- platform-admin gate and revoked-role denial;
- no direct storage path in HTML, action payloads, logs, or errors;
- one terminal outcome under two-session review concurrency.

### External pilot evidence

- hosted Singapore-region Supabase and worker execution;
- real auth and Storage redirects, token expiry, replay, and cleanup;
- signed iOS/Android EAS builds on supported physical devices;
- manual masking, metadata stripping, encrypted recovery, and process-kill evidence;
- approved DPIA/notices/retention/transfers/DPO/incident/store and UGC governance;
- approved model benchmark and rollback thresholds before enabling live inference.

## 14. Explicitly deferred

- automatic identity confirmation;
- public face search or arbitrary photo lookup;
- person facial recognition;
- third-party vision APIs;
- production embeddings in client-accessible or transactional rows;
- public or long-lived media URLs;
- training-consent UX and dataset operations;
- donations, payments, rewards, or contribution-conditioned transfers;
- community-wide reviewer access;
- background execution claims without device evidence;
- launch claims before the Singapore legal and operational gates pass.

## 15. Acceptance criteria for the next plan

The implementation plan derived from this design must:

1. deliver A1 test-first in reversible commits;
2. preserve current safe capture, moderation, and identity review behavior;
3. include an explicit migration path away from `service_submit_ai_identity_proposal`;
4. include erasure and concurrency tests before happy-path adapters;
5. keep the synthetic provider and live-inference feature flag off by default;
6. identify every external/manual gate separately from locally verifiable work;
7. include the broker credential, fetch contract, cleanup ownership, and migration/rollback sequence;
8. treat the Sprint 3A product-completeness and Sprint 3B visual-quality gates
   as prerequisites for A2 UI completion;
9. stop for review after A1 before starting A2.
