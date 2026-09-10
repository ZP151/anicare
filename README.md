# WhiskerCommons

WhiskerCommons is a privacy-first, free community-cat identity and care record platform for a closed Singapore pilot. It treats AI as a review aid, never as an automatic identity authority.

Current product status (2026-09-07): [functional review](docs/reviews/2026-09-07-product-delivery-review.md),
[iteration roadmap v3](docs/iteration-roadmap-v3.md), [product goals](docs/product-goals.md),
and [regression playbook](docs/regression-playbook.md).
Next: report-to-identity creation/review and useful care history. AI remains an
unproven, optional assistance capability. Historical hosted evidence, evidence
consumption and iOS build work retain their release boundaries; they do not block
unrelated local feature development. These changes are not yet integrated into main.

Fast local behavior regression: `pnpm test:product-core`. Required CI still runs
the complete root verification and the independent database integration job.

## Current implementation

WhiskerCommons is the display brand only. Existing package scopes, Python import
path, OAuth scheme, bundle identifiers, database identifiers and offline-key
names remain compatible technical identifiers.

- Expo SDK 57 mobile app with Nearby, Map, Report, Following and Profile tabs,
  bilingual navigation, and platform-adaptive Liquid Glass/fallbacks.
- Manual opaque-mask review, canonical JPEG rendering and encrypted local
  reviewed-media recovery. Automatic person, licence-plate and cat detectors,
  and native-device execution, are not implemented release gates.
- SQLCipher offline report drafts whose stored form excludes coordinates and
  access tokens, plus local reviewed-media receipt/journal boundaries. Native
  report submission now recovers a stable sighting by its draft ID, appends the
  immutable sighting ID, and drives private media retry through the local CAS
  coordinator; supported-device validation remains a release gate.
- Backend private Supabase staging/quarantine, cleanup contracts and strict JPEG
  marker validation, plus authenticated native artifact access and the
  reserve-to-signed-upload-to-finalize wiring, are implemented. Hosted/native
  redirect coverage and true post-storage-token-expiry cleanup/replay remain
  required before release. No media is promoted to public storage: a durable
  `quarantined` result is private and is not public availability.
- Narrow public-feed/report/block contracts and an authenticated, audited admin
  contract. Their non-media database runtime verification and two-session
  concurrency remain required gates.
- Versioned, model-free AI contracts for crops, embeddings, callbacks and public
  results, plus synthetic evaluation fixtures. The internal identify route is
  disabled by default and requires both the exact non-secret
  `WHISKER_AI_IDENTITY_ASSISTANCE_ENABLED=true` flag and the secret
  `WHISKER_INTERNAL_AI_TOKEN` at its ASGI boundary. Enabling this compatibility
  route activates only the synthetic/model-free contract, not live cat-face
  inference. There are no model weights, labelled dataset, ANN, queue, real
  callback, or production accuracy claim.

The UI includes synthetic demo/fallback content and configured RPC-backed feed,
report and authenticated admin paths. Those integrations do not establish
production or physical-device readiness. Use synthetic data for current
validation; this repository does not claim pilot readiness.

## Requirements

- Node.js 22+
- pnpm 11.19
- Python 3.12–3.13 for the AI service
- Docker Desktop, Supabase CLI and Deno for local database/Edge contract checks

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @animalhelper/mobile dev
pnpm --filter @animalhelper/admin dev
```

For the AI HTTP service:

```bash
python -m pip install -e "services/ai[dev]"
pnpm --filter @animalhelper/ai dev
```

Copy `.env.example` to a local untracked environment file and populate it with development-only values. `PRECISE_LOCATION_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Never reuse keys across environments. Set `MEDIA_ALLOWED_ORIGIN` to the single trusted web origin for media Edge Functions; it is used only for CORS. Set the non-secret `MEDIA_PUBLIC_SUPABASE_ORIGIN` to the exact public Supabase API origin trusted by clients (scheme, host, and optional port only). Native requests have no `Origin` header and are authenticated normally, but browsers from an absent or different origin are rejected.

Configure `animalhelper://**` as an allowed Supabase Auth redirect and enable the Apple/Google providers before testing social sign-in. Invoke `private.apply_location_retention()` and `private.purge_expired_location_grants()` daily from a trusted database scheduler; only `service_role` can execute them. Invoke `cleanup-media-staging` from the same trusted scheduler with its service credential: it retains active quarantined-job metadata for later deletion, handles orphaned private staging jobs, and waits through signed-upload replay windows before physical deletion. Its client-facing `uploadCredentialUsableUntil` is a conservative pre-mint lower bound, never a claim that the token expires at that exact instant.

Deploy the cleanup handler with an authenticated Supabase CLI, then keep [`.github/workflows/community-media-cleanup.yml`](.github/workflows/community-media-cleanup.yml) enabled on the default branch:

```bash
supabase functions deploy cleanup-community-media --project-ref fhugdtpjbgiatqhvjioy --use-docker
```

The workflow provides manual cleanup from the protected `hosted-gate-2b` environment using its existing server-only `SUPABASE_SERVICE_ROLE_KEY`. It requires the environment's existing review; unattended scheduling is pending R4 and is not enabled. The handler only claims expired unbound or deletion-pending jobs, so attached live media is excluded. R4 will configure a Vault-backed database scheduler through the authorized deployment runtime, without recurring GitHub approval requests.

## Safety invariants

- Public clients receive H3 r9 cells, not latitude/longitude.
- Normal sightings appear after two hours, sensitive sightings after 24 hours, and critical sightings remain hidden for review.
- Contributor AI selections remain tentative until an independent trusted review.
- Public responses use confidence bands and reasons; internal numeric scores are not exposed.
- Selected source-image bytes are never uploaded. Only a newly rendered JPEG
  tied to a valid review receipt may enter private staging; public media
  promotion is disabled.
