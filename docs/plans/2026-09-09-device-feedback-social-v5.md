# Device feedback v5 implementation plan

**Goal:** Make the installed app complete at the point of use: language-aware demo names, visible device-location actions, native Apple place search, a compact recoverable report flow, a browsable social hub, human/custom avatars, and a distinctive anime cat icon.

**Architecture:** Keep existing report/auth ownership and delayed-public-cat contracts. Add a small native MapKit search adapter (public place coordinates are distinct from cat observations), a shared foreground-location action, and dedicated profile-avatar storage rather than reusing quarantined sighting uploads. Evolve social RPCs additively. Continue implementation in the existing isolated worktree; one writer, independent read-only reviews where they help.

## User feedback is the acceptance baseline

0.2.1 automated success did not establish device usability. Report's location button currently only selects a mode; its API call occurs during final submission. Map has no current-device location action. Mixed sample names are literal stored strings. Report hub renders all drafts with generic labels. Community RPCs can read posts anonymously, but the page foregrounds a composer and empty feeds feel like a form. Profile defaults to the cat glyph with only six choices. These are concrete gaps, not reasons to add another audit framework.

## Delivery slices

Checked items mean implementation and engineering delivery are complete. Real iPhone permission sheets, map results and visual acceptance remain pending the user's test.

- [x] **Names and location:** localise only the known unchanged synthetic fixture names; preserve actual resident names/renames. Apply across nearby, map, cat detail, care, following and identity lists. Make the report location button request immediately; share permission/progress/denial/services-off handling with Map. Hold coordinates only in memory and discard on background/route cancellation. Tests: locale switch, custom name preservation, immediate request, late response, denied/settings, submit selected coordinates.
- [x] **Apple search:** native `MKLocalSearch` for Singapore postal codes, streets and buildings; debounced query, result state, selection and map focus, current-location control. Search destinations represent public places, not precise cat pins. Test empty/error/cancel/race/result bounds and native compilation; user verifies postal/building results on iPhone.
- [x] **Report:** compact start screen, recent-draft preview and separate full draft list; useful date/context/status, separate draft collection and submitted report entry. Streamline steps and copy while retaining photo/camera/library, recovery, review and explicit submit. Test interrupted drafts, long lists, delete/continue and owner changes.
- [x] **Community:** browse-first global/neighbourhood/cat feeds; standalone composer, post details/replies, likes, useful author/avatar metadata and cat attachments; image presentation uses genuinely public cat portraits. Do not fabricate residents, engagement counts or conversations to make the feed appear active. Extend user photo posts only with their own media lifecycle if included, never manufacture a report to upload social media.
- [x] **Profile:** human default plus a larger set of presets; clear edit form; custom camera/library avatar flow with first-use permissions, processed preview, cancel/revert and persistence. Dedicated authenticated upload, sanitised image, owner replacement/cleanup and constrained public read. Keep user-selected old presets available.
- [x] **Visual pass:** ordinary native text hierarchy and separators; fewer oversized rounded containers; concise copy; restrained glass controls. New original anime cat icon with a warm/cobalt direction, no green field. Save resources, source licenses and changed-screen references in the project.
- [x] **Deliver:** focused tests per slice, one final full regression/CI and native build; deploy only changed backend components through existing release path. Verify the exact IPA and write device checklist. Installed appearance, real permission sheets and live Apple search remain device acceptance items.

## References

