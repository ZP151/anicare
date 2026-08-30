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
  validation and native reserve-to-signed-upload-to-finalize artifact transport
  are implemented; an authenticated reviewer artifact reader is not yet
  implemented. A `quarantined`
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

Exit gate: implement and repeat an authenticated reviewer artifact reader and
the reserve-to-signed-upload-to-finalize flow on hosted Supabase and supported
native devices, including true post-token-expiry cleanup/replay; then complete
adversarial redaction, residual-detector/public-promotion, public-projection and
the non-media two-session concurrency checks. Do not label the branch
pilot-ready before those checks.

## Sprint 3A — complete mobile product surfaces (planned, required)

The five-tab shell is not an application-completeness claim. Current visual
evidence shows one demo cat on Nearby, two demo cells on Map, an empty Following
screen, a long form on Profile and a mostly connected Report foundation. Before
adding more standalone screens, define and implement the following coherent
page map so every main tab supports a useful task, a next action and a way back.

### Nearby and cat detail

- Replace the single demo card with a privacy-safe feed supporting loading,
  empty, offline, error and stale-data states.
- Add bounded search plus filters for coarse area, recent activity, confirmed
  identity and visible care needs; make sort/filter state clear and resettable.
- Give every cat summary a real next step: open the cat profile, follow/unfollow,
  add a new sighting or report incorrect public information.
- Add a cat-detail route with public alias and traits, identity/review status,
  privacy-safe recent sightings, care timeline, coarse area, follow state and
  contribution entry points. Never expose exact locations or private evidence.

### Community map and area detail

- Use Google Maps Platform through the native Maps SDKs as the production
  basemap on iOS and Android. Inject separate restricted keys at native build
  time, keep Google attribution visible, and never commit the keys. Google map
  content is context only: do not plot exact cat pins, center the camera on a
  sighting or user coordinate, expose routes, or persist Google content. The
  art-directed atlas remains a visibly labelled fallback for web, offline,
  missing-key and provider-unavailable states.
- Implement a coarse-cell map/list switch, legend, visible time-window label,
  recenter action and the same safety filters as Nearby.
- Make a cell selection open an area-detail surface with delayed aggregate
  activity, cats safe to show, follow/unfollow and report-from-area actions.
- Provide a manual coarse-area fallback when location permission is denied and
  explain why the product never offers exact public pins or turn-by-turn routes.
- Cover loading, no-visible-activity, offline, permission-denied and unavailable
  map-provider states without collapsing to a blank panel.

### Report and identity continuation

- Turn Report into an explicit, resumable sequence: source photo, privacy review,
  traits/condition, safety sensitivity, one-time location or manual coarse area,
  final review, submit and receipt.
- Add replace/retake/remove-photo, draft save/resume/delete, retry and submission
  status. A media failure must not lose the text sighting or trap the user.
- Preserve `sightingId + mediaAssetId` after quarantine and offer optional,
  purpose-specific identity assistance. Skip, cancel, no-match and later resume
  must remain first-class paths and separate from AI-training consent.
- Add a completion screen and My reports entry so users can see moderation,
  identity-review and deletion status instead of submitting into a dead end.

### Following and privacy-safe updates

- Replace the permanent empty card with onboarding actions and separate followed
  cats, followed areas and update views.
- Add privacy-safe activity items, unread/read state, filters, notification
  preferences and unfollow controls. Push payloads must contain no location.
- Support loading, empty, offline, revoked/hidden content and notification-denied
  states, with a clear route back to discovery.

### Profile, account and trust

- Separate anonymous, signed-in and contributor-eligible states instead of
  presenting all account controls as one long card stack.
- Add My reports, saved drafts/recovery, notification settings, blocked users,
  language, accessibility preferences and trusted-role status.
- Add purpose-specific AI-assistance history plus separate training-consent
  status, withdrawal, data access/correction, account deletion and sign-out.
- Surface privacy notice, community rules, help/safety contact and DPO contact
  without mixing legal text into the primary contribution action.

### Cross-page completeness gate

- Maintain a route-and-state inventory covering entry, success, loading, empty,
  offline, validation, authentication expiry, permission denial and deletion for
  each primary task.
- Every visible control must work against a real contract or be visibly disabled
  with a reason; placeholder buttons, decorative toggles and dead-end cards fail
  the gate.
- Navigation, back behavior, deep links and foreground recovery must preserve
  the user's safe context across Nearby, Map, Report, Following and Profile.
- Use realistic privacy-safe fixtures until hosted data is connected, but label
  fixture state once per surface rather than repeating engineering/demo copy in
  the content hierarchy.
- Test the core journeys at phone widths, large text and screen-reader semantics;
  retain the existing privacy, erasure and idempotency contracts.

