# Nearby hero-gate alignment report

## Status

Bounded visual-alignment pass completed. The approved Nearby hero improved from
`0.7231` to `0.7857` overall, but the Impeccable hero gate remains open at
`hero 79% (drift)` after the allowed two attempts. The gate was not forced or
bypassed.

The remaining atlas-label mismatch is intentional: the approved comp contains
exact-looking block and bus labels, while the binding privacy contract requires
the five safe labels (`North cluster`, `West court`, `East court`,
`Community green`, and `Public edge`). Exact block, station, route, marker,
coordinate, H3, or user-location content was not introduced.

## Files changed

Tracked source:

- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/_layout.tsx`
- `apps/mobile/src/components/AnchoredCatSheet.tsx`
- `apps/mobile/src/maps/NearbyMap.web.tsx`
- `apps/mobile/src/navigation/tab-style.ts`

Tracked tests:

- `apps/mobile/src/api/feed-screens.test.tsx`
- `apps/mobile/src/components/AnchoredCatSheet.test.tsx`
- `apps/mobile/src/maps/NearbyMap.native.test.tsx`
- `apps/mobile/src/maps/NearbyMap.web.test.tsx`
- `apps/mobile/src/navigation/tab-style.test.ts`

Task report:

- `.superpowers/sdd/2026-08-31-community-map-area-detail/hero-gate-report.md`

The tracked Impeccable state and final review artifacts under
`apps/mobile/.impeccable/build` and `apps/mobile/.impeccable/review` are
included in the task commit so `HEAD` reproduces the final two-attempt `0.7857`
gate state without regenerating visual evidence.

## Implemented alignment

- Bound the compact 68pt top chrome to the measured title and safety-control
  positions. The safety control keeps a 44pt press target plus 8pt hit slop,
  while its visible circle matches the smaller comp chrome.
- Kept the generated coarse-atlas plate on `resizeMode="contain"`, removed the
  visually obstructive fallback badge, and retained its unavailable/fallback
  semantics in one screen-reader label.
- Repositioned and resized all five existing safe atlas labels without adding
  exact areas, cells, stations, routes, coordinates, pins, or user location.
- Matched the approved privacy notice words in the collapsed state and retained
  the stronger no-location explanation in the expanded state.
- Aligned sheet horizontal geometry, name weight, action radii, secondary action
  rule/weight, and chevron. Press feedback is opacity-only.
- Preserved effective touch targets: 44pt on iOS and 48dp on Android via visual
  size plus platform-specific hit slop.
- Reduced the web hero tab icon/label chrome while retaining platform-specific
  11pt iOS and 12sp Android label floors. Existing semantic icon family and all
  five routes remain unchanged.
- Kept the fixture label exactly once.

## Gate commands and scores

All build-phase commands ran from `apps/mobile`.

Baseline:

```text
node C:\Users\15492\.codex\skills\impeccable\scripts\build-phase.mjs status
```

Observed state: `hero 72% (drift)`; the starting report recorded exact scores
`overall 0.7231`, `structure 0.6071`, `color 0.8142`, `detail 0.6788`, and
`bands 0.9158`.

Attempt 1:

```text
node C:\Users\15492\.codex\skills\impeccable\scripts\build-phase.mjs record hero
node C:\Users\15492\.codex\skills\impeccable\scripts\build-phase.mjs advance hero
```

Result: `FAIL hero 77% (drift)` and `GATE HERO FAILED (state unchanged)`.
The generated comparison printed `STRUCT 67%`, `COLOR 78%`, `DETAIL 75%`, and
`BANDS 100%`. The named crops were opened in the required order before the one
correction batch:

1. `atlas-zone-north.png` — `contradicted 36%`
2. `atlas-zone-west.png` — `drift 54%`
3. `report-sighting.png` — `drift 55%`

Attempt 2:

```text
node C:\Users\15492\.codex\skills\impeccable\scripts\build-phase.mjs record hero
node C:\Users\15492\.codex\skills\impeccable\scripts\build-phase.mjs advance hero
```

Result: `FAIL hero 79% (drift)` and `GATE HERO FAILED (state unchanged)`.
Final exact scores from `report.json`:

| Metric | Score |
| --- | ---: |
| Overall | `0.7857` |
| Structure | `0.6818` |
| Color | `0.8211` |
| Color intersection | `0.6982` |
| Palette match | `0.8872` |
| Detail | `0.7674` |
| Detail raw | `0.7935` |
| Detail added | `0.0521` |
| Bands | `1.0000` |

Final status:

```text
node C:\Users\15492\.codex\skills\impeccable\scripts\build-phase.mjs status
```

Result: `hero open`, `hero 79% (drift) (2 attempts)`; later phases remain
pending and were not entered.

## Screenshot and comparison evidence

- Approved comp:
  `apps/mobile/.impeccable/mocks/sheltered-link-atlas-a.png`
- Measured scaffold:
  `apps/mobile/.impeccable/build/scaffold/layout.css`
- Scaffold reference:
  `apps/mobile/.impeccable/build/scaffold/hero-reference.html`
- Exact final capture (`853x1844`):
  `apps/mobile/.impeccable/review/hero-repro.png`
- Final side-by-side:
  `apps/mobile/.impeccable/review/diff/hero/side-by-side.png`
- Final heatmap:
  `apps/mobile/.impeccable/review/diff/hero/heatmap.png`
- Final machine report:
  `apps/mobile/.impeccable/review/diff/hero/report.json`
- Final worst crops:
  - `apps/mobile/.impeccable/review/diff/hero/regions/atlas-zone-north.png`
  - `apps/mobile/.impeccable/review/diff/hero/regions/atlas-edge-label.png`
  - `apps/mobile/.impeccable/review/diff/hero/regions/atlas-zone-east.png`

The final capture used the already-running local Expo Web session on port 8081
and the bundled local Playwright/Chromium runtime. The capture command used a
`390x843` CSS viewport with device scale `853/390`, producing an inspected,
native-size `853x1844` PNG without post-capture resizing.

## Tests and typecheck

TDD RED evidence:

```text
pnpm test -- --runTestsByPath src/maps/NearbyMap.web.test.tsx src/components/AnchoredCatSheet.test.tsx src/navigation/tab-style.test.ts src/api/feed-screens.test.tsx
```

The four intended contracts failed before implementation: accessible fallback
without a visual badge, approved privacy copy, opacity-only press feedback, and
compact tab sizing. The press-feedback regression was separately confirmed to
fail because the pressed style still contained `transform: [{ scale: 0.98 }]`.

Final focused verification:

```text
pnpm test -- --runTestsByPath src/maps/NearbyMap.native.test.tsx src/maps/NearbyMap.web.test.tsx src/components/AnchoredCatSheet.test.tsx src/navigation/tab-style.test.ts src/navigation/tab-icons.test.ts src/api/feed-screens.test.tsx
```

Result: `6` suites passed, `10` tests passed, `0` failed.

Final typecheck:

```text
pnpm typecheck
```

Result: exit `0` (`tsc --noEmit`).

Final full mobile suite:

```text
pnpm exec jest --runInBand --silent --json --outputFile=.impeccable/review/jest-final.json
```

Result: `46/46` suites passed, `536/536` tests passed, `0` failures. The
temporary Jest JSON output was removed after verification; it is not durable
evidence.

An earlier full-suite run correctly exposed one stale native fallback assertion;
the native test was updated to assert the shared accessible fallback contract,
then both the focused and full suites passed.

## Self-review

| Before | After | Why |
| --- | --- | --- |
| 20pt/800 title and a full 44pt bordered circle | 18pt/700 title and a 36pt visual circle inside the unchanged 44pt press target | Matches measured chrome without shrinking interaction affordance |
| Atlas fallback badge obscured the north region | Fallback state lives in the atlas accessibility label; all five safe labels stay visible | Removes unapproved ink while preserving unavailable-state semantics |
| Labels used one heavy size and approximate offsets | Safe labels use measured offsets, lighter weight, and per-role size/color | Improves hierarchy without reintroducing exact identifiers |
| Privacy notice used extra route/time wording in its collapsed state | Approved two-line words are verbatim; expanded copy still explains no user location | Aligns the approved hero and retains stronger disclosure on demand |
| Sheet actions scaled on press; secondary control was pill-like and heavy | Opacity-only feedback, measured radii/rule/weight, and platform hit slop | Preserves reduced-motion safety and 44pt/48dp targets |
| Tabs used 31pt icons, 12pt web labels, white glass fallback, and muted inactive ink | 25pt web icons, 10pt hero labels, approved paper tone, mineral inactive ink; native labels remain 11pt/12sp | Aligns the hero while respecting native type floors |

Privacy and route review:

- No `publicCellId`, H3 literal, exact coordinate, user-location control, marker,
  polyline, route, or station content was added.
- Cat detail still routes to `/cat/:animalId`.
- Report still routes to `/report` with only the selected `animalId`.
- The privacy control remains a button with expanded state semantics.
- Existing five-tab route definitions and semantic icon mapping are unchanged.

Accessibility review:

- Safety control: 44pt press box plus 8pt hit slop.
- Primary action: 44pt visual target on iOS/web; Android reaches 48dp with hit
  slop.
- Secondary action: 42pt visual target; effective 44pt iOS / 48dp Android target
  through hit slop.
- Native tab/atlas labels use platform floors rather than the smaller web hero
  values.
- Press feedback is opacity-only; no new animation was introduced.

## Remaining risks and blockers

1. The hero gate is still open at exact overall score `0.7857`. It was not
   forced. Further visual editing was stopped after two attempts as required.
2. Final worst regions remain the label substitutions: `atlas-zone-north`
   `0.4319`, `atlas-edge-label` `0.5058`, and `atlas-zone-east` `0.5619`.
   Replacing them with the comp's exact-looking block/bus words would violate
   the binding privacy contract.
3. The generated `coarse-atlas.png` plate has a different composition and lower
   edge occupancy than the approved comp crop. No new or reconstructed asset
   was authorized, and the existing plate remains contained rather than covered.
4. Stock MaterialCommunityIcons in the tab bar remain below the region threshold
   (`0.59–0.63`) despite improved size and ink placement. Replacing the existing
   icon family was out of scope.
5. Visual evidence is the exact Expo Web hero audit surface. Native iOS simulator,
   Android emulator, large Dynamic Type, and device reduced-transparency captures
   were not available in this Windows pass; native behavior is covered by the
   component contracts and typecheck, not claimed as device-visual evidence.

## Fix round 1 — secondary-action Dynamic Type and reproducible evidence

### Scope and evidence handling

- Committed the already-generated tracked final Impeccable state, final capture,
  comparison images, region crops, and machine report. No Impeccable
  `status`, `record`, `advance`, or capture command was run in this fix round.
- Resolved the review root to
  `C:\\Users\\15492\\Develop\\animalhelper\\apps\\mobile\\.impeccable\\review`
  before cleanup. At inspection, the two exact temporary paths
  `hero-local-current.png` and `jest-final.json` were already absent, and
  `git ls-files --others --exclude-standard -- apps/mobile/.impeccable/review`
  returned no paths. No deletion command was needed or run; no claim treats
  either absent file as durable evidence.

### TDD and accessibility fix

The regression test would fail if the secondary action reverted to a fixed
42pt height, a one-line label, or insufficient platform hit slop. It renders
the real component and asserts the effective touch-height contracts directly:
42pt visual minimum plus 1pt each side on iOS is 44pt, and plus 3dp each side
on Android is 48dp.

RED, before the production edit:

```text
pnpm test -- --runTestsByPath src/components/AnchoredCatSheet.test.tsx
FAIL src/components/AnchoredCatSheet.test.tsx
Expected: 42
Received: undefined
Test Suites: 1 failed, 1 total
Tests: 1 failed, 2 passed, 3 total
```

The minimal production change restores `minHeight: 42` on the secondary
Pressable and removes `numberOfLines={1}` from its label. Platform-specific
hit slop remains unchanged.

GREEN:

```text
pnpm test -- --runTestsByPath src/components/AnchoredCatSheet.test.tsx
PASS src/components/AnchoredCatSheet.test.tsx
Test Suites: 1 passed, 1 total
Tests: 3 passed, 3 total
```

### Fix-round files and self-review

- `apps/mobile/src/components/AnchoredCatSheet.tsx`
- `apps/mobile/src/components/AnchoredCatSheet.test.tsx`
- `apps/mobile/.impeccable/build/state.json`
- `apps/mobile/.impeccable/review/hero-repro.png` and tracked final
  `apps/mobile/.impeccable/review/diff/hero/**` evidence
- `.superpowers/sdd/2026-08-31-community-map-area-detail/hero-gate-report.md`

The visual control is still compact at its 42pt minimum, but its container can
grow when the label reflows at larger font scales. The test protects both the
layout contract and touch geometry; it does not claim native device screenshot
coverage. The hero remains open at `0.7857` after its permitted two attempts.

### Fix-round verification

```text
pnpm test
Test Suites: 46 passed, 46 total
Tests:       536 passed, 536 total
Snapshots:   0 total
Time:        20.611 s

pnpm typecheck
$ tsc --noEmit
exit 0
```
