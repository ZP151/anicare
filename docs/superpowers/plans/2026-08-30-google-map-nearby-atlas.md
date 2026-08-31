# Google Map Nearby Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generated production atlas on Nearby with a Google Maps-backed, privacy-safe discovery surface and an anchored selected-cat sheet that completes View cat and Report sighting journeys.

**Architecture:** A platform adapter owns Google Map rendering and has an explicit web/unconfigured fallback. A pure public-map policy prevents exact cat markers, user-location display, over-zooming and attribution obstruction; Nearby consumes the existing narrow public feed through a selector that exposes only alias, review state, delayed time bucket and opaque IDs. The approved Sheltered Link Atlas composition remains the layout contract while Google provides the production basemap.

**Tech Stack:** Expo SDK 57, React Native 0.86, Expo Router, `react-native-maps`, `@expo/vector-icons`, Expo Constants, Reanimated 4, Jest Expo, Testing Library React Native.

**Spec:** `apps/mobile/.impeccable/mocks/sheltered-link-atlas-a.png`, `apps/mobile/.impeccable/build/spec.json`, `apps/mobile/PRODUCT.md`, and `docs/iteration-plan.md` Sprint 3A/3B.

## Global Constraints

- Google Maps is a basemap only: render no exact cat marker, coordinate, route, turn-by-turn direction, user-location dot, precise timestamp, public-cell identifier, reviewer identity, AI score, vector, or storage path.
- The public camera begins at a broad Singapore view and is never programmatically centered on a cat sighting or the user's current coordinates.
- Preserve Google Maps attribution and reserve bottom map padding so the anchored sheet cannot obscure it.
- Google Maps API keys are injected at native build time through `GOOGLE_MAPS_IOS_API_KEY` and `GOOGLE_MAPS_ANDROID_API_KEY`; never commit key values or expose them through `EXPO_PUBLIC_*`.
- Use separate iOS and Android restricted keys and restrict each key to its Maps SDK.
- Without both keys, on web, offline, or on provider failure, show the art-directed privacy-safe atlas plate with a visible provider-unavailable explanation; never collapse to a blank map.
- The selected visual world is `#123B46`, `#2E756C`, `#F1EBDD`, `#D55B3E`, and `#B8D8D0`; no gradients, Emoji, text-symbol icons, generic card grids, or decorative glass.
- iOS liquid glass is progressive enhancement for the privacy notice and navigation surfaces; Android and reduced-transparency modes use equivalent solid/blur fallbacks.
- Tab switches have no authored slide animation. Press feedback is 100–150ms and reduced motion removes transform-based movement.
- Every new behavior is test-first: run the named test and observe the expected failure before production changes.

---

### Task 1: Google Maps build configuration and fail-closed public-map policy

**Files:**
- Create: `apps/mobile/scripts/google-maps-config.test.ts`
- Create: `apps/mobile/app.config.ts`
- Create: `apps/mobile/src/maps/public-map-policy.ts`
- Create: `apps/mobile/src/maps/public-map-policy.test.ts`
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json`
- Modify: `docs/iteration-plan.md`

**Interfaces:**
- Produces from `app.config.ts`: `getGoogleMapsBuildConfig(env): { configured: boolean; plugin: string | [string, { iosGoogleMapsApiKey: string; androidGoogleMapsApiKey: string }] }`.
- Produces: `PUBLIC_MAP_REGION`, `PUBLIC_MAP_PADDING`, `PUBLIC_GOOGLE_MAP_STYLE`, and `toPublicMapPresentation(input)`.
- `toPublicMapPresentation` returns only `{ alias, verificationLabel, timeLabel, animalId }`; it rejects unknown verification/time values and never copies `publicCellId`, `sightingId`, `coverMediaId`, coordinates, or cursor.

- [ ] **Step 1: Write failing config and policy tests**

```ts
it('configures restricted native Google Maps keys without exposing them as public extras', () => {
  expect(getGoogleMapsBuildConfig({
    GOOGLE_MAPS_IOS_API_KEY: 'ios-secret',
    GOOGLE_MAPS_ANDROID_API_KEY: 'android-secret',
  })).toEqual({
    configured: true,
    plugin: ['react-native-maps', {
      iosGoogleMapsApiKey: 'ios-secret',
      androidGoogleMapsApiKey: 'android-secret',
    }],
  });
});

