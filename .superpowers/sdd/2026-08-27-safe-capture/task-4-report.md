# Task 4 Report: Narrow feed, reporting and blocking

## Status

Implemented from base `f061d8249da34176eda016bc3ca0eaab2e3135e5` in the requested Task 4 commit. No deployment or external mutation was performed.

## Delivered

- Added a strict mobile `listPublicSightings` wrapper over `list_public_sighting_feed`. Requests accept only a UUID cursor and clamped page size; responses reject every unexpected field rather than stripping it.
- Added strict mobile `reportContent`, `blockUser`, and `unblockUser` wrappers. Actor and moderation operational fields are absent from client payloads.
- Replaced the configured Nearby and Map demo rendering paths with the narrow feed wrapper. Missing configuration is explicitly labelled demo/unavailable, configured failures do not display synthetic data as live, and the map is a coarse-cell list without precise markers.
- Added a `SECURITY DEFINER` feed function with a fixed `pg_catalog` search path, delayed/public/normal-or-sensitive filtering, public-animal gating, mutual block filtering, deterministic `visible_at DESC, id DESC` internal ordering, and an opaque UUID keyset cursor. Exact timestamps are used only inside the function and are never returned.
- The feed returns exactly `sightingId`, `animalId`, `primaryAlias`, `verification`, `publicCellId`, server-derived `timeBucket`, nullable `coverMediaId`, and `cursor`.
- `coverMediaId` deliberately remains `NULL`: Task 3 constrains every media row to `quarantined`, so the current schema has no safely published media ID to expose.
- Removed the legacy `public_animal_feed` view, which contained an exact visibility timestamp and storage path.
- Revoked anonymous/authenticated raw access and removed direct policies for animals, aliases, animal events, sightings, care events, media assets, moderation reports, and user blocks. Service-role table access and existing trusted function paths remain available.
- Added server-owned report policy: authenticated adult contributor, strict target/reason/detail validation, derived author/user target, risk, status, SLA, optional critical-reason auto-hide, UUID request idempotency, and transactional non-sensitive audit events.
- Added actor-derived block/unblock functions with no self-block, generic unavailable-target failures, caller-owned mutation only, cross-operation request conflict detection, mutual feed exclusion, and exactly-once audit writes per accepted request UUID.
- Added a private UUID idempotency ledger containing only a SHA-256 payload fingerprint, never report detail.

No report/block controls were added to the feed screens. The safe projection intentionally omits author IDs, so it cannot soundly offer a block target, and Task 4 has no authenticated reason-selection/report confirmation flow. The typed wrappers are ready for a later safe action surface.

## TDD and verification evidence

- RED: `pnpm --filter @animalhelper/mobile test -- feed.test.ts safety.test.ts` failed because both new API modules were absent.
- GREEN: the same focused command passed 25 tests.
- RED: feed screen tests failed against the old always-synthetic Nearby/Map screens.
- GREEN: `pnpm --filter @animalhelper/mobile test -- feed-screens.test.tsx` passed 2 tests.
- `pnpm --filter @animalhelper/mobile typecheck` passed.
- `pnpm --filter @animalhelper/mobile test` passed 26 suites and 165 tests.
- Full workspace verification and `git diff --check` are run immediately before commit and reported in the parent handoff.

## Database gate

`supabase/tests/003_public_and_safety_rpcs.sql` was written before the migration and contains 57 pgTAP assertions covering role impersonation, raw privilege denial, exact feed projection, delay/critical exclusion, coarse time values, UUID cursor behavior, forged signature fields, adult/provisional behavior, target failures, allow-lists, idempotency conflicts, owner-only unblock behavior, block feed effects, and exactly-once audit writes.

The SQL test suite was not executed locally because this workspace has no `supabase`, Docker, or `psql` executable. Database verification therefore remains a mandatory CI/Supabase-runtime gate; this branch is not represented as deployed or pilot-ready.

## Fix round 1: cursor privacy and pagination

- Cursor resolution now applies the same mutual-block predicate as feed row selection. If either the caller or the sighting author has blocked the other, that sighting UUID fails generically with `invalid_feed_cursor`; it cannot reveal relative ordering or produce a page. Anonymous cursor behavior is unchanged.
- Added constraint-valid sightings with identical `visible_at` values. The pgTAP contract verifies deterministic UUID-descending tie-breaking, limit-two ordering, concatenated limit-one pages without gaps or duplicates, and exclusion of the cursor row.
- Added both caller-blocked-author and author-blocked-caller cursor tests after their respective block mutations.

Concurrent idempotency remains a mandatory database-runtime test and is intentionally not simulated inside single-session pgTAP. A Supabase/PostgreSQL-capable gate must open two sessions and verify: (1) simultaneous matching calls with the same actor/request UUID produce one mutation, one result, and one audit event; and (2) simultaneous cross-operation reuse of the same actor/request UUID yields one accepted operation and one deterministic `idempotency_conflict`. The transaction-scoped advisory lock remains in the migration, but its concurrency behavior is not claimed as locally executed.
