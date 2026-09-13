# Global simplification — 0.4.18 (26)

User direction: prefer icons, photographs and directional controls across the app; remove repetitive instructions and obvious action labels. This is a UI refinement of 0.4.17, not a new roadmap feature or a sample-data migration.

## Implemented

- Native and fallback navigation use destination icons with localized accessibility names and selected states. Native sliding glass selection and the separate Create circle remain.
- Report progress uses four tappable icons. Back, save/exit and forward use consistent symbols; photo skip and final submit retain short labels. Condition choices form a compact three-column group, separate from optional appearance.
- Photo replacement/removal use icons; location choices retain short captions beside their icons. Review removes repeated instructions; receipt navigation is one compact glass dock. Identity help expands from an information icon, with the review requirement always visible; selecting a portrait still requires explicit confirmation, and its photo remains enlargeable.
- Composer uses close/send, photo count, and compact cat selection. Photo rotation/mirror/reset and avatar camera/library controls use icons. Crop ratios, actual names and photo content remain visible.
- Draft sort/selection/select-all/delete tools use icons; date groups, filters, counts and deletion confirmation remain. Both post and sighting lists share this component.
- Compact follow uses outlined/filled hearts; cat-story pagination, message pagination/retry, care recovery and privacy request pagination use consistent directional or retry symbols.
- Shared IconAction preserves a minimum 48-point target, disabled/busy/selected/expanded semantics and full accessible names. InfoDisclosure reveals optional explanations in place.

## Boundaries

Names, neighbourhoods, content, meaningful choice labels, errors, eligibility requirements, privacy consequences and destructive confirmation retain concise text. An icon-only interface must still distinguish a failed action from a completed one. No change to API authorization, identity decisions, report state transitions, photo processing, fixture ownership, or deletion policy is intended.

## Verification

Independent review identified ambiguous location choices, hidden identity review/skip meaning, and an ellipsis that opened Block directly. All three were corrected and independently re-reviewed without blockers. Final `pnpm verify` passed: all workspace lint, types, tests and builds; 151 mobile suites / 1,320 tests. Coverage includes named icon states, disclosure expansion, draft filters/batch ownership, the separate Block confirmation, report step recovery, receipt selection and image editing. Existing tests that selected changed button text now target retained accessible names. Device appearance remains pending: automated tests do not prove native glass, safe-area or large-text quality.

## Device acceptance (pending)

1. Navigate through all four bottom icons; the plus still opens Create and sliding tab selection works.
2. Publish a six-photo post: open/edit/reorder photos, save/restore a draft and submit. Long-press photo actions remain available.
3. Report: step icons allow returning to completed steps; save/exit restores the same draft; location choices, short condition choices and submit work. Receipt portrait selection does not submit until confirmed.
4. Draft management: sort/filter, long-press selection, select all and confirmed deletion. Pending drafts remain protected.
5. On post/cat/message/profile screens, verify icons are reachable in Chinese/English, dark mode and large text. VoiceOver announces each action, selection and busy state.

Previous acceptance records remain unchanged. No new sample fixtures are part of this candidate.

## Build provenance

- Source: `74e3b492f5fbf2112e43e4195609b3c8378a6429` (includes the help control alongside the identity heading, avoiding an extra full row). The final heading change passed typecheck and 34 focused tests.
- CI `34770682097`, attempt 2: application verification and database contracts passed. Attempt 1 passed pgTAP and database lint but its environment-readiness test timed out at 5 seconds; the failed job was rerun without changing or skipping a gate.
- Native candidate run: `34771236179`, source pinned as above; passed. Artifact `10322805224`; exact three-file manifest, GitHub provenance, SHA-256/byte count, pinned pnpm/Pod locks, native arm64 executable, version/build and app icons all verified.
- Delivered file: `C:/Users/15492/Downloads/WhiskerCommons-0.4.18-build26.ipa`; 21,968,980 bytes; SHA-256 `e0430cf74014773779da7f0ed41ebe1fcf13d5b5e8746192642d0ed1f03ca0d6`.
- Device acceptance remains pending; native glass and interaction quality are not inferred from CI.