it('projects a feed row without copying location or internal identifiers', () => {
  const result = toPublicMapPresentation({
    animalId: '00000000-0000-4000-8000-000000000102',
    primaryAlias: 'Mochi',
    verification: 'community_confirmed',
    timeBucket: 'today',
    publicCellId: '8928308280fffff',
    sightingId: '00000000-0000-4000-8000-000000000101',
    coverMediaId: null,
    cursor: '00000000-0000-4000-8000-000000000101',
  });
  expect(result).toEqual({
    alias: 'Mochi',
    verificationLabel: 'Community confirmed',
    timeLabel: 'Seen in the latest delayed window',
    animalId: '00000000-0000-4000-8000-000000000102',
  });
  expect(JSON.stringify(result)).not.toMatch(/892830|publicCell|sightingId|coverMedia|cursor/);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @animalhelper/mobile test --runInBand scripts/google-maps-config.test.ts src/maps/public-map-policy.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Install Expo-compatible dependencies**

Run from `apps/mobile`: `npx expo install react-native-maps expo-constants @expo/vector-icons`

Expected: `package.json` and lockfile record SDK-compatible versions.

- [ ] **Step 4: Implement config and policy**

`getGoogleMapsBuildConfig` must return the string plugin when either key is missing and the configured tuple only when both are non-empty. `app.config.ts` merges `app.json`, replaces any bare `react-native-maps` entry with the returned plugin, and publishes only `extra.googleMapsConfigured` as a boolean. `PUBLIC_MAP_REGION` is `{ latitude: 1.3521, longitude: 103.8198, latitudeDelta: 0.24, longitudeDelta: 0.18 }`; `PUBLIC_MAP_PADDING` reserves at least 300 logical pixels at the bottom. The style hides labels/transit/POI and uses the approved warm-paper/teal palette without hiding Google's own attribution.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run: `pnpm --filter @animalhelper/mobile test --runInBand scripts/google-maps-config.test.ts src/maps/public-map-policy.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 6: Document the provider ruling**

Add to Sprint 3A Community map: Google Maps is the production basemap on both native platforms, no exact cat pins/user-location centering, keys are build-time restricted secrets, attribution remains visible, and the generated atlas is fallback-only.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.json apps/mobile/app.config.ts apps/mobile/scripts/google-maps-config.test.ts apps/mobile/src/maps/public-map-policy.ts apps/mobile/src/maps/public-map-policy.test.ts docs/iteration-plan.md
git commit -m "feat(mobile): add privacy-safe Google Maps policy"
```

### Task 2: Faithful Nearby atlas and anchored cat sheet

**Files:**
- Create: `apps/mobile/src/maps/NearbyMap.native.tsx`
- Create: `apps/mobile/src/maps/NearbyMap.web.tsx`
- Create: `apps/mobile/src/maps/NearbyMap.test.tsx`
- Create: `apps/mobile/src/components/AnchoredCatSheet.tsx`
- Create: `apps/mobile/src/components/AnchoredCatSheet.test.tsx`
- Create: `apps/mobile/src/components/PrivacyMapNotice.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Modify: `apps/mobile/src/api/feed-screens.test.tsx`
- Modify: `apps/mobile/src/design/theme.ts`
- Modify: `apps/mobile/src/i18n/catalog.ts`

**Interfaces:**
- Consumes: Task 1 map constants and `toPublicMapPresentation`.
- Produces: `NearbyMap({ configured, onProviderError })`, `AnchoredCatSheet({ cat, onViewCat, onReportSighting })`, and a Nearby screen with explicit demo/loading/live/empty/unavailable states.

- [ ] **Step 1: Write failing component and screen tests**

Tests assert the fallback notice when unconfigured, no marker/user-location props in the native map contract, real accessible buttons named `View cat` and `Report sighting`, fixture labeling in demo mode, and no rendering of `publicCellId` or exact time.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @animalhelper/mobile test --runInBand src/maps/NearbyMap.test.tsx src/components/AnchoredCatSheet.test.tsx src/api/feed-screens.test.tsx`

Expected: FAIL because new components and changed behavior do not exist.

- [ ] **Step 3: Implement the map adapter and fallback**

Native uses `MapView` with `provider={PROVIDER_GOOGLE}`, the broad initial region, Task 1 style/padding, `showsUserLocation={false}`, `showsMyLocationButton={false}`, `showsBuildings={false}`, `showsIndoors={false}`, `maxZoomLevel={14}`, and no children/Marker. Web/unconfigured uses `assets/plates/coarse-atlas.png` with the copy `Google Maps unavailable · privacy-safe atlas fallback`.

- [ ] **Step 4: Implement the selected-cat sheet and privacy notice**

Use `assets/plates/cat-portrait.png`, semantic MaterialCommunityIcons, 44pt/48dp targets, one solid teal primary action and one vermilion outlined secondary action. Use `GlassSurface` only on the privacy notice. The sheet is anchored above the existing tab bar and does not cover Google attribution.

- [ ] **Step 5: Rebuild Nearby around the measured composition**

Use a fixed visual hierarchy: compact top bar, dominant map, privacy notice at the lower map edge, anchored cat sheet, then native tab bar. Demo uses Mochi as a clearly labeled visual fixture; live mode selects the first safe projected row, preferring `community_confirmed` or `partner_confirmed` over `reported`. Loading/empty/unavailable keep the atlas visible and replace only the selected-cat sheet content.

- [ ] **Step 6: Run focused tests to verify GREEN**

Run: `pnpm --filter @animalhelper/mobile test --runInBand src/maps/NearbyMap.test.tsx src/components/AnchoredCatSheet.test.tsx src/api/feed-screens.test.tsx`

Expected: PASS with zero failures and no console warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/maps/NearbyMap.native.tsx apps/mobile/src/maps/NearbyMap.web.tsx apps/mobile/src/maps/NearbyMap.test.tsx apps/mobile/src/components/AnchoredCatSheet.tsx apps/mobile/src/components/AnchoredCatSheet.test.tsx apps/mobile/src/components/PrivacyMapNotice.tsx apps/mobile/app/\(tabs\)/index.tsx apps/mobile/src/api/feed-screens.test.tsx apps/mobile/src/design/theme.ts apps/mobile/src/i18n/catalog.ts
git commit -m "feat(mobile): build Google Maps nearby atlas"
```

### Task 3: Complete Nearby actions and native navigation iconography

**Files:**
- Create: `apps/mobile/app/cat/[id].tsx`
- Create: `apps/mobile/src/components/CatDetailScreen.tsx`
- Create: `apps/mobile/src/components/CatDetailScreen.test.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`
- Modify: `apps/mobile/app/(tabs)/report.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/src/i18n/catalog.ts`

**Interfaces:**
- Consumes: `animalId` and safe presentation from Task 2.
- Produces: `View cat -> /cat/[id]` and `Report sighting -> /(tabs)/report?animalId=<opaque UUID>&source=nearby`; Report may use the opaque ID only to preserve context and must never render it as user-facing copy.

- [ ] **Step 1: Write failing navigation and detail tests**

Tests assert both CTA routes, cat detail contains only alias/verification/delayed activity/coarse-area language, report reads an opaque UUID without rendering it, and all five tabs use MaterialCommunityIcons rather than Unicode text.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @animalhelper/mobile test --runInBand src/components/CatDetailScreen.test.tsx src/api/feed-screens.test.tsx`

Expected: FAIL because detail/navigation behavior is absent.

- [ ] **Step 3: Implement routes and semantic icons**

Add the cat detail stack route, wire the two CTA handlers, and replace `⌂ ⌖ ＋ ♡ ●` with `map-marker-radius-outline`, `map-outline`, `plus-circle-outline`, `heart-outline`, and `account-outline`. Keep tab transition animation disabled.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `pnpm --filter @animalhelper/mobile test --runInBand src/components/CatDetailScreen.test.tsx src/api/feed-screens.test.tsx src/i18n/catalog.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 5: Run project verification**

Run: `pnpm --filter @animalhelper/mobile test --runInBand && pnpm --filter @animalhelper/mobile typecheck && pnpm --filter @animalhelper/mobile build && pnpm --filter @animalhelper/mobile validate:native-config && pnpm --filter @animalhelper/mobile validate:pilot-build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/cat/\[id\].tsx apps/mobile/src/components/CatDetailScreen.tsx apps/mobile/src/components/CatDetailScreen.test.tsx apps/mobile/app/\(tabs\)/_layout.tsx apps/mobile/app/\(tabs\)/report.tsx apps/mobile/app/_layout.tsx apps/mobile/src/i18n/catalog.ts
git commit -m "feat(mobile): complete nearby cat journeys"
```

### Task 4: Visual, accessibility and safety verification

**Files:**
- Create: `design-qa.md`
- Create: `apps/mobile/.impeccable/review/hero-repro.png`
- Create: `apps/mobile/.impeccable/review/mobile.png`
- Modify: `apps/mobile/src/maps/NearbyMap.native.tsx`
- Modify: `apps/mobile/src/maps/NearbyMap.web.tsx`
- Modify: `apps/mobile/src/components/AnchoredCatSheet.tsx`
- Modify: `apps/mobile/src/components/PrivacyMapNotice.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`
- Modify: `apps/mobile/src/design/theme.ts`

**Interfaces:**
- Consumes: approved composition and the rendered Nearby state.
- Produces: a passing Product Design QA report, Impeccable phase evidence, and a browser-open local Expo Web preview.

- [ ] **Step 1: Start Expo Web and capture the Nearby fixture state at the same normalized mobile viewport as the approved comp**

Run: `pnpm --filter @animalhelper/mobile dev -- --web --port 8081`

- [ ] **Step 2: Verify primary interactions and console**

Test both CTAs, five tabs, fallback copy, large text/reflow, keyboard focus and reduced transparency. Record any console error.

- [ ] **Step 3: Compare source and implementation together**

Put `apps/mobile/.impeccable/mocks/sheltered-link-atlas-a.png` and the implementation capture in one comparison input. Fix all P0/P1/P2 findings in one batch, recapture once, and stop after the confirmation pass.

- [ ] **Step 4: Save `design-qa.md`**

The file must include source/implementation paths, viewport and density normalization, full-view/focused-region evidence, history of fixes, interaction checks, console result, and exactly `final result: passed` or `final result: blocked`.

- [ ] **Step 5: Advance Impeccable build phases only with their actual gates**

Record the plates-only hero, complete semantic hero, remaining states, purposeful motion, native responsive captures and finish review. Never force a failed comp gate.

- [ ] **Step 6: Commit verified evidence and fixes**

```bash
git add design-qa.md apps/mobile/.impeccable apps/mobile/PRODUCT.md apps/mobile/assets/plates docs/superpowers/plans/2026-08-30-google-map-nearby-atlas.md
git commit -m "docs(design): verify Google Maps nearby atlas"
```
