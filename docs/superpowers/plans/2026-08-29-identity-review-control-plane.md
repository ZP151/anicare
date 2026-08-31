# Identity Review Control Plane Implementation Plan

**Goal:** Replace forgeable direct identity writes with an idempotent, independently reviewed, atomic control plane and make native pilot policies mandatory in CI.

**Architecture:** A forward Supabase migration owns fixed-path contributor and reviewer RPCs, a private request ledger, source-specific constraints and append-only review history. Root verification calls the existing native/EAS validators. Documentation states the exact implemented/evidence boundary.

## Task 1: Write red pgTAP contracts

- Add `supabase/tests/011_identity_review_control_plane.sql`.
- Assert direct authenticated writes are denied.
- Assert contributor ownership/adult/source rules.
- Assert reviewer trust, recusal and role revocation rules.
- Assert idempotency, one active proposal, terminal immutability and atomic sighting linkage.
- Run the focused database test and retain the expected red result.

## Task 2: Implement the database control plane

- Add a new forward migration; do not rewrite released migration history.
- Add constraints/indexes/private request ledger/append-only trigger.
- Add contributor and trusted-reviewer RPCs with narrow return types.
- Revoke direct mutation and grant only RPC execution.
- Run focused pgTAP until green, then all database tests.

## Task 3: Make native policies mandatory

- Add a red root script-contract test proving root `verify` invokes both mobile policy validators.
- Add a `validate:pilot-policies` root script and wire it into `verify` before build.
- Run the script contract, both validators and mobile tests.

## Task 4: Reconcile boundary documentation

- Correct the product charter's implementation/evidence wording.
- Correct the architecture storage boundary.
- Record the identity control plane as implemented without claiming a real model or pilot readiness.
- Reconcile the AI token example name without adding a credential.

## Task 5: Verify and review

- Run focused tests, fresh local Supabase Gate 2A, Python lint/type checks and forced root verification.
- Run independent security/code review.
- Fix verified findings with focused regression tests.
- Commit reviewable changes, push the feature branch and require green GitHub Actions.

