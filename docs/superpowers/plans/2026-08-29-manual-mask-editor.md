# WhiskerCommons Manual Mask Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the mobile manual opaque-mask editor with selection, bounded movement, four-corner resize, single deletion and accessible equivalent controls while preserving fail-closed reviewed-media semantics.

**Architecture:** Pure normalized geometry functions own all mask transformations and hit testing. A focused React Native overlay component translates gestures and labelled controls into complete mask snapshots; the existing review screen invalidates receipts synchronously and performs one canonical re-render per committed mutation through the existing render/cache coordinators.

**Tech Stack:** Expo 57, React 19, React Native 0.86 responder system, TypeScript 6, Jest, Testing Library React Native, existing Skia-based canonical renderer.

**Spec:** `docs/superpowers/specs/2026-08-29-manual-mask-editor-design.md`

## Global Constraints

- Mask rectangles remain normalized `PrivacyMask` values in `[0, 1]`.
- The minimum normalized mask edge is exactly `0.04`; accessible adjustment step is exactly `0.02`.
- Default masks remain exactly `0.24 × 0.14`.
- Last mask in the array is topmost for hit testing and overlay stacking.
- Every pixel-changing mutation dispatches `masks_changed` and clears the receipt before asynchronous rendering starts.
- Every render uses the immutable canonical JPEG plus the complete next mask list.
- Failed/stale renders cannot restore confirmation or staging eligibility.
- Automatic people, licence-plate and cat detector status remains `unavailable`; no publish action is added.
- No new runtime dependency is required.

---

### Task 1: Pure mask geometry

**Files:**
- Modify: `apps/mobile/src/media/redaction-geometry.ts`
- Modify: `apps/mobile/src/media/redaction-geometry.test.ts`

**Interfaces:**
- Consumes: `PrivacyMask`, `NormalizedRect` from `apps/mobile/src/media/contracts.ts`.
- Produces:

```ts
export const MIN_MASK_EDGE = 0.04;
export const ACCESSIBLE_MASK_STEP = 0.02;
export type MaskCorner = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
export type MaskHit = Readonly<{ maskId: string; part: 'body' | MaskCorner }>;
export function createDefaultMask(id: string, point: NormalizedPoint): PrivacyMask;
export function hitTestMasks(input: HitTestInput): MaskHit | null;
export function moveMask(mask: PrivacyMask, delta: NormalizedPoint): PrivacyMask;
export function resizeMaskFromCorner(mask: PrivacyMask, corner: MaskCorner, point: NormalizedPoint): PrivacyMask;
export function adjustMask(mask: PrivacyMask, action: AccessibleMaskAction): PrivacyMask;
export function normalizedRectToPreview(rect: NormalizedRect, frame: PreviewFrameInput): PreviewRect | null;
```

- [ ] **Step 1: Write failing geometry tests**

Add table-driven tests proving: aspect-fit preview transforms for landscape and portrait images; letterbox rejection; default-mask boundary clamping; reverse-order topmost hit selection; four corner handle hits before body hits; bounded movement at every edge; all four corner resizes; minimum edge enforcement; non-finite fail-closed behavior; and accessible actions producing the same bounded transformations.

Representative assertions:

```ts
expect(createDefaultMask('m1', { x: 0.99, y: 0.99 }).rect)
  .toEqual({ x: 0.76, y: 0.86, width: 0.24, height: 0.14 });
expect(moveMask(mask, { x: 1, y: 1 }).rect)
  .toEqual({ x: 1 - mask.rect.width, y: 1 - mask.rect.height, ...size });
expect(resizeMaskFromCorner(mask, 'top_left', { x: 0.99, y: 0.99 }).rect.width)
  .toBe(MIN_MASK_EDGE);
expect(hitTestMasks(overlappingMasks)).toMatchObject({ maskId: 'last', part: 'body' });
```

- [ ] **Step 2: Run the focused test and capture RED**

Run: `pnpm --filter @animalhelper/mobile test -- redaction-geometry.test.ts`

