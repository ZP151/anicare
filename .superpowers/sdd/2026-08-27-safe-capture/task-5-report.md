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

## Review-fix round 1

- Added durable source-owned sighting holds. A hide resolution creates a manual hold for its report; each `auto_hidden` sighting report receives an auto-hide hold via trigger, with existing auto-hidden reports seeded by the migration. Restoration is fail-closed: it can release only its own auto-hide hold, never changes `archived` or `public` visibility, and returns content at most to `limited` when no active holds remain.
- Added the service-role-only, audited `set_sighting_restore_hold` RPC for operational legal/safety hold creation and release. It has no admin-console surface. Existing duplicate generic hold rows are safely retired before the new active source key is installed.
- Updated pgTAP fixtures to reset to the test owner before all raw audit/action/sighting assertions. Added a dedicated hold suite covering two-report isolation, archival preservation, legal holds, released and expired holds, auto-hide trigger, source key, and service-only permissions. The plan/assertion counts are statically coherent: 43 in `004_moderation_actions.sql`, 19 in `005_moderation_hold_safety.sql`.
- Added the official Next 16 `proxy.ts` refresh boundary using Supabase SSR cookie propagation. Server Components use a read-only client; callback and server actions use a writable client that does not swallow cookie-write failures.
- Tightened session classification: configuration/client/getUser/RPC failures are unavailable; only a clean no-user response redirects to login, a clean false capability is unauthorised, and a true capability is authorised. Added `ADMIN_APP_URL` documentation and canonical HTTPS/localhost validation; magic links use `shouldCreateUser: false` and never trust request origin.
- Added `server-only` boundaries to the server DAL/session modules, safe generic action failure redirects, accepted `appealed`/`closed` mapper statuses, and removed the unrelated Next/types/turbo lockfile refreshes. The remaining lockfile diff is limited to the Supabase SSR graph and explicit `server-only` importer.

### Review-fix verification

- Focused RED: malformed `getUser()` data was initially classified as unauthenticated (1 failing test), then fixed.
- Focused GREEN: `pnpm --filter @animalhelper/admin test -- moderation-api.test.ts proxy.test.ts` — 29 tests passed; admin typecheck passed.
- `pnpm --filter @animalhelper/admin build` — passed, including the Next 16 Proxy route.
- `pnpm install --lockfile-only --offline --frozen-lockfile` — passed after lockfile cleanup.
- `pnpm verify` — passed all workspace lint, typecheck, test, and build tasks; the admin suite passed 29 tests and the build ran on Next 16.3.2.
- `git diff --check` — passed.

### Review-fix database-runtime gate

The local SQL runner remains unavailable: no Supabase CLI, PostgreSQL client/pgTAP runner, Docker daemon, or provisioned database is present. The new migration and pgTAP suites have therefore not executed here; they remain a required pre-deployment database gate. No deployment was performed.
