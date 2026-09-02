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

## DPR-equivalent capture and gate result

The capture workaround used an aspect-equivalent 405x876 CSS viewport. A
non-full-page camera clip at `{ x: 0, y: 0, width: 405, height: 876 }` produced
one complete 405x876 raw hero: atlas, privacy banner, sheet, and tab bar were
all present with no blank space or duplicate fixed elements. The raw image was
resampled once with high-quality bicubic interpolation to exactly 853x1844 and
encoded as a real PNG at
`apps/mobile/.impeccable/review/hero-repro.png`.

`build-phase.mjs record hero` read that capture at 76% and named the protected
atlas text regions as missing because the approved comp contains exact-looking
block and bus-stop labels. One permitted structural rebase moved the generic
labels to the corresponding atlas anchors without introducing the prohibited
location data. `build-phase.mjs advance` still failed:

- `atlas-zone-north` contradicted at 42%; its comp crop is `BLK 132`.
- `atlas-zone-west` contradicted at 43%; its comp crop is `BLK 134`.
- `atlas-edge-label` is the comp's bus-stop label.
- The detector also reports the coarse-atlas plate clipped and the privacy
  title missing, while the visually complete capture retains truthful product
  copy and the required generic privacy-safe labels.

No further edit was made: reintroducing exact blocks, a bus stop, routes, or
station data would violate the binding product privacy contract. The gate stays
open at HERO; no sections work was started. The raw JPEG is temporary and is
removed after this validation; the final PNG, hero-diff report, and build state
are the retained evidence.

## Privacy-comp rebaseline and current blocker

The approved privacy-corrected comp was rebaselined exclusively through the
official build-phase scripts:

- `build-phase.mjs start --reset --comp .impeccable/mocks/sheltered-link-atlas-a-privacy.png --breakpoint 853x1844`
- `comp-spec.mjs` regenerated the 26-region contract. Only the North cluster,
  West court, and Community green boxes expanded for their approved two-line
  generic labels.
- All 11 text regions were measured and the lead heading was ranked before the
  spec was closed.

The script image generator then failed with `OPENAI_API_KEY is not set`. The
native image fallback produced 1182px and 1183px-wide files, below the plates
gate's 1280px shipping minimum, so neither was retained. A temporary official
deterministic crop fallback was also removed on review: a crop-derived plate is
not shippable under the no-comp-crop rule.

The original production atlas was restored only after a blob hash check proved
that `C:\\Users\\15492\\Develop\\animalhelper\\apps\\mobile\\assets\\plates\\coarse-atlas.png`
and `HEAD:apps/mobile/assets/plates/coarse-atlas.png` were both
`99c503be84e4ceb9f67e81959bf347c18e26c194`. A fresh official plates-gate run
then refused that restored, previously proven plate:

```text
GATE PLATES FAILED (state unchanged)
- plate assets\\plates\\coarse-atlas.png: carries detail the comp region
  coarse-atlas does not have (added-detail 50% of cells): noise, grain, or a
  busier subject where the comp is calm; regenerate from the crop reference
  without adding texture
```

At the explicit stop condition, `comps` and `spec` are closed, `plates` is
open, and `hero` remains pending. No further capture, hero edit, section work,
or plate generation was performed. `hero-raw.png`, generated `.gitignore`,
`expo-env.d.ts`, and fake-plate provenance were removed; the final prior
853x1844 `hero-repro.png` and diffs remain diagnostic evidence only.
