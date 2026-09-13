# C1 breadth and glass navigation repair

User acceptance of 0.4.16: sample breadth, cat destination loading and profile/header layout rejected. Existing map and publishing acceptance remains recorded.

Direction: photos lead. One floating action row; distinct glass back, identity and action surfaces; no opaque full-width divider. Content scrolls behind chrome. Profile and title-led screens start with a large title beneath the controls and crossfade it into the centered compact header as it reaches the top. Preserve native tab implementation and accessibility material fallback.

Implementation:
1. Reproduce cat summary loading with production parser, add bounded retry/error recovery and isolate optional portrait loading. Verify account changes discard stale data.
2. Explicit route header ownership for user profile; shared overlay header and measured insets; scroll-driven title transition. Simplify user profile copy; glass post actions and feed toolbar.
3. Extend immutable fixture catalogue with eight distinct cat appearances and eight additional communities, retaining existing IDs/media assignments. Add unique generated originals, provenance and thumbnails. Interleave cat identities in Explore without changing pagination or Nearby ordering.
4. Regression tests for loading/navigation, inset/scroll behavior, fixture referential integrity, breadth and duplicate assets. Independent review; full checks; hosted fixture verification and next iOS candidate.

Acceptance: tap linked cat from feed and post; open author with one back button; scroll profile/post/feed behind glass; large title collapses smoothly in both languages and large text; twelve active fixture identities across twelve communities; no same-cat pairs in first Explore rows; existing multi-photo content remains accessible.
