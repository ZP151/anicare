# WhiskerCommons Manual Mask Editor Design

## Scope

This design completes the existing Sprint 2–3 manual opaque-mask workflow. It upgrades the current fixed-size tap-to-add prototype so a user can select, move, resize and delete one mask at a time before confirming the exact rendered JPEG.

It does not add automatic people, licence-plate or cat detection, public publication, freehand drawing, rotation, non-rectangular masks, remote image processing or real-user test media.

## Interaction model

The review preview remains an aspect-fit rendering of the canonical image. Letterbox and pillarbox space is never editable.

- Tapping empty image content adds one bounded default rectangular mask and selects it.
- Tapping a mask selects the topmost hit mask without adding a new mask.
- Dragging a selected mask body moves it while keeping the entire rectangle inside the image.
- Dragging any of the four visible corner handles resizes against the opposite corner while preserving a minimum width and height.
- A selected mask can be deleted without clearing other masks.
- Clear all remains available as an explicit separate action.
- Selection itself does not alter pixels or invalidate confirmation.
- Any add, move, resize, single delete or clear-all mutation immediately sets the media review state to `needs_review` and clears the old receipt before asynchronous JPEG rendering begins.
- Rendering always starts from the immutable canonical JPEG plus the complete current mask list; it never paints incrementally on the previously rendered JPEG.
- Confirmation stays disabled while a mutation render is pending or failed.

Only a completed, current render may replace `review.rendered`. A stale or failed render never restores an old receipt and never makes the media stageable.

## Geometry and ordering

Mask rectangles stay normalized to image content coordinates in `[0, 1]`, preserving the existing `PrivacyMask` contract and native renderer.

- The last mask in the array is visually and interactively topmost.
- The minimum normalized edge is `0.04`.
- Default masks retain the existing `0.24 × 0.14` size and are centered on the valid tap, clamped to the image.
- Hit testing receives a screen-space tolerance converted independently through the rendered content width and height so handle and edge behavior is stable across aspect ratios.
- Geometry helpers reject non-finite dimensions, points and rectangles rather than propagating invalid mask state.

## Accessible equivalents

The selected mask exposes ordinary labelled buttons, not gesture-only custom actions:

- Move left, right, up and down by `0.02` normalized units.
- Make wider, narrower, taller and shorter by changing the far edge in `0.02` normalized units while applying the same bounds and minimum-size rules as touch resizing.
- Delete selected mask.

Buttons use disabled state whenever the requested movement or resize has no effect at a boundary, while rendering is in flight, or while a durable reviewed-media journal is pending. The selected mask and mask count are announced in text.

## State and rendering boundary

Pure geometry lives outside the screen component and is covered by table-driven tests. A focused overlay component owns selection and gesture interpretation but does not render JPEG bytes. The screen owns one mutation coordinator:

1. receive a complete next mask snapshot;
2. immediately dispatch `masks_changed` so the receipt becomes null;
3. start the existing cache lifecycle mutation;
4. render `canonical + nextMasks` through `renderOpaqueMasks`;
5. adopt only the current render result;
6. dispatch `rendered_changed` and re-enable confirmation.

Gesture previews may update the overlay locally, but the screen commits exactly one JPEG render when the gesture ends. Button operations commit immediately. Existing render-coordinator single-flight and cache cleanup rules remain authoritative.

## Visual direction

The editor stays consistent with the existing iOS-oriented glass surface rather than adding a second design system. The selected mask uses a high-contrast border, four visible corner handles and a compact glass control panel. Unselected masks retain a subtler outline. The burnt mask remains fully opaque black in final pixels; selection chrome is UI-only and never part of the output JPEG.

## Safety and release gates

- The selected source URI and bytes never cross the upload boundary.
- Every pixel-changing edit invalidates the previous receipt before rendering begins.
- Failed or stale renders remain `needs_review` and cannot be staged.
- Mask rectangles cannot leave the image or become smaller than the minimum edge.
- Single deletion cannot delete a different or all masks.
- Accessibility controls and touch gestures use the same pure geometry operations.
- Automatic detector status remains visibly `unavailable` and public upload/publish controls remain absent.
- Tests use synthetic URIs and metadata only; no real user media enters fixtures, logs or snapshots.
