# Nearby Google Maps Atlas — Design QA

## Evidence

- Approved source: `apps/mobile/.impeccable/mocks/sheltered-link-atlas-a.png` (853×1844).
- Implementation capture: `apps/mobile/.impeccable/review/mobile.png` (390×844 normalized mobile viewport).
- Gate capture: `apps/mobile/.impeccable/review/hero-repro.png` (implementation capture normalized to 853×1844 for the comp-diff gate).
- Same-input comparison: `apps/mobile/.impeccable/review/source-vs-mobile.png`.
- Focused bottom-navigation evidence: `apps/mobile/.impeccable/review/tab-bar.png`.
- Impeccable diff: `apps/mobile/.impeccable/review/diff/hero/side-by-side.png`.

The browser viewport was set to 390×844 and captured directly after the Expo Web preview reached its stable fixture state. The capture was then scaled only for the 853×1844 gate input.

## Implemented fixes

- Replaced the production atlas decision with Google Maps Platform through `react-native-maps`; the generated atlas is an explicit web/unconfigured fallback.
- Removed exact cat markers, user-location controls, routes, precise timestamps, public cell identifiers, real block numbers, and transit labels.
- Preserved a broad Singapore camera, restricted zoom, Google attribution space, and a provider-unavailable state.
- Matched the approved first-viewport hierarchy: compact top bar, dominant map, privacy notice, 258-point anchored cat sheet, and five-destination tab bar.
- Re-cropped the approved cat fixture for the measured 135×199 portrait slot.
- Replaced text-symbol navigation with semantic MaterialCommunityIcons.
- Added a functional inline privacy explanation, cat detail route, report-context route, and all five tab destinations.
- Replaced the report photo text symbol with a semantic icon.
- Removed React Native Web shadow and pointer-event deprecation warnings introduced by the new screen.
- Restored the approved bilingual fixture name while keeping route and accessible action names stable.
- Rebuilt the cat-status spacing and both 44-point actions from measured comp slots so their full chrome lands inside the expected regions.
- Enlarged and rebalanced the five-destination navigation while preserving semantic icons and platform tab behavior.

## Intentional source deviations

- Real-looking block numbers, a bus-stop label, and route-like geographic labels are not reproduced because they conflict with the approved location-safety policy. The fallback uses non-reversible labels such as “Community green”.
- Post-capture safety/completeness deviation: the visible `Privacy-safe atlas fallback` provider-state label was restored after the 0.7857 hero evidence. The Impeccable hero remains open and unforced.
- “Google Maps unavailable” appears only when native Google Maps keys/provider are unavailable. It is absent from configured native production builds.
- “Preview data” is visible for the synthetic Mochi fixture so community-confirmation language cannot be mistaken for a live fact.
- Live public portraits remain protected until a separately approved public-media policy exists.

## Interaction and accessibility checks

- `View Mochi` navigates to `/cat/demo-cat` and renders only alias, review state, delayed activity, and coarse-location language.
- `Report a sighting of Mochi` navigates to the report flow with opaque route context; the opaque identifier is never rendered as copy.
- Privacy control expands an inline explanation stating that user location is not requested and exact cat locations, routes, and timestamps remain hidden.
- Nearby, Map, Report, Following, and Profile tabs all navigate to their real destinations.
- Core buttons expose accessible names and at least 44-point targets.
- Browser console confirmation pass: zero errors and zero warnings.
- Automated verification: 46 suites / 532 tests passed; TypeScript, Expo web export, native config policy, and pilot build policy passed.

## Remaining visual gate

The confirmation pass raised the Impeccable hero score from 68.9% to 72.31%, clearing the numeric 72% bar. The hero phase nevertheless remains open because the gate also treats the deliberately omitted real-looking west/east/edge atlas labels as required semantic regions and still reports lesser control drift. The gate was not forced. A future native-device capture with configured Google Maps should be reviewed separately; it must not reintroduce exact location cues merely to satisfy a visual comparator.

Release-risk tracker:

- Atlas west/east/edge semantic regions — owner: product safety; disposition: accepted visual deviation and prohibited implementation because reversible-looking location labels conflict with the public-map policy.
- Remaining report-action and inactive-tab chrome drift — owner: mobile design; disposition: carry into the configured-native responsive polish pass, with no functional or privacy release blocker in the current closed pilot.

final result: blocked
