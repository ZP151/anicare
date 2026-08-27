# Iteration and launch plan

This sequence deliberately proves safety and identity quality before community growth.

## Sprint 0–1 — foundation (implemented baseline)

- Monorepo, CI, mobile five-tab shell, adaptive glass, bilingual catalogue.
- Event-ledger domain rules, location delay/coarsening policy and governance constraints.
- Supabase schema/RLS/Storage contracts, atomic encrypted sighting function and pgTAP suite.
- Native encrypted drafts that exclude coordinates and tokens.
- Email/Apple/Google PKCE entry points.
- Static operations console and AI candidate-fusion/evaluation contract.

Exit gap: run database tests with Docker/Supabase CLI; provision real dev credentials; complete native device builds.

## Sprint 2–3 — safe capture foundations (implemented, not pilot-ready)

- Manual opaque-mask review, canonical JPEG re-rendering, metadata stripping,
  local receipt/journal boundaries, retry policy and encrypted reviewed-media
  recovery are implemented. This does not include authenticated media transport.
- Automatic person, licence-plate and cat detection are explicitly unavailable;
  native-device execution has not been completed.
- Backend private Supabase staging/quarantine, cleanup contracts, strict JPEG
  validation and mobile request/response contracts are implemented. The
  authenticated artifact reader and reserve-to-signed-upload-to-finalize wiring
  are intentionally absent; this is a blocking release gate. Local migration,
  pgTAP, Deno/Edge and Storage runtime execution has not run in this workspace.
- Narrow public feed/report/block and authenticated audited-admin contracts are
  implemented. Database runtime and two-session concurrency checks remain
  blocking gates.
- Media remains private and quarantined. Public promotion is disabled until
  trusted server residual validation exists; manual quarantine is not public
  publication.

Exit gate: implement and test the authenticated artifact reader plus the
reserve-to-signed-upload-to-finalize mobile flow; then run the required
Docker/Supabase/Deno checks, native-device review flow, adversarial redaction
tests, public-projection tests and two-session concurrency checks. Do not label
the branch pilot-ready before those checks.

## Sprint 4–5 — AI identity alpha contracts (implemented skeleton)

- Strict crop, embedding, callback and public-result contracts, synthetic
  evaluation fixtures and a fail-closed internal identify route are implemented.
- No model weights, labelled dataset, ANN, queue, real callback, automatic
  detection or production identity/accuracy result exists. AI cannot confirm an
  animal identity.

Exit gate: use a consented independently labelled dataset and production-safe
inference infrastructure before evaluating held-out metrics. Until then, any AI
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
warning-level DB lint. Deno/Edge runtime, private Storage integration, local
Docker/Supabase and two-session verification remain separate release gates.

## Prioritised next backlog

1. Run real Supabase/Docker/Deno/Storage checks, migrations, pgTAP and
   two-session concurrency verification.
2. Complete supported native-device review/recovery testing and automatic
   detector/residual-validation release work.
3. Provision a real development environment and exercise the audited
   admin/report/block contracts against it.
4. Curate a consented labelled cat dataset and build a bounded inference/ANN/
   callback pipeline behind the frozen contracts.
5. Complete Singapore legal, privacy, app-store-signing and incident-operation
   launch gates.
