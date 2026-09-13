# C1 breadth, navigation and glass repair — 0.4.17 (25)

Status: candidate and hosted samples delivered and verified; device acceptance pending. 0.4.16 rejection remains recorded. Accepted map/report behaviour is not reclassified.

## Observable changes

- Add eight distinct synthetic cat photographs, identities and linked posts across eight additional communities. Full catalogue: 12 cats, 16 linked posts, four credentialless sample authors, 24 unique images and 12 communities. Keep the original media ID ordering; provenance and generated-source records are in catalog-v3.md / asset-provenance.json. Explore interleaves identities and communities while preserving already displayed pages and the backend cursor. Nearby stays chronological.
- Cat profile navigation now loads the profile and shared stories. Error/retry is distinct from successful unavailable results. Cold-link Back returns to Home.
- Remove the duplicate native route header on sample profiles. Separate glass back/title/action pills float above scrolling content. Large headings collapse into compact identities; footers reserve space and remain above content/keyboard. Apply related chrome to messages, profile, reports and secondary detail screens.

## Proven failure mechanisms

1. Expo React Compiler discarded a callback dependency used only as an invalidation epoch. INITIAL_SESSION invalidated the first cat request but could not schedule a new focus callback. Opt this route out of memo compilation, retaining explicit dependencies. Regression compiles the real route using the production Expo preset. Removing the directive reproduces three failures; restored source passes all seven cases.
2. Late same-subject INITIAL_SESSION incremented the account epoch after anonymous post/story reads started. Their valid results were discarded. Deduplicate only settled identical subjects; reset the subject sentinel before reload. Changed-account epochs and final session pin verification remain intact. Two compiled-hook tests cover both same-null completion and changed-subject rejection.
3. Anonymous native photo requests omitted the public gateway apikey. Direct hosted probe: no header returned 401 UNAUTHORIZED_NO_AUTH_HEADER; the public key returned 200 image/jpeg (65,445 bytes for C57 thumb). Include the public key on image requests, preserving the matching user bearer for signed-in reads. The new regression failed before the fix and passes after it; failed authenticated reads still never become guest reads.

## Review and verification

- Independent UI/auth review found no release blocker; compiled route/hook tests 9 passed. Sample audit confirmed append-only media mapping and community cells.
- Browser preview confirmed Home → Honey → two shared stories → Back and Home → Lin with one Back. React Native Web ignores Image source headers; browser-only media display is not a release target here. Localhost photo reads are intentionally rejected by the existing origin allowlist (403); no hosted CORS policy was relaxed. Native-style public requests were verified separately.
- The temporary web SecureStore adapter and Metro configuration were removed before release. Web preview is not evidence of native glass quality.
- Final `pnpm verify` passed (150 mobile suites / 1,317 tests; provisioner 20 tests; all workspace lint, types, tests and builds). Exact retirement integration passed with rollback, including real-author, FK/polymorphic reference guards and rerun idempotence. Hosted fixture and IPA evidence follow below before delivery.

## Device checks (pending)

Follow docs/ios-next-device-test.md: varied Home, cat/story loading, one user Back, collapsing glass titles, public photos both signed out and signed in, and linked publishing. Large text/dark mode/native safe areas and two-account contribution still require device evidence.

## Data lifecycle

The existing exact-ID retirement and real-reference guards remain. Four older posts and eight older cat identities were retained by prior guards; no broad purge is authorized by this repair and no real author data is removed. Old provenance stays to make migration auditable. New identities do not represent real animals or sightings.

## Hosted verifier follow-up

Run 34767662923 stopped before new posts at `test_sample_discovery_failed`: the old verifier sent new cells to a filtered RPC limited to thirteen legacy fallback cells. All twelve portraits, summaries and exact-cell community activity had already passed. The verifier now pages the supported unfiltered discovery API and requires every fixture identity, with bounded pagination and repeated-cursor rejection. Exact-cell activity remains separately verified; no schema, read policy or user data was changed. The main map reads sightings, while the cat detail uses community activity. Independent SQL review approved this approach; provisioner 23 tests and typecheck pass. App source remains d1cd729ea3effc7371355d88e9118c197f8051de.

## Candidate provenance

- App source `d1cd729ea3effc7371355d88e9118c197f8051de`; [CI 34767662784](https://github.com/ZP151/anicare/actions/runs/34767662784) passed including database contracts.
- Native [run 34768019573](https://github.com/ZP151/anicare/actions/runs/34768019573), artifact `10321446282`: 0.4.17 (25), arm64, `sg.animalhelper.app`. GitHub attestation, exact source/workflow/main ref, strict three-file manifest, SHA256/size, source pnpm/Pod locks and native icon resources passed.
- IPA: `C:/Users/15492/Downloads/WhiskerCommons-0.4.17-build25.ipa`; 21,967,954 bytes; SHA256 `9c0278e68d5dcb7995955c38b6e198f7dd57c9060abe7d1c13487599ddc19b03`.
- Fixture-verifier-only follow-up `c1e974a0c570ea293b1aeda79d6658e2ba5c5468`; [CI 34768302100](https://github.com/ZP151/anicare/actions/runs/34768302100) and repeat full workspace verify passed. No app source changed after the native build source.

- Hosted apply [34768302216](https://github.com/ZP151/anicare/actions/runs/34768302216) succeeded on verifier source `c1e974a0c570ea293b1aeda79d6658e2ba5c5468`. [Receipt](../test-samples/ios-v1/catalog-v3-hosted-receipt.json) confirms twelve portraits/identities, sixteen posts/replies and twenty-four display/thumb pairs. All source/delivery hashes, public summaries, discoveries, exact-cell activity and post → cat → stories journeys passed. Retirement rerun retained the same four protected old posts and eight old cat identities; the receipt is cumulative/idempotent, not an additional 52-post deletion.

0.4.17 (25) is ready for Sideloadly overwrite installation. User device acceptance remains pending, especially native glass, title transitions and large text. The next roadmap stage remains C2 after blocking C1 repairs; this release does not claim to include C2.
