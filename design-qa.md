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
- Preserved a broad Singapore camera, restricted zoom, and Google attribution space. Automated adapter tests cover the labelled atlas fallback when native readiness never arrives; real configured-provider and offline behavior remains a native-device verification gate.
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
- “Google Maps unavailable” appears on web, when native keys are absent, or when a configured native map misses the bounded readiness signal. Real device testing is still required to determine which offline/provider failures actually omit that signal.
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

## Community Map and area detail verification — 2026-08-31

### Automated behavior evidence

- `pnpm --filter @animalhelper/mobile test` passed: 47 suites / 553 tests after the final review fix wave.
- `pnpm --filter @animalhelper/mobile typecheck` passed with no TypeScript errors.
- `pnpm --filter @animalhelper/mobile build` passed and exported 15 web routes, including `/map` and `/(tabs)/map`.
- `pnpm validate:pilot-policies` passed with `native_config_policy_ok` and `pilot_build_policy_ok`.
- The required scan for `892830`, `publicCellId`, `showsUserLocation`, `showsMyLocationButton`, `Marker`, `Polyline`, and `Directions` returned no matches in `apps/mobile/app/(tabs)/map.tsx` or `apps/mobile/src/components/CoarseAreaDetailSheet.tsx`.
- Focused automated coverage includes the native/web map adapters, public map policy, coarse-area detail sheet, report context, native configuration, and pilot-build policy.
- The configured native adapter has automated coverage for an eight-second readiness timeout, both supported map readiness callbacks, readiness arriving before the timeout effect, and timer cleanup after load or unmount. These tests prove the adapter state machine only; they do not prove how a real configured Google provider behaves offline or during provider failure.

### Web fallback visual and interaction evidence

The Expo Web preview ran at `http://localhost:8087/map` with a 390×844 phone viewport. This is evidence for layout, fallback state, and interactions only; it does not prove a configured native Google Maps provider.

- Map fallback: `apps/mobile/.impeccable/review/community-map-web-map-390x844.png`.
- Stable coarse-area list (fresh Fix round 1 recapture with `Community map` title and complete five-tab navigation visible): `apps/mobile/.impeccable/review/community-map-web-list-390x844.png`.
- Open area detail: `apps/mobile/.impeccable/review/community-map-web-area-detail-390x844.png`.
- Scrolled detail actions and contract-blocked follow state: `apps/mobile/.impeccable/review/community-map-web-area-detail-actions-390x844.png`.

Each PNG was reopened at original detail after capture and validated as a genuine 390×844 browser capture. The bounded Impeccable/Emil/Apple review found a clear routine-screen hierarchy, readable states, reachable scroll content, and minimum platform-target sizing in the implemented controls. The intentionally generic atlas labels preserve the approved visual direction without reproducing exact-looking block, transit, pin, or route details. No implementation change was justified by the evidence.

Interaction checks passed for Map/List switching, `Show area list`, `Show map`, `Choose area manually`, broad-view reset, opening `Community area 1`, opening `View Demo Meow One` at `/cat/demo-community-cat-1`, and `Report from Community area 1` at `/report?source=community-map`. `Follow area` remains visibly disabled with its reason because hosted area-follow support and its contract are not yet available. The browser console returned zero warnings and zero errors after the full interaction pass.

### Unavailable native-device evidence and release risks

- This Windows host reported `ADB_NOT_FOUND` and `ANDROID_HOME_NOT_SET`; no Android emulator or connected Android device was available.
- An iOS simulator is unavailable on this Windows host.
- Configured native Google Maps rendering therefore remains an explicit release gate. A later iOS/Android simulator or device pass must verify the provider, adaptive platform chrome, dark appearance, text scaling, and native gestures without enabling user location, exact cat pins, routes, directions, or public source-cell rendering.
- The same native-device pass must exercise real configured offline and provider-initialization failure. Automated timeout fallback exists, but no claim is made that a provider always omits readiness callbacks for every real failure mode.
- Area follow remains contract-blocked and is not represented as a working capability.
- The existing Nearby Impeccable hero gate remains open and unforced; this Map verification does not weaken its privacy-safe accepted deviations.

Community Map web fallback result: passed. Native configured-provider release gate: blocked by unavailable native-device evidence.
