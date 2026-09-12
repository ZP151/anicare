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

Full `pnpm verify` exited 0: mobile 132 suites / 1,168 tests, workspace lint, typecheck, tests and builds passed. Independent final review has no remaining blockers. Build, IPA integrity and hosted sample receipts follow after verification.

Final iOS handoff refinement: actions that present an editor or picker wait for the action sheet onDismiss. During this interval editing, closing and publishing are disabled. Owner changes, background and unmount cancel the pending action. The 17 composer tests and typecheck pass; independent review confirmed the publication guard. The final full pnpm verify also passed with 132 suites / 1,168 mobile tests.


## Verified delivery

- App source: `1c1a959365f5f6833d8f608e8f29522d7ff3df65`.
- [CI 34710337223](https://github.com/ZP151/anicare/actions/runs/34710337223): success.
- [Native build 34710351898](https://github.com/ZP151/anicare/actions/runs/34710351898): success. Package version 0.4.11 / build 19, arm64, permission strings, populated AppIcons and Assets.car verified. Provenance, exact manifest/three-file allowlist, byte size, SHA-256 and both source lockfile hashes match.
- [IPA](C:/Users/15492/Downloads/WhiskerCommons-0.4.11-build19.ipa): 21,912,813 bytes; SHA-256 `7df89791c193c9803d2745e479d40ba721573d8517dca195b3ecd3441a102e6a`.
- Sample import run 34709958821 wrote C01–C56 but failed its final extras query because the public RPC caps requests at 50 IDs. This is recorded as a failed workflow, not a successful run. Independent batched public verification passed: 56 posts, 56 replies, 112 attachments, 224 display/thumbnail variants, exact media ordering and hashes. [Public verification receipt](../test-samples/ios-v1/deployed-r0411-public-verified.json).
- The importer now reads extras in 50-item batches. Its 16 tests, typecheck and independent review passed. This tools-only fix does not change the compiled app or the sample catalogue, so no additional IPA is required. App and import source catalogue/provenance blobs are identical.
- Earlier native candidate 34709858252 was superseded and cancelled for the final iOS presentation handoff fix. The first import dispatch from main was rejected by existing environment branch rules; execution used the authorized test branch instead.

Use the existing Sideloadly configuration to install over the current version. Real iPhone touch, edit rendering, safe areas and four-step visual acceptance remain for the user's next check.
