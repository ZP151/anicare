# Development and operations

This guide collects the configuration and operational contracts previously in
the root README. Start with the [quick start](../../README.md#quick-start);
use synthetic data and your own development environment. Recorded hosted
verification is scoped to its source and expiry, not a reusable deployment grant.

## Environment and backend

Use [`.env.example`](../../.env.example) as the variable inventory. Mobile
configuration belongs in `apps/mobile/.env.local` and Admin configuration in
`apps/admin/.env.local`, or in the process environment of the corresponding
app. Set Edge Function secrets in the trusted Supabase runtime; a root `.env`
file does not automatically configure hosted functions. Never copy server
secrets into mobile configuration.

| Runtime | Settings |
| --- | --- |
| Mobile | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`; an actual `EXPO_PUBLIC_RIGHTS_CONTACT_URL` before real-user use. |
| Admin | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ADMIN_APP_URL`; server-only `SUPABASE_SERVICE_ROLE_KEY` for protected review media and account erasure. |
| Report/media Edge Functions | `PRECISE_LOCATION_ENCRYPTION_KEY`, `MEDIA_ALLOWED_ORIGIN`, `MEDIA_PUBLIC_SUPABASE_ORIGIN`, plus the functions' required Supabase runtime credentials. |
| Optional AI service | `AWS_REGION`, `WHISKER_INTERNAL_AI_TOKEN`; identity assistance remains disabled unless explicitly enabled as described below. |

Configure an isolated Supabase project with the checked-in
[migrations](../../supabase/migrations) and required
[Edge Functions](../../supabase/functions). The [Gate 2A runner](../../scripts/run-pilot-gate-2a.mjs)
starts and verifies a local stack; the [hosted runbook](hosted-gate-2b.md)
documents protected hosted deployment and verification. Installing JavaScript
dependencies alone does not provision a backend.

`PRECISE_LOCATION_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Never
reuse keys across environments. Set `MEDIA_ALLOWED_ORIGIN` to one trusted web
origin; it controls CORS. Set `MEDIA_PUBLIC_SUPABASE_ORIGIN` to the exact public
Supabase API origin trusted by clients (scheme, host and optional port only).
Native requests have no `Origin` header and are authenticated normally;
browser requests from an absent or different allowed origin are rejected.

Configure `animalhelper://**` as an allowed Supabase Auth redirect for native
sign-in. Apple/Google sign-in also requires those providers to be enabled and
configured; UI support does not mean the providers are live. The recorded
development environment has email sign-in verified, with Apple/Google not
enabled in the [0.4.4 delivery record](../reviews/2026-09-12-v6-r044-device-followup.md).

## Location retention and private report media

Invoke `private.apply_location_retention()` and
`private.purge_expired_location_grants()` daily from a trusted database
scheduler; only `service_role` can execute them. Invoke `cleanup-media-staging`
from the trusted scheduler with its service credential. It retains active
quarantined-job metadata for later deletion, handles orphaned private staging
jobs, and waits through signed-upload replay windows before physical deletion.

The client-facing `uploadCredentialUsableUntil` is a conservative pre-mint
lower bound, not the exact storage-token expiry. A durable `quarantined` result
remains private. Public promotion of report media stays disabled pending
trusted residual validation; client attestation alone cannot permit it.

## Community media maintenance

Community post media has a separate lifecycle from private sighting media.
Deploy `cleanup-community-media` with the other required handlers. The
[protected GitHub workflow](../../.github/workflows/community-media-cleanup.yml)
is a **manual** maintenance path using the environment's server-only service
credential. Its historical comment about a future R4 scheduler predates the
database scheduler described here.

The unattended path was delivered in 0.4.13: `pg_cron` invokes a private
function every 15 minutes; `pg_net` calls the fixed cleanup endpoint using
short-lived HMAC authentication backed by Vault and the Edge runtime. The
[provisioner](../../scripts/community-cleanup-provision.mjs) is integrated into
the protected hosted deployment. Configure/deploy the Edge secret and handler
before activating the matching Vault configuration.

The handler claims expired unbound or deletion-pending jobs and excludes
attached live media. The [delivery record](../reviews/2026-09-13-v6-r0413-core-continuation.md)
documents hosted expiry checks, exact-object recovery, replay bounds and
remaining operational limits. Those checks do not establish long-term
scheduler monitoring.

When `create_community_post_with_media` returns PostgreSQL `P0001` with exact
message `community_media_expired`, no post or post idempotency result was
created for that actor/request ID; exact prior publication replay is checked
first. Preserve the draft, reopen editing only for this error, reserve/finalize
replacement media with new media request IDs, and publish with a new post
request ID. Do not apply this recovery to `community_media_not_available` or
`idempotency_conflict`.

## Identity review

`/identity` in Admin is available to independently eligible trusted
contributors, area stewards and platform admins, scoped by area and recusal
rules. The ordinary platform administration entry remains platform-admin only.

The Admin media proxy needs its own server-side `SUPABASE_SERVICE_ROLE_KEY`.
Never prefix it with `NEXT_PUBLIC_` or place it in mobile/browser configuration.
Missing configuration makes the proxy unavailable; it does not fall back to a
public Storage URL.

## Rights and account erasure

`/rights` is an authenticated Admin intake queue. An active platform admin can
move requests to review, request a new identity proposal, or close intake.
These actions do not merge cats or change identity decisions.

Account deletion uses the server-only service credential to claim an
owner-requested erasure, query/delete the Auth user, invoke
`cleanup-media-staging`, `cleanup-legacy-media`, `cleanup-profile-avatars` and
`cleanup-community-media`, then reconcile their cleanup jobs. Deploy those
handlers to the same project with their required runtime settings. Only an
authorised Admin Server Action invokes this flow; mobile never receives the
service credential or Auth target UUID.

The queue shows the durable `finish_account_erasure` result: `completed`,
`cleanup pending` or `retryable`. Revisit pending items and retry cleanup until
the database reports convergence. Storage credential lifetime and terminal
legacy failures still prevent premature completion.

Set `EXPO_PUBLIC_RIGHTS_CONTACT_URL` to an **operated** HTTPS contact page or
`mailto:` address before real-user use. The example is intentionally empty.
Without it, the UI says external contact is unavailable; the authenticated
queue still receives requests, but post-deletion contact acceptance is
incomplete. A saved local receipt is not deletion completion or anonymous
status access. The operating owner, response commitment and contact channel
must be supplied by the project operator.

## AI boundary

The internal identity route requires both the exact non-secret
`WHISKER_AI_IDENTITY_ASSISTANCE_ENABLED=true` flag and the secret
`WHISKER_INTERNAL_AI_TOKEN` at its ASGI boundary. This activates only the
synthetic/model-free compatibility contract, not live cat-face inference.
Leave it disabled for normal product development.

The [offline experiment](../../services/ai/OFFLINE_EVALUATION.md) does not enable
product AI. Real evaluation needs a licensed, consented, labelled and held-out
dataset before testing the charter's Recall@3 ≥85%, unknown rejection ≥80%,
and likely false matches on unknown cats ≤5% targets. Synthetic tests establish
none of those production results.