Expected: FAIL because the new exports and behaviors do not exist.

- [ ] **Step 3: Implement finite, bounded pure geometry**

Use one internal aspect-fit content-frame calculation for tap normalization, preview projection and tolerance conversion. Clamp deltas and resize points before constructing immutable output masks. Preserve the original mask object when an operation has no effect so the UI can disable boundary actions without triggering a redundant render.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- redaction-geometry.test.ts
pnpm --filter @animalhelper/mobile typecheck
git diff --check
```

Expected: all geometry tests pass, typecheck exits 0 and diff check is clean.

- [ ] **Step 5: Commit**

```powershell
git add -- apps/mobile/src/media/redaction-geometry.ts apps/mobile/src/media/redaction-geometry.test.ts
git commit -m "feat(mobile): add bounded mask geometry"
```

### Task 2: Gesture and accessibility overlay

**Files:**
- Create: `apps/mobile/src/media/MaskEditorOverlay.tsx`
- Create: `apps/mobile/src/media/MaskEditorOverlay.test.tsx`

**Interfaces:**
- Consumes: Task 1 geometry exports and `PrivacyMask`.
- Produces:

```ts
export type MaskEditorOverlayProps = Readonly<{
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  masks: readonly PrivacyMask[];
  selectedMaskId: string | null;
  disabled: boolean;
  createMaskId(): string;
  onSelectionChange(maskId: string | null): void;
  onMutationPreview(masks: readonly PrivacyMask[]): void;
  onMutationCommit(masks: readonly PrivacyMask[]): void;
}>;
```

- `onMutationPreview` updates overlay/review mask state synchronously during an active move/resize so a previous receipt is invalidated on the first effective pointer movement.
- `onMutationCommit` fires once for add, delete, clear or completed gesture and is the only callback that requests JPEG rendering.

- [ ] **Step 1: Write failing component tests**

Use a deterministic `createMaskId` and synthetic layout. Prove: empty tap adds/selects one mask; mask tap selects without adding; body drag previews then commits one bounded move; each corner drag commits the expected resize; delete removes only selected ID; selection is retained for ordinary rerenders and cleared if the selected ID disappears; disabled state emits no mutation; and labelled move/resize/delete buttons invoke the same geometry rules.

Representative queries:

```ts
fireEvent.press(view.getByRole('button', { name: 'Move selected mask left' }));
expect(onMutationCommit).toHaveBeenCalledWith([expectedMovedMask]);
fireEvent.press(view.getByRole('button', { name: 'Delete selected mask' }));
expect(onMutationCommit).toHaveBeenCalledWith([unselectedMask]);
```

- [ ] **Step 2: Run the component test and capture RED**

Run: `pnpm --filter @animalhelper/mobile test -- MaskEditorOverlay.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the overlay without a new dependency**

Use React Native responder callbacks on one absolute overlay. At responder grant, snapshot the selected hit and initial normalized point. During movement, derive the next complete mask array from that immutable snapshot and emit preview only after an effective change. At release, emit one final snapshot. Render mask outlines and four at-least-44-point hit targets for the selected mask, but keep visible corner dots compact. Render accessible controls as ordinary `Pressable` buttons below the preview; their labels must exactly describe move, width, height and deletion actions.

