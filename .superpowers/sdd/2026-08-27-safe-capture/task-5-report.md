# Task 5 report — authenticated audited moderation console

## Delivered

- Added a publishable-key-only Supabase SSR client that uses Next 16's `await cookies()` API and the current `getAll`/`setAll` cookie interface.
- Replaced the static admin mock with dynamic, fail-closed authenticated states and a safe moderation queue. The console has no role, appeal, break-glass, audit-log, media, or location controls.
- Added `getUser()` session validation followed by the narrow `admin_has_active_platform_admin` RPC. Missing configuration, unauthenticated, and unauthorised states do not fetch a queue or expose actions.
- Added exact-key RPC wrappers and exact-form-field action validation. Actions create their request UUID server-side, re-authorise, revalidate, and redirect; they never trust a browser actor value.
- Added non-enumerating email-link login and a PKCE callback that accepts only `/` as its relative post-login destination.
- Added the append-only `public.moderation_actions` log, private request-idempotency ledger and private service-managed restoration holds. Fixed-path SECURITY DEFINER RPCs provide safe queue/detail projections and transactional audit/action resolution with recusal and active platform-admin checks.
- Added pgTAP coverage for caller roles, raw-table restrictions, queue/detail/resolve access, reporter/author/target recusal, idempotency, action effects, invalid input, restore holds, and a revoked grant between read and action.

## Red/green evidence

The initial focused admin test run was red because `admin-session` did not yet exist. After the implementation, focused admin tests passed (16 tests), the admin typecheck passed, and the admin production build passed.

## Verification

- `pnpm --filter @animalhelper/admin test` — passed: 16 tests.
- `pnpm --filter @animalhelper/admin typecheck` — passed.
- `pnpm --filter @animalhelper/admin build` — passed.
- `pnpm verify` — completed lint/typecheck/test/build; the logs confirm all workspace builds, including the admin Next build, mobile export, and edge-function TypeScript build.
- `git diff --check` — passed.
- Admin source scan found no service-key environment reference and no broad `.from(...)` table access.

## Explicit database-runtime gate

This workspace currently has no `supabase` CLI, `pg_prove`, Docker, or reachable SQL test runner. The pgTAP suite at `supabase/tests/004_moderation_actions.sql` was written before the migration but could not be executed locally. Apply the migration and run the Supabase pgTAP suite in a provisioned database before deployment.

## Scope

No deployment was performed.
