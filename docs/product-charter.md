# Product charter

## Decision

WhiskerCommons is a free, privacy-first community-cat identity and care ledger for a closed Singapore pilot. It helps caregivers recognise a cat, understand recent care, coordinate safely and correct community knowledge. It is not a pet-owner social network, veterinary diagnostic tool, public real-time tracker or marketplace.

The first differentiator is AI-assisted cat identity. The model returns at most three candidates plus a “new cat” option, an explanation and a broad confidence band. A contributor choice is always tentative; an independent trusted reviewer confirms or rejects it. The system must prefer “unknown” over a confident false match.

## Target users and jobs

- A resident reports a sighting without exposing a precise location.
- A caregiver recognises a recurring cat and sees its event-derived care history.
- A trusted contributor resolves duplicate identities and disputed events.
- An area steward coordinates a welfare check through a task-specific, audited location grant.
- A moderator handles unsafe content, appeals and conflicts of interest.

## MVP scope

Included:

1. Anonymous browsing of delayed, approximate sightings.
2. Email, Apple and Google sign-in for contributors; 18+ self-confirmation without collecting date of birth.
3. Photo, traits, risk and one-time location capture for a sighting.
4. On-device EXIF removal and bystander/licence-plate redaction before any upload (release gate; not yet implemented).
5. AI Top-3/new-cat candidate flow, tentative selection and independent review.
6. Cat aliases, follows, care events and event-derived lifecycle state.
7. Reporting, blocking, moderation queue, appeal and audit trail.
8. English and Simplified Chinese.

Explicitly excluded from MVP:

- Public exact coordinates or real-time tracking.
- Direct messages, open chat, popularity rankings or engagement streaks.
- Veterinary diagnosis or treatment recommendations.
- Individual crowdfunding, stored balances, tips, paid identity boosts or paid safety access.
- Selling user data, ad-tech SDKs or training on uploads without separate opt-in.
- Automatic AI identity confirmation.

## Success and stop conditions

Pilot success is not installs. It is a safe, useful correction loop:

- At least 30 qualified recurring cats with independently reviewed identity records.
- At least 20 weekly contributing caregivers by week 8 of the pilot.
- Median moderation response under 24 hours for critical reports and under 72 hours otherwise.
- Recall@3 at least 85%, unknown rejection at least 80%, and likely false matches on unknown cats at most 5% on a held-out, locally relevant evaluation set.
- Zero unresolved critical exact-location exposures.

Pause AI suggestions if any model gate fails. Pause new contributions if the moderation SLA is missed for seven consecutive days. Pause the pilot after any confirmed exact-location exposure until incident review and remediation are complete.

## Product principles

- Community access is free. Funding never changes identity truth, moderation priority or location access.
- Animal welfare overrides growth metrics.
- Show uncertainty and provenance; never make AI look authoritative.
- Collect less: approximate public location, separate consent for training, no date of birth.
- Governance is a feature: recusal, reversible proposals, appeals and auditability ship with the contribution flow.