Exit gate: all five tabs have an approved function/state map, each primary
journey is runnable without a dead end, visible controls are contract-backed,
and route/component tests cover the success plus highest-risk recovery states.
This track can run in parallel with AI control-plane A1, but it must finish
before the user-facing AI/admin A2 slice is called complete.

## Sprint 3B — human-designed visual system and interaction quality (planned, required)

The current baseline is intentionally functional but visually reads as an
AI-generated prototype: repeated large headings and explanatory subtitles,
uniform rounded cards, a nearly monochrome green palette, Emoji/text-symbol
icons, low real-content density and generic empty states. Treat visual quality
as a release gate, not as an end-of-project polish pass.

- Run Impeccable `init/document/critique/distill/polish/harden/adapt` against the
  existing product before redesigning screens. Keep its shared design context in
  version control and its runtime screenshots/cache out of Git.
- Use Emil Kowalski's `emil-design-eng`, `apple-design`, `animate-expo`,
  `prototype`, `find-animation-opportunities`, `review-animations` and
  `improve-animations` skills for visual direction, native motion and review.
  `write-swift` and `ask-sonner` are installed but are not default dependencies
  for this Expo mobile application.
- Prototype three genuinely different mobile visual directions from the complete
  page/function map, then require explicit product approval of one direction
  before broad UI implementation. Do not use a new direction to change privacy
  or governance behavior.
- Establish a small token system for typography, spacing, colour, elevation,
  shape, iconography, motion and semantic states. Prefer fewer containers and
  stronger grouping over wrapping every sentence or control in another card.
- Replace Emoji and text-symbol controls with one accessible native-capable icon
  family; use licensed, consented cat imagery or deliberately art-directed
  illustrations rather than placeholders.
- Preserve iOS liquid-glass as progressive enhancement for navigation and a few
  high-value controls, not as a universal surface treatment. Supply Android and
  reduced-transparency fallbacks with equivalent hierarchy and contrast.
- Motion must explain navigation, state change or direct manipulation; keep it
  off the JS thread where possible, avoid bounce/elastic decoration, respect
  reduced motion and verify interruption/rapid-tap behavior.
- Remove template-like copy, repeated safety disclaimers and oversized hero
  treatment from routine task screens. Keep safety information contextual,
  concise and available at the decision where it matters.
- Audit touch targets, Dynamic Type/reflow, colour contrast, focus order,
  screen-reader labels, error recovery and one-handed reach before visual signoff.
- Add stable screenshot states and run the Impeccable detector plus animation
  review in CI or a documented pre-merge check. High-severity AI-slop,
  accessibility or broken-state findings block screen completion.

Exit gate: one visual direction and token system are approved; all core screens
have real content hierarchy and purposeful actions; no main page is an isolated
demo shell; liquid glass has accessible fallbacks; and screen-by-screen
Impeccable, animation, accessibility and visual-regression reviews are recorded.

## Sprint 4–5 — AI identity alpha contracts (dormant schema foundation)

- Strict crop, embedding, callback and public-result contracts, synthetic
  evaluation fixtures and a fail-closed internal identify route are implemented.
- The database identity control plane now separates contributor manual/new-cat
  proposals from service-only AI provenance, denies direct authenticated
  mutations, enforces independent reviewer recusal, records idempotent
  append-only decisions and atomically links a sighting only after confirmation.
- The dormant private identity-assistance job, candidate, bounded-ledger,
  event/access-aggregation and proposal-evidence schema foundation exists with
  no direct table access. Contributor request/status/cancel/select RPCs,
  broker claim/complete/fail/cleanup RPCs, lease-bound media fetch,
  erasure/concurrency integration and the callback adapter remain open.
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

1. Approve the five-tab function/state inventory and one non-generic mobile
   visual direction, then implement Sprint 3A/3B in vertical journeys rather
   than accumulating more isolated shell pages.
2. Approve the provenance-bound AI identity-assistance written specification
   and implement its disabled-by-default A1 data/service control plane; do not
   expose A2 mobile/admin UI before the Sprint 3A/3B gates are met.
3. Run hosted Supabase Gate 2B and native end-to-end media checks, including
   true post-token-expiry cleanup/replay, then finish non-media two-session
   concurrency verification.
4. Complete supported native-device review/recovery testing and automatic
   detector/residual-validation release work.
5. Provision a real development environment and exercise the audited
   admin/report/block contracts against it.
6. Approve the dataset source/licence/consent/withdrawal rules, curate a
   consented labelled cat dataset, and build an offline held-out benchmark
   before any live inference/ANN/callback pipeline.
7. Complete Singapore legal, privacy, app-store-signing and incident-operation
   launch gates.
