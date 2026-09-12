# 0.4.11 (19): photo editing, report flow and draft management

The user accepted 0.4.10. This iteration preserves the map, native glass navigation, six photo slots and drag reordering.

- Photo cells have no persistent Cover / Make cover or remove buttons. Tap opens editing; a stationary long press opens edit, cover, move, replace and remove actions. A moving long press still reorders.
- Editing supports rotation, mirroring, centered original / square / 3:4 / 4:3 crops, resetting the current session and native zoom preview. Done atomically stores a new image identity and bytes in the encrypted draft. Cancel, failure, background and owner change retain the original and clear temporary previews. Free-position crop and historical undo are outside this slice.
- Reports have four steps: photo, condition/details, location/sharing, review. Condition comes first; optional appearance and public landmark fields expand on demand. The old visibility risk choice is retained in the location step. GPS behavior is preserved.
- Progress segments revisit reached steps while retaining the furthest durable stage. Resume still checks missing requirements. Legacy safety drafts map to area; map-origin drafts with a chosen area resume missing details.
- The report entry, photo step and receipt use fewer prominent controls and compact status rows. Receipt cat selection still requires confirmation. Report pages use adaptive light/dark colors.
- Post and sighting draft lists group by date, filter photo/text/pending, sort, select via long press, and confirm batch removal. Failed items remain visible with feedback. Owner changes stop the batch; pending post publication cannot be removed through editing management, including a concurrent phase change.
- The next management slice adds filters for photos and pending review to loaded My Reports history while preserving pagination and the existing session-only offline snapshot.
- Eight append-only bilingual sample stories and replies bring the catalogue to 56 posts and 56 base replies. They cover six-photo ordering, crop discussion, blurred movement, rear views, concealment and multiple cats using existing approved synthetic assets. Existing fixture identities and media positions are preserved. Hosted import is recorded below after verification.

Tests cover edit preview/confirm/cancel/failure, native processing cleanup, stationary long press and cross-row drag/cancel, batch confirmation/re-entry/session failure/partial completion, publishing-phase removal races, progress/resume and legacy report compatibility. Independent review found durable progress regression and missing interrupted-batch feedback; both were fixed with regressions.

Image processing uses the existing [Expo ImageManipulator API](https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/); no dependencies were added. Automated tests and builds do not replace iPhone validation of touch, safe areas, keyboard and image processing.

Full `pnpm verify` exited 0: mobile 132 suites / 1,167 tests, workspace lint, typecheck, tests and builds passed. Independent final review has no remaining blockers. Build, IPA integrity and hosted sample receipts follow after verification.

Final iOS handoff refinement: actions that present an editor or picker wait for the action sheet onDismiss. During this interval editing, closing and publishing are disabled. Owner changes, background and unmount cancel the pending action. The 17 composer tests and typecheck pass; independent review confirmed the publication guard. A fresh full verify is running for this final source.
