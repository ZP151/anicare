# Iteration and launch plan

This sequence deliberately proves safety and identity quality before community growth.

## Sprint 0–1 — foundation (implemented baseline)

- Monorepo, CI, mobile five-tab shell, adaptive glass, bilingual catalogue.
- Event-ledger domain rules, location delay/coarsening policy and governance constraints.
- Supabase schema/RLS/Storage contracts, atomic encrypted sighting function and pgTAP suite.
- Native encrypted drafts that exclude coordinates and tokens.
- Email/Apple/Google PKCE entry points.
- Static operations console and AI candidate-fusion/evaluation contract.

Exit gap: provision hosted development credentials, complete native device
builds, and run the remaining non-media runtime/two-session database checks.

## Sprint 2–3 — safe capture foundations (implemented, not pilot-ready)

- Manual opaque-mask selection, move, resize, single deletion and accessible
  controls are implemented and locally verified alongside canonical JPEG
  re-rendering, metadata stripping, local receipt/journal boundaries, retry
  policy and encrypted reviewed-media recovery. This is not physical-device or
  real-user-photo evidence. Native report submission now persists the stable
  sighting ID before a CAS-coordinated authenticated media transport/retry run.
- Automatic person, licence-plate and cat detection are explicitly unavailable;
  native-device execution has not been completed.
- Backend private Supabase staging/quarantine, cleanup contracts, strict JPEG
  validation, authenticated artifact reader and native
  reserve-to-signed-upload-to-finalize wiring are implemented. A `quarantined`
  result remains private and public promotion is disabled. Gate 2A media
  local-stack runtime evidence is recorded on
  [run 33208195906](https://github.com/ZP151/anicare/actions/runs/33208195906) with both
  `verify` and `database-contracts` green at commit
  [a87023f](https://github.com/ZP151/anicare/commit/a87023f956c468d063c2cc0167b5f2e19f6b3f85).
  Hosted Supabase, native-device end-to-end media checks, and true
  post-token-expiry cleanup/replay remain open release gates.
- Account erasure now records legacy `public-media` and `private-evidence`
  objects in a private, service-only deletion outbox before uploader ownership
  is cleared. The scheduler validates the bucket plus immutable owner-prefixed,
  bounded relative path (including legacy space/Unicode filenames), treats a
  missing object as success, and retains transient failures for bounded retry.
  Unsafe historical keys remain durable manual-review rows and are never sent to
  Storage, so they cannot abort account deletion.
  Hosted legacy-object deletion-outbox Storage integration remains a release
  gate.
- Narrow public feed/report/block and authenticated audited-admin contracts are
  implemented. Their non-media database runtime and two-session concurrency
  checks remain blocking gates.
- Media remains private and quarantined. Public promotion is disabled until
  trusted server residual validation exists; manual quarantine is not public
  publication.

Exit gate: repeat the authenticated artifact reader and
reserve-to-signed-upload-to-finalize flow on hosted Supabase and supported
native devices, including true post-token-expiry cleanup/replay; then complete
adversarial redaction, residual-detector/public-promotion, public-projection and
the non-media two-session concurrency checks. Do not label the branch
pilot-ready before those checks.

## Sprint 4–5 — AI identity alpha contracts (implemented skeleton)

- Strict crop, embedding, callback and public-result contracts, synthetic
  evaluation fixtures and a fail-closed internal identify route are implemented.
- The database identity control plane now separates contributor manual/new-cat
  proposals from service-only AI provenance, denies direct authenticated
  mutations, enforces independent reviewer recusal, records idempotent
  append-only decisions and atomically links a sighting only after confirmation.
- No model weights, labelled dataset, ANN, queue, real callback, automatic
  detection or production identity/accuracy result exists. AI cannot confirm an
  animal identity.

Exit gate: approve a purpose-limited consent/provenance dataset manifest, then
use a consented independently labelled dataset and isolated inference adapter
before evaluating animal-disjoint held-out/open-set metrics. Until then, any AI
output remains synthetic-contract coverage only.

## Sprint 6–7 — care and governance

- Add care-event ledger, duplicate merge proposals, disputes and appeal decisions.
- Add provisional trusted roles, area scope, recusal, revocation and task location grants.
- Add follows and privacy-safe notifications with no location in push payloads.
- Run incident, deletion, access/correction and consent-withdrawal drills.

Exit gate: critical moderation SLA drill under 24 hours; complete audit trace for every privileged read/write.

## Sprint 8 — closed Singapore pilot

- Invite 30–50 adult caregivers from one or two bounded areas and a partner welfare group.
- Publish privacy notice, terms, community rules, safety contact and DPO contact.
- Complete App Store/Play review package, DPIA, transfer assessment and runbook.
- Operate four weeks with weekly safety/model reviews before expanding geography.

Additional blocking gates: establish the Singapore company and DPO, publish
privacy notices/terms/community rules, complete DPIA and transfer assessment,
finish app-store signing and rehearse incident operations. The mandatory CI
database-contract job pins Supabase CLI to 2.84.2 and runs migrations/pgTAP and
warning-level DB lint. Hosted Supabase, feed/report/admin runtime, legal/compliance,
and real post-token-expiry media cleanup/replay are outside Gate 2A.

## Prioritised next backlog

1. Run hosted Supabase Gate 2B and native end-to-end media checks, including
   true post-token-expiry cleanup/replay, then finish non-media two-session
   concurrency verification.
2. Complete supported native-device review/recovery testing and automatic
   detector/residual-validation release work.
3. Provision a real development environment and exercise the audited
   admin/report/block contracts against it.
4. Approve the dataset source/licence/consent/withdrawal rules, curate a
   consented labelled cat dataset, and build an offline held-out benchmark
   before any live inference/ANN/callback pipeline.
5. Complete Singapore legal, privacy, app-store-signing and incident-operation
   launch gates.