- [ ] **Step 4: Run component, geometry and type checks**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- MaskEditorOverlay.test.tsx redaction-geometry.test.ts
pnpm --filter @animalhelper/mobile typecheck
git diff --check
```

Expected: all focused tests pass, typecheck exits 0 and diff check is clean.

- [ ] **Step 5: Commit**

```powershell
git add -- apps/mobile/src/media/MaskEditorOverlay.tsx apps/mobile/src/media/MaskEditorOverlay.test.tsx
git commit -m "feat(mobile): add accessible mask controls"
```

### Task 3: Fail-closed review-screen integration

**Files:**
- Modify: `apps/mobile/app/report/redaction-review.tsx`
- Modify: `apps/mobile/src/media/redaction-review.test.tsx`
- Modify: `docs/iteration-plan.md`

**Interfaces:**
- Consumes: `MaskEditorOverlay`, complete mask snapshots, existing `reduceMediaReview`, `createRenderCoordinator`, `createProcessorCacheLifecycle` and `renderOpaqueMasks`.
- Produces one screen-local function:

```ts
async function commitMaskMutation(nextMasks: readonly PrivacyMask[]): Promise<void>
```

It must dispatch `masks_changed` before setting busy or awaiting any operation, render from `canonical`, adopt only the current result, then dispatch `rendered_changed`.

- [ ] **Step 1: Extend screen tests before integration**

Mock the focused overlay at its module boundary and capture its props. Prove that an edit preview clears a pre-existing receipt synchronously; an edit commit calls `renderOpaqueMasks({ canonical, masks: exactSnapshot })`; confirmation is disabled during the render; a successful current render restores `needs_review` with the new pixels but no receipt; a failed render stays non-stageable; deleting one mask does not clear others; and the screen still exposes unavailable detector copy with no publish action.

Add a rapid-operation test showing the second mutation cannot begin while the first render owns the coordinator, and a stale completion cannot overwrite a newer selection lifecycle.

- [ ] **Step 2: Run the screen test and capture RED**

Run: `pnpm --filter @animalhelper/mobile test -- redaction-review.test.tsx`

Expected: new overlay integration and receipt-invalidation assertions fail.

- [ ] **Step 3: Replace fixed tap mutation with the overlay**

Remove `maskAt` and `addMask` from the screen. Keep selection UI state non-persistent. Route overlay preview snapshots through `masks_changed` only; route commit snapshots through `commitMaskMutation`. Keep clear-all as a mutation through the same function. Disable overlay and confirmation while busy or a durable journal is pending. Preserve all cache adoption/release and unmount cleanup behavior.

- [ ] **Step 4: Update iteration evidence language**

Change the Sprint 2–3 manual-mask line to state that selection, move, resize, single deletion and accessible controls are implemented and locally verified; do not claim native physical-device or real-user-photo evidence.

- [ ] **Step 5: Run focused and full mobile verification**

Run:

```powershell
pnpm --filter @animalhelper/mobile test -- redaction-geometry.test.ts MaskEditorOverlay.test.tsx redaction-review.test.tsx review-policy.test.ts render-coordinator.test.ts processor.test.ts
pnpm --filter @animalhelper/mobile test
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
git diff --check
```

Expected: all focused and mobile tests pass, typecheck/build exit 0 and diff check is clean.

- [ ] **Step 6: Commit**

```powershell
git add -- apps/mobile/app/report/redaction-review.tsx apps/mobile/src/media/redaction-review.test.tsx docs/iteration-plan.md
git commit -m "feat(mobile): complete manual mask editing"
```

### Task 4: Visual and branch-level verification

**Files:**
- Modify only if evidence reveals a defect in Task 1–3 files.

**Interfaces:**
- Consumes the completed editor and existing Expo web/native configuration.
- Produces review evidence; it does not introduce a new product contract.

- [ ] **Step 1: Run repository verification**

Run:

```powershell
pnpm verify
git diff --check
git status --short --branch
```

- [ ] **Step 2: Render the mobile route and inspect the editor**

Start the local Expo web build only as a visual harness. Verify aspect-fit overlay alignment, selected/unselected contrast, four handles, the compact control panel, disabled/busy states and narrow-phone wrapping. Use synthetic test media only. Record that native touch behavior still requires a physical-device gate if it has not been run.

- [ ] **Step 3: Request independent whole-task review**

Give the reviewer the spec, this plan, implementation report and complete diff from the pre-task base. Require separate spec-compliance and code-quality verdicts, with special attention to receipt invalidation timing, stale async render containment, accessibility equivalence and gesture geometry.

- [ ] **Step 4: Commit any reviewed correction as one bounded fix**

If review finds a load-bearing defect, use one fix agent, rerun the affected focused tests and one scoped re-review. Otherwise record the clean verdict without an empty commit.
