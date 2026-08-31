# Nearby hero gate report

Date: 2026-09-01

Scope was limited to the approved Sheltered Link Atlas Nearby first viewport.

## Product changes

- Preserved privacy-safe generic atlas labels: North cluster, West court, East
  court, Community green, and Public edge. No block numbers, routes, station
  data, or exact-looking location information was introduced.
- Removed the visual-only `Privacy-safe atlas fallback` label while retaining
  the accessible fallback state and all privacy-safe semantics.
- Bound the atlas labels to the measured regions and used containment for the
  coarse-atlas image; rebuilt the tab bar to an 88dp visual height while
  retaining minimum action heights.

## TDD and verification

- Added expectations that fallback semantics remain exposed without the
  development-only visual chrome.
- Red: `pnpm test -- src/maps/NearbyMap.web.test.tsx src/maps/NearbyMap.native.test.tsx`
  failed exactly because the visual fallback label still rendered.
- Green: the same command passed 8 tests after removing that label.
- `pnpm typecheck` passed.

## Hero-gate blocker

No hero record or advance was run. The available in-app web capture surface
does not produce a usable comp frame in this worktree:

- With a requested 853x1844 viewport, `tab.screenshot({ fullPage: false })`
  emitted 853x876 JPEG data even when the destination had a PNG filename.
- With `fullPage: true`, it emitted 853x1844, but rasterized the app only into
  the left 568px; pixels at x=600 and x=800 were white while the browser DOM
  reported `innerWidth`, document width, and root width all as 853px.
- Repeating at 427x922 produced the same two-thirds-width raster and duplicate
  tab labels at the bottom of the capture.

The converted `hero-repro.png` is syntactically a 853x1844 PNG but is not
valid visual evidence, so it must not be used for `build-phase.mjs record
hero` or `advance`. A reliable browser/device screenshot surface is required
to close the gate.
