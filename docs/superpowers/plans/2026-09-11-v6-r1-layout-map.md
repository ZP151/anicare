# v6 R1 layout and map implementation plan

> For agentic workers: use superpowers:subagent-driven-development for this bounded slice. User approved the v6 design and goal-driven implementation on 2026-09-11; continue without a new design approval gate.

**Goal:** Make ordinary browsing compact, refreshable and map-first before adding social media.

**Architecture:** Reuse ScreenScaffold, native GlassSurface, react-native-maps Apple provider and existing public feed/portrait APIs. Preserve cached visible data during refresh. New native marker views display public cat portraits at existing area anchors, with bounded screen-space grouping and no synthetic coordinates.

**Tech Stack:** Expo 57 / RN 0.86, TypeScript, Jest, native maps 1.27.2.

**Spec:** `docs/plans/2026-09-11-social-v6-iteration.md`, R1 and global design rules.

## Global constraints

- iOS minimum 44×44 pt touch areas; Dynamic Type remains enabled. Preserve native glass and reduced-motion/transparency fallback.
- Cat map activity stays delayed/coarse; no random offsets or building-accurate pins. Apple POIs stay visible.
- Same account and locale protections as 0.3.1; preserve root checkout user changes. Existing worktree `codex/hosted-gate-2b` is the implementation checkout.
- No new backend, dependencies, release versions, or CI gates in this slice. Synthetic records remain labelled.

### Task 1: Compact scaffold and honest refresh

Files: modify `apps/mobile/src/components/ScreenScaffold.tsx`, `app/community/index.tsx`, `app/community/[id].tsx`; add `src/components/ScreenScaffold.test.tsx`; extend `src/api/community-routes.test.tsx`.

Interface: add optional `compact?: boolean`, `refreshing?: boolean`, `onRefresh?: () => void` to ScreenScaffold; caller owns request state. Native ScrollView receives RefreshControl and an accessibility refresh action; web gets a compact labelled refresh icon. Default compact title 22, horizontal space 16, section gap 16; body styles stay normal and scalable. Preserve explicit noncompact use where necessary.

- [ ] Write red tests for native empty-list refresh and retaining existing post content when a refresh fails. Example: `await fireEvent(view.getByTestId('screen-scroll'), 'refresh'); expect(view.getByText(existingBody)).toBeTruthy()`; trigger the RefreshControl callback when using native testing APIs.
- [ ] Run `pnpm --filter @animalhelper/mobile test -- --runInBand src/components/ScreenScaffold.test.tsx src/api/community-routes.test.tsx` and observe the missing behavior.
- [ ] Implement controlled refresh wiring; initial load differs from refresh, repeat refresh is single-flight, refresh replaces pagination only after success, account changes clear immediately and invalidate late writes.
- [ ] Run the same suites and typecheck. Remove routine native Refresh buttons only when the gesture is wired; retain visible error retry.

### Task 2: Collapsed map and distinct actions

Files: modify `apps/mobile/app/(tabs)/map.tsx`, `src/components/AppIcon.tsx`; add/extract `src/maps/MapBrowseSheet.tsx` if needed; extend `src/api/feed-screens.test.tsx`.

Interface: sheet state `collapsed | half | full`; filter visibility independent of map focus. `onSelectArea(id)` selects and opens half state. `desiredCommunity` deep link opens half. The map is never unmounted merely to show the list. Grip drag and a labelled expand/collapse button both change state. Filters are hidden by default behind `filters` icon.

- [ ] Red test: initial render does not expose region chips/list rows; expanding shows them; a deep link still opens the selected community; language changes preserve selection. Example: `expect(view.queryByText('North-East')).toBeNull(); await fireEvent.press(view.getByLabelText('Map filters')); expect(view.getByText('North-East')).toBeTruthy()`.
- [ ] Red test: two controls have different icon names; fit Singapore does not invoke device location. Expanded list RefreshControl retains selection and old data on failure.
- [ ] Implement top search row + filter sheet/panel, directions icon for device location and fit-arrows icon for all Singapore, 76pt collapsed summary and two expanded stops. Do not attach refresh to map gestures. Use close/chevron icons with accessible labels.
- [ ] Run feed screens, map and place-search suites plus typecheck. Preserve paging and county/neighbourhood drill-down; shorten visual metadata without altering geography.

### Task 3: Bounded public cat portrait clusters

Files: modify `src/maps/NearbyMap.native.tsx`, `src/maps/NearbyMap.types.ts`; add `src/maps/map-marker-clusters.ts` and tests, `src/maps/CatMapMarker.tsx` and tests; integrate portrait metadata in `app/(tabs)/map.tsx` using the same public profile media reader already used in community.

Interface: `NearbyMapProps` receives optional public portrait lookup keyed by animal ID. Cluster output has stable ID, original permitted anchor, area IDs, distinct cat IDs and representative portrait. Derive zoom grouping from viewport; target <=24 visible groups, include selected area preferentially. Never invent coordinates. Filter viewport and deduplicate selected parent/child cat counts.

- [ ] Red unit tests for >24 areas, repeated cats, selected region, invalid/missing portrait and zoom change. Example: `expect(new Set(markers.flatMap(m=>m.catIds)).size).toBe(expectedPublicCats); expect(markers.length).toBeLessThanOrEqual(24)` where all source points are in viewport.
- [ ] Red native render test: marker renders a public cat image or cat-symbol fallback, not area name/giant count; press selects original area(s). `tracksViewChanges` settles after image load/error and refreshes on changed image or selection.
- [ ] Implement stable aggregation and render view; batch portrait read and stale-session guard; do not make portrait failure remove available activity. User location uses distinct blue-dot marker, building search result remains place marker.
- [ ] Run native maps, cluster, feed and localization tests. Check no private/precise coordinates or perpetual marker snapshot loop introduced.

### Finish this slice

- [ ] Review changed behavior and associated tests once; repair actionable failures.
- [ ] Commit only scoped files and update this ledger with exact checks. Do not push/deploy/build yet; R2 integration follows in the same goal.

## Execution ledger

2026-09-11: Design approved. Parent coordinates and prepares R2 media/notification integration while one implementation agent owns this R1 slice. Existing diagnostic `.superpowers/sg-map/` files are not deliverables.

## Execution ledger · 2026-09-11

Implemented in 9877465, d6456e9 and d6bf42e. Focused map/scaffold/feed tests and mobile typecheck pass. Review corrections preserve data on refresh errors, batch portraits beyond 50 IDs, make multi-area markers selectable, fit the collapsed header, and respect Reduce Motion. Native visual acceptance is still pending the 0.4.0 IPA. No new design approval is required.
