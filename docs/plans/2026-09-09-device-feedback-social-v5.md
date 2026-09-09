# Device feedback v5 implementation plan

**Goal:** Make the installed app complete at the point of use: language-aware demo names, visible device-location actions, native Apple place search, a compact recoverable report flow, a browsable social hub, human/custom avatars, and a distinctive anime cat icon.

**Architecture:** Keep existing report/auth ownership and delayed-public-cat contracts. Add a small native MapKit search adapter (public place coordinates are distinct from cat observations), a shared foreground-location action, and dedicated profile-avatar storage rather than reusing quarantined sighting uploads. Evolve social RPCs additively. Continue implementation in the existing isolated worktree; one writer, independent read-only reviews where they help.

## User feedback is the acceptance baseline

0.2.1 automated success did not establish device usability. Report's location button currently only selects a mode; its API call occurs during final submission. Map has no current-device location action. Mixed sample names are literal stored strings. Report hub renders all drafts with generic labels. Community RPCs can read posts anonymously, but the page foregrounds a composer and empty feeds feel like a form. Profile defaults to the cat glyph with only six choices. These are concrete gaps, not reasons to add another audit framework.

## Delivery slices

- [ ] **Names and location:** localise only the known unchanged synthetic fixture names; preserve actual resident names/renames. Apply across nearby, map, cat detail, care, following and identity lists. Make the report location button request immediately; share permission/progress/denial/services-off handling with Map. Hold coordinates only in memory and discard on background/route cancellation. Tests: locale switch, custom name preservation, immediate request, late response, denied/settings, submit selected coordinates.
- [ ] **Apple search:** native `MKLocalSearch` for Singapore postal codes, streets and buildings; debounced query, result state, selection and map focus, current-location control. Search destinations represent public places, not precise cat pins. Test empty/error/cancel/race/result bounds and native compilation; user verifies postal/building results on iPhone.
- [ ] **Report:** compact start screen, recent-draft preview and separate full draft list; useful date/context/status, separate draft collection and submitted report entry. Streamline steps and copy while retaining photo/camera/library, recovery, review and explicit submit. Test interrupted drafts, long lists, delete/continue and owner changes.
- [ ] **Community:** browse-first global/neighbourhood/cat feeds; standalone composer, post details/replies, likes, useful author/avatar metadata and cat attachments; image presentation uses genuinely public cat portraits. Do not fabricate residents, engagement counts or conversations to make the feed appear active. Extend user photo posts only with their own media lifecycle if included, never manufacture a report to upload social media.
- [ ] **Profile:** human default plus a larger set of presets; clear edit form; custom camera/library avatar flow with first-use permissions, processed preview, cancel/revert and persistence. Dedicated authenticated upload, sanitised image, owner replacement/cleanup and constrained public read. Keep user-selected old presets available.
- [ ] **Visual pass:** ordinary native text hierarchy and separators; fewer oversized rounded containers; concise copy; restrained glass controls. New original anime cat icon with a warm/cobalt direction, no green field. Save resources, source licenses and changed-screen references in the project.
- [ ] **Deliver:** focused tests per slice, one final full regression/CI and native build; deploy only changed backend components through existing release path. Verify the exact IPA and write device checklist. Installed appearance, real permission sheets and live Apple search remain device acceptance items.

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
