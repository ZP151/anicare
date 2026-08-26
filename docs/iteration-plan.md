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

## Sprint 2–3 — safe capture

- Implement camera capture, deterministic image re-encoding, EXIF stripping and on-device person/licence-plate redaction.
- Add explicit redaction review, upload retry and encrypted offline draft recovery.
- Connect Nearby/Map to the redacted public feed; add report/block flows.
- Connect the admin console to authenticated Supabase data and audit every action.

Exit gate: redaction adversarial test set passes; public/API payload tests find no exact coordinates or EXIF; UGC report/block paths pass App Store/Play checks.

## Sprint 4–5 — AI identity alpha

- Curate consented, independently labelled Singapore community-cat identities.
- Add cat-face detection/crop quality assessment and versioned DINOv2-compatible embeddings.
- Add approximate-nearest-neighbour retrieval, trait/time/cell fusion and async callback.
- Build the candidate selection/new-cat UX and independent review queue.

Exit gate: held-out metrics meet the charter thresholds; otherwise ship manual search/new-cat only.

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

## Prioritised next backlog

1. On-device media redaction and safe upload.
2. Real Supabase dev environment plus locally passing RLS tests.
3. Authenticated admin data access and moderation actions.
4. Labelled cat dataset/model embedding pipeline.
5. Candidate/new-cat mobile UX and async inference.
6. Notifications, operational dashboards and pilot onboarding.