- [Apple MKLocalSearch.Request](https://developer.apple.com/documentation/mapkit/mklocalsearch/request): natural-language address/POI search.
- [Bluesky social-app](https://github.com/bluesky-social/social-app), [license](https://github.com/bluesky-social/social-app/blob/main/LICENSE): feed/composer separation and reply context; reference structure, not a whole dependency.
- [Mastodon iOS](https://github.com/mastodon/mastodon-ios): native feed/detail/navigation reference; no GPL source incorporated.

## Product checks

The user can find a building by postcode, see their own location after an explicit action, start a report without reading operational prose, leave and resume a named draft, browse/join real conversations, and recognise their chosen avatar and the app icon. Existing synthetic cats stay labelled as test content and do not count as product activity.

## Implementation status · 2026-09-10

Names, immediate foreground location, native search adapter, compact draft collection, browse-first social feed with replies/likes, human/custom avatars and new artwork are implemented. Local full verify passed: 95 mobile suites / 972 tests, admin and service tests, type checks and builds. All eight Edge entrypoints pass pinned Deno checks. SQL checks required the container's password-authenticated TCP connection for their existing two-session race tests; the erased-author fallback found there was corrected. Hosted deployment and iOS compilation remain pending at this entry.

The community is a working shared feed, not a fabricated active network. Current posts support text and association with a public cat portrait; arbitrary social photo/video uploads, follows between people and algorithmic recommendations are future work. Cat samples are still the existing 16 labelled synthetic records, now localised in the UI. Native search results do not auto-fill a report. Custom avatars are locally resized to 512px, stripped of source metadata, previewed and explicitly saved; this release has no manual crop editor.

Avatar cleanup is a private due-job worker. Account-erasure processing invokes it alongside existing media workers; the operator can invoke `cleanup-profile-avatars` again after the upload-credential window (at most 2h15 from reservation). There is currently no periodic cleanup scheduler. Old objects become unreadable immediately on replacement, but queued physical deletion must not be described as already complete. Before a public production launch, schedule the existing worker and measure oldest pending-job age; do not add another user-facing approval step.

Full source CI passed for `a91f27667333bfecedc2a6362726eb3145d4220e`: [run 34375166289](https://github.com/ZP151/anicare/actions/runs/34375166289), including all database contracts from clean migrations. Hosted correctness completed successfully; provenance promotion and iOS build follow.


### Native dependency transport repair

Candidate run 34375967578 (attempts 1–2) could not resolve the existing RN 0.86.3 prebuilt artifacts: canonical Maven requests redirected and returned `X-Maven-Proxy-Upstream-Status: 522` with a transient 404. The same exact artifacts return 200 from the [GCS Maven Central mirror](https://maven-central.storage.googleapis.com/index.html), an independently maintained mirror hosted on Google Cloud Storage, not an officially supported Google product. The native build now scopes a curl transport adapter to the two public React Native/Hermes Maven namespaces during the native build. Version selection, canonical podspec identity, RN's tarball checksum handling and `pod install --deployment` remain intact. Other hosts/paths/arguments are passed through; no credentials are redirected. The reviewed Podfile.lock is unchanged.

Final candidate source `9977e2927ac74aaa51de0378d171cdcdae171bbf` passed [main CI 34377033706](https://github.com/ZP151/anicare/actions/runs/34377033706). iOS build [34377035450](https://github.com/ZP151/anicare/actions/runs/34377035450) is in progress; native acceptance is not yet claimed.


## Delivered · 2026-09-10

0.3.0 (6) IPA delivered from `9977e2927ac74aaa51de0378d171cdcdae171bbf`, successful native run 34377035450 attempt 1. Verified provenance, 3-file artifact allowlist, size/hash, unchanged reviewed Pod lock, version, bundle ID, all three usage descriptions and nonblank opaque AppIcon. `WhiskerPlaceSearch.mm` compiled successfully and its module is present in the final binary. The engineering release is complete; device acceptance remains pending. The failed 34375967578 attempts did not produce a deliverable and are superseded.

Next iteration follows the [device checklist](../ios-next-device-test.md): first reproduce any failing report/permission/search path, then refine the observed layout. Social photo/video upload and automated avatar cleanup scheduling remain separately scoped follow-up work, not claims about this release.

## Device acceptance follow-up · 2026-09-10

User provisionally accepted 0.3.0 checks 1–7 including native glass except sample-name localization and missing seeded discussions. The earlier statement that sample names were localized missed the actual provisioned suffix. A regression now consumes all 16 provisioner aliases, including `测试样本 Sxx`; a known fixture displays a locale-specific name with a separate synthetic badge, while resident renames remain untouched.

Current continuation: 8 persistent, visibly synthetic posts and 8 replies (no fabricated accounts or likes), translated from the same fixture definitions used by the provisioner, plus the first personal-content slice, My Posts. Ownership comes from the server session, with ordinary existing public visibility and deletion rules. Existing users’ posts and reactions are preserved across reseeding. Native image post upload, a personal photo gallery and scheduled media cleanup remain the next delivery slices.

0.3.1 local verification: full `pnpm verify` exited 0 using the existing project Python 3.12 virtual environment; 97 mobile suites / 981 tests passed, plus workspace tests, type checks and builds. New SQL 036 passed 10 ownership/pagination/visibility assertions. Focused independent review found no blockers. Map locale switching now reprojects cached rows without refetching or closing the selected neighbourhood; its actual stored-name route regression passed. Hosted deployment, seed import and IPA delivery follow; this is not a claim of new device acceptance.

Hosted 0.3.1 backend deployment passed [34384126918](https://github.com/ZP151/anicare/actions/runs/34384126918), including exact migration head 202609100014; its provenance was verified and promoted. Sample import [34384144168](https://github.com/ZP151/anicare/actions/runs/34384144168) succeeded and anonymously read all 8 posts, their 8 replies and reaction metadata. [Import manifest](../test-samples/ios-v1/deployed-34384144168.json). Source CI 34384126920 stopped because a UUID-only literal heuristic misclassified date-only test timestamps; test-only follow-up 60d7993 uses explicit ISO timestamps, passes local UUID and SQL checks, and is being verified by CI 34384532002.

### 0.3.1 (7) delivered

The timestamp follow-up passed CI 34384532002. Final source `b71ea0b6f74384c29b163c04e28f149da262889c` passed [main CI 34384959766](https://github.com/ZP151/anicare/actions/runs/34384959766), including all 36 SQL contract files, and [native run 34384960294](https://github.com/ZP151/anicare/actions/runs/34384960294), attempt 1. The downloaded IPA is 21,562,625 bytes with SHA-256 `0821e7b5fda38f643e0d9a670e938fcf7147e84373076ec1d81ad06f8da21ec3`. Provenance, artifact allowlist, manifest/hash/size, source lock files, bundle version 0.3.1 build 7, bundle ID, three permission descriptions and nonblank AppIcon were checked. [IPA and incremental device checklist](../ios-next-device-test.md).

This closes the engineering delivery for the two reported defects and the My Posts continuation slice. User confirmation of the three changed device paths remains pending; accepted 0.3.0 glass and other unchanged flows retain their provisional baseline. Single-image social upload, My Photos/home community and scheduled cleanup remain explicitly planned in [M6.3–M6.5](../product-goals.md).
