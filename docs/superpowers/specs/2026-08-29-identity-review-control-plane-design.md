# WhiskerCommons Identity Review Control Plane Design

**Status:** Approved by the user on 2026-08-29

**Goal:** Establish the authoritative, independently reviewed database path for tentative cat-identity proposals before any real model, dataset, ANN index, or live inference is enabled.

**Non-goal:** This slice does not claim cat-face recognition accuracy, ingest real photos, enable training, persist production embeddings, deploy a hosted worker, publish an identity automatically, or complete hosted/native Pilot Gate 2B evidence.

## Decision

Identity remains a human-governed ledger. Contributors may submit either an existing-animal match or a new-animal outcome for a sighting they reported. AI-originated rows remain service-only and tentative. A trusted reviewer who is independent of the reporter, proposer, and proposed animal profile creator is the only actor who may produce an authoritative outcome.

The current direct table-write policies are replaced by fixed-path RPCs and append-only request records. This prevents clients from forging AI provenance, model versions, confidence bands, reasons, reviewers, or terminal state.

## Invariants

- A contributor can propose identity only for their own sighting and only after adult confirmation.
- `manual_search` requires an existing animal. `new_animal` requires no animal. Client RPCs cannot submit `ai_candidate`.
- AI candidates require a service-controlled path and must carry bounded, non-sensitive reason text, a model version and a broad confidence band. AI never confirms identity.
- A reviewer must hold an active `trusted_contributor`, `area_steward`, or `platform_admin` grant and must not be the sighting reporter, proposal author, or proposed animal profile creator.
- `confirm` and `reject` are terminal. `needs_more_evidence` records a review but leaves the proposal tentative and does not change the sighting.
- Confirming an existing-animal proposal atomically links the sighting to that animal. Confirming `new_animal` records an authoritative unknown/new outcome but does not silently create a public animal profile.
- Only one tentative proposal may be active for a sighting. Terminal rows remain historical evidence.
- Every authenticated mutation is idempotent by actor and request UUID. Conflicting request reuse fails closed.
- Proposal and review tables are not directly mutable by authenticated clients. Review records are append-only.
- Public or contributor projections never return numeric scores, vectors, image references, precise locations, model internals, or reviewer identity.

## Database architecture

Add a forward migration that:

1. Drops direct authenticated insert policies for `identity_proposals` and `match_reviews`, revokes client mutation privileges, and retains narrow owner/reviewer reads.
2. Adds structural checks for source-specific fields and bounded JSON reason arrays.
3. Adds a partial unique index for one tentative proposal per sighting.
4. Adds a private idempotency ledger and an append-only guard for review rows.
5. Adds `submit_identity_proposal` for contributor manual/new-animal outcomes.
6. Adds `review_identity_proposal` for independent trusted review and atomic sighting linkage.
7. Leaves an explicitly service-role-only AI insertion boundary; no authenticated API can impersonate it.

The migration must preserve existing enum values. `needs_more_evidence` remains a review decision rather than a proposal status, avoiding a premature enum/schema expansion.

## Native and CI guardrails

The already implemented Expo native-configuration policy and EAS pilot-build policy become root verification gates. This protects the gallery-only, no-camera/no-microphone, foreground-location, SQLCipher, internal-distribution, credential-free build contract from regressions on every push.

This slice also reconciles documentation: manual EXIF stripping and opaque masking are implemented at source level but remain unproven on physical devices; architecture continues to describe media as private quarantined staging, not public storage.

## Failure handling

- Missing auth, inactive trust, recusal, malformed input, unavailable target, stale proposal, and conflicting idempotency reuse return bounded database errors.
- A concurrent reviewer locks the proposal; exactly one terminal transition may succeed.
- A failed transaction writes neither a partial review nor a partial sighting link.
- Revoked or provisional role state is rechecked inside the action transaction.
- No raw exception, token, path, coordinate, vector, score, or free-form model payload is written to audit data.

## Verification

TDD begins with pgTAP contracts that fail against the current schema. They must prove permissions, source separation, owner binding, recusal, active-role checks, idempotency, terminal immutability, `needs_more_evidence`, atomic sighting linkage, and concurrent-safe one-way transitions.

Final verification includes the fresh Supabase migration/pgTAP gate, all existing Edge/mobile/admin/AI suites, native/EAS validators, Python lint/type checks, root build, diff hygiene, and GitHub Actions. These are source and local-stack evidence only.

## Deferred gates

- Real model and licensed weights selection
- Consent/provenance dataset manifest and approved real-photo protocol
- Animal-disjoint held-out/open-set accuracy evaluation
- Hosted queue, callback, vector index and production embedding persistence
- Hosted Singapore-region Supabase project and true post-expiry replay
- Physical iOS/Android security, lifecycle, accessibility and glass-effect evidence
- DPO/DPIA, retention, transfer, subprocessor and legal sign-off

