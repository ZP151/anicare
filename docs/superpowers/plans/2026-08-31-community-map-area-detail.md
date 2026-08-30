# Community Map and Area Detail Implementation Plan

> **Spec:** `docs/iteration-plan.md`, Sprint 3A “Community map and area detail”; `apps/mobile/src/maps/public-map-policy.ts`; approved mobile visual direction recorded in `design-qa.md`.

**Goal:** Replace the raw coarse-cell list with a privacy-safe Google Maps journey that supports map/list switching, broad-camera reset, manual coarse-area selection, delayed aggregate area details, safe cat navigation, and report-from-area without exposing source H3 cells or precise location.

**Architecture:** Keep the narrow public feed as the only remote read. Convert its internal `publicCellId` values into ephemeral, ordinal area summaries inside a pure presentation policy before React sees them. The native `NearbyMap` remains the single Google Maps adapter and preserves its broad Singapore camera, hidden user location, no markers/routes, visible provider attribution, and art-directed web/missing-key fallback. The Map screen owns view state only; no selected source cell is persisted or placed in a route.

**Tech stack:** Expo Router 57, React Native 0.86, TypeScript, `react-native-maps` Google provider, Jest and React Native Testing Library.

## Global Constraints

- Use tests first for every behavior change; observe the new or amended test fail before production edits.
- Google Maps is context only: never show a precise cat pin, user location, route, sighting-centred camera, or turn-by-turn action.
- Never render, log, serialize into presentation output, accessibility-label, or route any source `publicCellId`, H3 cell, `sightingId`, `coverMediaId`, or feed cursor.
- Keep the native map camera at `PUBLIC_MAP_REGION`, with `showsUserLocation={false}`, `showsMyLocationButton={false}`, no children/markers, and Google attribution space protected by `PUBLIC_MAP_PADDING`.
- Web, offline, missing-key, and provider-unavailable cases retain a visibly labelled privacy-safe atlas rather than a blank panel.
- Fixture content is labelled once per surface. Loading, live-empty, unavailable, and demo states retain a useful next action.
- Every visible control must be functional or visibly disabled with a reason. Area following remains disabled until an authenticated follow contract exists.
- “Recenter” means resetting to the broad public Singapore camera, never obtaining device location.
- Live AI cat-face inference, model weights, real media processing, embeddings, similarity scores, and identity decisions are outside this plan.

## Task 1: Build the safe coarse-area presentation policy

**Files:**

- Modify: `apps/mobile/src/maps/public-map-policy.test.ts`
- Modify: `apps/mobile/src/maps/public-map-policy.ts`

**Step 1 — write the failing tests**

Extend `public-map-policy.test.ts` with two feed rows in one source cell and one row in another. Assert that `buildPublicAreaSummaries(rows)`:

- creates two summaries labelled `Community area 1` and `Community area 2`;
- deduplicates the same animal within one source cell;
- reports `catCount`, `confirmedCount`, and a delayed activity label;
- orders cats using the existing public presentation priority, without emitting any precise position;
- contains no source cell, H3 text, sighting ID, media ID, or cursor when stringified;
- returns an empty array for no rows.

Add a test for `createDemoPublicAreaSummaries()` that expects exactly two areas, safe demo animal IDs and aliases, and no H3-like hexadecimal string.

**Step 2 — run the focused test and confirm RED**

Run:

`pnpm --filter @animalhelper/mobile test -- --runTestsByPath src/maps/public-map-policy.test.ts`

Expected failure: the two new exported functions and area summary type do not exist.

**Step 3 — implement the minimum policy**

In `public-map-policy.ts` add:

```ts
export type PublicAreaSummary = Readonly<{
  areaKey: string;
  label: string;
  activityLabel: string;
  catCount: number;
  confirmedCount: number;
  cats: readonly PublicMapPresentation[];
}>;

export function buildPublicAreaSummaries(
  sightings: readonly PublicSighting[],
): readonly PublicAreaSummary[];

export function createDemoPublicAreaSummaries(): readonly PublicAreaSummary[];
```

Group only inside the function by source cell, preserve first-seen group order, deduplicate each group by `animalId`, and discard the source key before returning. Use ephemeral `public-area-1`, `public-area-2` keys and ordinal visible labels. A cat is confirmed only for `community_confirmed` or `partner_confirmed`. Use the strongest delayed bucket in the group (`today`, then `this_week`, then `earlier`) to produce human copy such as `2 cats active in the latest delayed window`.

**Step 4 — run focused GREEN and commit**

Run the same focused test, then:

`git add apps/mobile/src/maps/public-map-policy.ts apps/mobile/src/maps/public-map-policy.test.ts && git commit -m "feat(mobile): project privacy-safe map areas"`

## Task 2: Build the area detail surface

**Files:**

- Create: `apps/mobile/src/components/CoarseAreaDetailSheet.test.tsx`
- Create: `apps/mobile/src/components/CoarseAreaDetailSheet.tsx`

**Step 1 — write the failing component tests**

Render an area with two safe cats and assert:

- the area label, delayed aggregate activity, `2 cats visible`, and `1 community confirmed` are readable;
- each cat exposes `View <alias>` and calls `onViewCat(animalId)`;
- `Report from Community area 1` calls `onReportFromArea()` without an area identifier argument;
- `Follow area` is disabled and the adjacent reason says sign-in and hosted follow support are required;
- no source cell or H3-like text appears in rendered JSON or accessibility labels.

**Step 2 — run the focused test and confirm RED**

Run:

`pnpm --filter @animalhelper/mobile test -- --runTestsByPath src/components/CoarseAreaDetailSheet.test.tsx`

Expected failure: component module not found.