- Offline drafts never persist coordinates; location is requested again only at explicit submission time.
- Production precise-location access is task-specific, expires within 24 hours and is audited.

## Repository map

- `apps/mobile` — Expo mobile client
- `apps/admin` — private operations console
- `packages/domain` — shared privacy and governance behavior
- `supabase` — migrations, pgTAP tests and Edge Functions
- `services/ai` — candidate fusion, evaluation and Lambda/FastAPI entrypoint

## Release gates

Gate 2A evidence and the remaining gates that still block pilot-ready status
are:

- The protected Hosted Gate 2B producer and its local promotion validator are
  implemented; see the [operator runbook](docs/runbooks/hosted-gate-2b.md).
  The real [run 33784288981](https://github.com/ZP151/anicare/actions/runs/33784288981)
  passed correctness, cleanup and evidence issuance at `6797215`. The evidence
  consumer currently rejects the actual signing issuer; canonical 72-hour
  evidence has not been committed. Delivery readiness remains blocked until
  that consumer is fixed and validated evidence is promoted while fresh.

- The experimental Windows [iOS free-account device-test runbook](docs/runbooks/ios-free-account-device-test.md)
  and its [empty physical evidence template](docs/evidence/ios-device-physical-test-template.md)
  are handoff material only. They fail closed until a protected unsigned
  candidate's provenance and checksum are verified, retain Apple Account and
  device identifiers locally, and do not claim Gate 2B, candidate, installation,
  or physical-device completion.

- Gate 2A media proof is complete for local-stack HTTP/Auth/Storage composition
  with two synthetic sessions, evidenced on the fresh GitHub Actions run
  [33208195906](https://github.com/ZP151/anicare/actions/runs/33208195906) with both
  required jobs green:
  [verify](https://github.com/ZP151/anicare/actions/runs/33208195906/job/98974573537)
  and
  [database-contracts](https://github.com/ZP151/anicare/actions/runs/33208195906/job/98974573765).
- Build and test the manual review flow on supported native devices. Automatic
  person, licence-plate and cat detection remain disabled until device, model,
  licence and adversarial-corpus gates pass.
- Keep public media promotion disabled until trusted server-side residual checks
  are implemented and verified. Client attestation alone never permits it.
- Exercise the authenticated artifact reader and complete
  reserve-to-signed-upload-to-finalize media transport on hosted or native
  paths, including redirects, capability expiry and cleanup races. Local unit
  coverage and local-stack CI are not a substitute for that completion.
- Validate true post-storage-token-expiry cleanup and replay behavior in Gate 2B.
- Complete non-media and cross-functional gates: feed/report/admin runtime,
  legal/compliance operations, Singapore legal structures, real-user/test-data
  policy, and production AI accuracy evidence on consented data.
- Use a qualified, consented labelled dataset before evaluating Recall@3 at
  least 85%, unknown rejection at least 80%, and likely false matches on unknown
  cats at most 5%. Current evaluation is synthetic only and establishes no
  production accuracy result.

### 身份审核工作台的服务端配置

`/identity` 供具有有效 trusted contributor、area steward 或 platform admin 授权的独立审核者使用。普通平台管理入口仍限定 platform admin；身份审核按授权区域及回避规则返回队列。

Admin 服务端媒体代理还需在它自己的服务端环境设置 `SUPABASE_SERVICE_ROLE_KEY`。该变量仅用于读取已授权的审核素材，不得加 `NEXT_PUBLIC_` 前缀，也不得写入移动端或浏览器环境。缺少配置时素材代理返回不可用；工作台不提供公开 Storage URL。已有本地/托管密钥由运行环境提供，不在仓库保存。

### Rights and account erasure operations

`/rights` in Admin is a real authenticated intake queue. An active platform admin can move human requests to review, request a new identity proposal, or close intake. These actions do not merge cats or change identity decisions.

Account deletion processing additionally uses the server-only `SUPABASE_SERVICE_ROLE_KEY` to claim the owner-requested erasure, query/delete the Auth user, call the existing `cleanup-media-staging`, `cleanup-legacy-media`, `cleanup-profile-avatars`, and `cleanup-community-media` handlers, and reconcile linked cleanup jobs. Deploy those handlers to the same project and configure their existing required runtime settings. Only an authorized Admin Server Action invokes this flow; the mobile app never receives service credentials or an Auth target UUID. The queue displays the exact durable result from `finish_account_erasure` (`completed`, `cleanup pending`, or `retryable`) rather than treating invocation as completion. Revisit pending items and retry cleanup until the DB reports convergence. Storage credential lifetime and terminal legacy failures still prevent premature completion.

When `create_community_post_with_media` returns PostgreSQL error `P0001` with message `community_media_expired`, it guarantees that no post or post idempotency result was created for that actor and request ID; exact prior publication replay is checked first. Preserve the draft, reopen editing only for that exact error, reserve/finalize replacement media with new media request IDs, then publish using a new post request ID. Do not use this recovery path for `community_media_not_available` or `idempotency_conflict`.

Set mobile `EXPO_PUBLIC_RIGHTS_CONTACT_URL` to an **actual operated** HTTPS contact page or `mailto:` address before real-user use. The example is intentionally empty. Without it, the UI states that external contact is unavailable; the authenticated queue still receives requests, but post-deletion contact acceptance is incomplete. A saved local receipt is not proof of deletion completion and grants no anonymous status access. The operating owner/SLA and real contact channel remain product inputs, not generated addresses.

The offline AI experiment is documented in [services/ai/OFFLINE_EVALUATION.md](services/ai/OFFLINE_EVALUATION.md). It does not enable product AI or replace a licensed identity dataset and held-out evaluation.
