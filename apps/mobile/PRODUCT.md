# Whisker Commons Mobile Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Expo SDK 57, React Native 0.86, React 19, Expo Router, TypeScript, Supabase,
Reanimated 4, Gesture Handler, Skia, Expo Glass Effect and Expo Blur. The app
ships one product that adapts its material and interaction language for iOS and
Android; Expo Web is a development and visual-audit surface, not the primary
product.

## Users

Primary users are adult residents and volunteer community-cat caregivers in
Singapore. They use the app outdoors or between daily tasks to discover
privacy-safe community-cat activity, recognize a cat, record a sighting, follow
cats or coarse areas, and understand what happened to their contribution.

Platform administrators and trusted community reviewers are supporting users.
They review sensitive content and identity proposals independently; they are
not the default audience for the mobile app.

## Product Purpose

Whisker Commons is a free-first community platform for identifying and caring
for community cats without publishing exact locations or unreviewed evidence.
Success means a resident can move from nearby discovery to a useful, safe
contribution and receive a clear outcome, while caregivers gain reliable
privacy-safe continuity across sightings.

## Positioning

The product combines a delayed, coarse public view of community-cat activity
with a private evidence pipeline and human-confirmed identity ledger. AI may
suggest possible matches, but it cannot confirm identity or bypass contributor
choice and independent review.

## Operating Context

- Browsing is available without an account; contribution requires sign-in and
  adult eligibility confirmation without collecting date of birth.
- The primary journey is Nearby or Map discovery, cat detail, follow or report,
  private photo review and redaction, one-time location or manual coarse area,
  submission receipt, optional identity assistance, and later status tracking.
- Public activity is delayed and spatially coarsened. Exact coordinates,
  private media, similarity scores, embeddings and internal evidence paths are
  never exposed in public or ordinary client responses.
- Reports and reviewed media can recover from interruption. Native drafts and
  reviewed media are encrypted on device, and a media failure must not discard
  the text sighting.
- The initial launch is a bounded Singapore closed pilot, not a public-scale
  network.

## Capabilities and Constraints

- Five primary tabs: Nearby, Map, Report, Following and Profile. Each must have
  a complete task, next action, return path and explicit loading, empty,
  offline, permission, authentication and error states where applicable.
- Cat detail, coarse-area detail, report receipt/My Reports, draft recovery,
  following updates, notification preferences, privacy controls and trust/help
  entry points are required supporting surfaces.
- AI identity assistance is optional, purpose-specific, resumable and separate
  from training consent. No match and create-new-cat are first-class outcomes.
- Community access remains free. Donations or voluntary community support may
  be explored later, but core care, discovery, reporting or identity functions
  must not become paid gates.
- Automatic people, licence-plate and cat detection are not available in the
  current baseline. Manual opaque redaction remains mandatory until validated
  automatic assistance and residual checks exist.
- Media stays private and quarantined until trusted server validation allows a
  separate publication decision.
- Exact public pins, turn-by-turn routes to cats and location-bearing push
  notifications are prohibited.
- English and Simplified Chinese are supported product languages.

## Brand Commitments

- Product/display name: Whisker Commons / WhiskerCommons. The repository and
  bundle identifiers may retain `animalhelper` until a separate rename is
  approved.
- The voice is calm, direct, neighbourly and specific. Safety guidance appears
  at the decision it affects instead of becoming repeated legal or engineering
  copy.
- The mobile interface must look deliberately human-designed rather than like
  a generic AI dashboard: no emoji or text-symbol icons, no uniform stack of
  oversized rounded cards, no oversized marketing headers on routine task
  screens, and no invented claims or community metrics.
- Current iOS liquid-glass capability is a binding progressive enhancement for
  navigation and a small number of high-value controls, not a universal surface
  treatment. Android and reduced-transparency modes must preserve hierarchy and
  contrast without imitating unsupported material.

## Evidence on Hand

- Existing implementation and product contracts under `apps/mobile/`,
  `packages/domain/`, `supabase/` and `services/ai/`.
- Approved iteration and launch gates in `docs/iteration-plan.md`.
- Approved AI identity provenance specification in
  `docs/superpowers/specs/2026-08-29-ai-identity-assistance-provenance-design.md`.
- Five-tab mobile audit captures and findings at
  `C:/Users/15492/.codex/state/plugins/product-design/audits/animalhelper-main-tabs-2026-08-29/`.
- Current UI contains synthetic/demo content only. No licensed production cat
  photo library, finalized logo, testimonials, usage metrics or commercial
  claims are available and future work must not fabricate them.

## Product Principles

1. Protect cats and people before optimizing discovery or growth.
2. Make the common community task obvious, complete and recoverable.
3. Keep humans in control of identity, consent and publication decisions.
4. Show enough context to build trust without exposing sensitive evidence.
5. Earn delight through craft, responsiveness and useful feedback rather than
   decoration or gamification.

## Accessibility & Inclusion

Support screen readers, Dynamic Type/large text, minimum 44pt iOS and 48dp
Android touch targets, visible focus, sufficient contrast, one-handed reach and
clear bilingual copy. Respect reduced motion and reduced transparency. Never
make glass, colour, animation or haptics the only carrier of state or meaning.