**Step 3 — implement the sheet**

Build a compact anchored surface using `MaterialCommunityIcons`, the existing theme, 44-point minimum targets, and opacity-only press feedback. Keep the header and aggregate numbers visually distinct from the cat rows. Show at most the cats already bounded by the presentation policy. The disabled follow control must set `accessibilityState={{ disabled: true }}` and keep the reason visible.

**Step 4 — run focused GREEN and commit**

Run the same focused test, then:

`git add apps/mobile/src/components/CoarseAreaDetailSheet.tsx apps/mobile/src/components/CoarseAreaDetailSheet.test.tsx && git commit -m "feat(mobile): add coarse area detail sheet"`

## Task 3: Integrate the Google Maps map/list journey

**Files:**

- Modify: `apps/mobile/src/api/feed-screens.test.tsx`
- Modify: `apps/mobile/app/(tabs)/map.tsx`
- Modify: `apps/mobile/src/i18n/catalog.ts`
- Modify: `apps/mobile/src/i18n/catalog.test.ts`

**Step 1 — write failing journey tests**

Replace the old assertions for raw cell text with tests that require:

- the `Privacy-safe map` adapter is present in demo, loading, live-empty, live, and unavailable states;
- demo mode is labelled once and no H3-like value is visible;
- `Show area list` reveals safe `Community area 1` rows and `Show map` returns to the map layer;
- `Reset broad map view` remounts/resets the broad public camera without requesting location;
- `Choose area manually` opens the same safe area list and explains that exact pins and routes are unavailable by design;
- selecting `Open Community area 1` opens the area detail surface;
- `View Pepper` routes to `/cat/<animalId>`;
- `Report from Community area 1` routes to `{ pathname: '/report', params: { source: 'community-map' } }`, with no cell or area identifier;
- live feed assertions explicitly reject the source H3 value.

Extend the mocked locale value to expose `locale: 'en'`. Add catalogue tests for the new map labels in English and Simplified Chinese.

**Step 2 — run the focused tests and confirm RED**

Run:

`pnpm --filter @animalhelper/mobile test -- --runTestsByPath src/api/feed-screens.test.tsx src/i18n/catalog.test.ts`

Expected failures: old raw-cell UI remains and new controls/copy do not exist.

**Step 3 — implement the vertical journey**

Replace `ScreenScaffold` on the Map tab with a SafeAreaView composition matching the approved Nearby hierarchy:

- compact top bar titled `Community map`;
- 44-point `Map` / `List` segmented controls;
- map stage containing `<NearbyMap key={mapResetKey} />` in map mode;
- visible `Delayed community activity` time-window label and a legend stating `Coarse areas only · no exact pins or routes`;
- `Reset broad map view` button that increments `mapResetKey` only;
- manual-area action that switches to the list and keeps the safety explanation visible;
- safe area rows built only by `createDemoPublicAreaSummaries()` or `buildPublicAreaSummaries(sightings)`;
- selected area rendered by `CoarseAreaDetailSheet` below the map/list stage;
- loading, empty, unavailable, and demo badges that never replace the map with blank space.

Use `useRouter()` for safe cat/report routes. Do not pass a cell or local `areaKey` into either route. Add explicit i18n keys for user-facing map controls and status copy; do not assemble translated sentences from fragments.

**Step 4 — run focused tests, typecheck, and commit**

Run:

- `pnpm --filter @animalhelper/mobile test -- --runTestsByPath src/api/feed-screens.test.tsx src/i18n/catalog.test.ts src/components/CoarseAreaDetailSheet.test.tsx src/maps/public-map-policy.test.ts`
- `pnpm --filter @animalhelper/mobile typecheck`

Then commit:

`git add apps/mobile/app/(tabs)/map.tsx apps/mobile/src/api/feed-screens.test.tsx apps/mobile/src/i18n/catalog.ts apps/mobile/src/i18n/catalog.test.ts && git commit -m "feat(mobile): complete community map journey"`

## Task 4: Visual, privacy, and branch verification

**Files:**

- Modify: `design-qa.md`
- Modify only if a verified defect requires it: files touched by Tasks 1–3

**Step 1 — run objective verification**

Run:

- `pnpm --filter @animalhelper/mobile test`
- `pnpm --filter @animalhelper/mobile typecheck`
- `pnpm --filter @animalhelper/mobile build`
- `pnpm validate:pilot-policies`
- `rg -n "892830|publicCellId|showsUserLocation|showsMyLocationButton|Marker|Polyline|Directions" apps/mobile/app/'(tabs)'/map.tsx apps/mobile/src/components/CoarseAreaDetailSheet.tsx`

The last command must find no H3/source-cell rendering and no forbidden Google Maps feature in the new screen/sheet.

**Step 2 — visual review**

Start or reuse the local Expo web preview, capture the Map tab at a phone viewport, and run the Impeccable/Emil/Apple review against the approved Nearby visual direction. Fix only evidence-backed issues: hierarchy, content density, 44-point targets, clipped text, generic nested cards, excessive glass, reduced-motion violations, or unreadable states. Do not force an Impeccable gate when the remaining mismatch is an intentionally different privacy-safe map representation.

**Step 3 — document evidence and commit**

Append the tested states, screenshot path, objective command results, remaining release risks, and the explicit fact that area follow remains contract-blocked to `design-qa.md`.

Commit:

`git add design-qa.md apps/mobile && git commit -m "docs(design): record community map verification"`

**Step 4 — independent final review**

Review the entire plan diff for spec compliance, privacy leakage, accessibility semantics, functional controls, and test quality. Any Critical or Important finding must be fixed and re-reviewed before synchronization.
