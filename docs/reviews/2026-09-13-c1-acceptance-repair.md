# C1 acceptance repair — 0.4.16 candidate

Status: implementation, full local verification and independent reviews passed; device acceptance pending. The user rejected C1 in 0.4.15. Earlier accepted functionality stays accepted.

## Inventory and replacement

The historical seed catalogue had 56 posts and 56 replies. 37 posts had no cat link; 112 attachments reused 8 source images. 32 cat identities shared 30 portraits from a small image pool. This could not demonstrate the intended same-cat, different-neighbour story journey.

V2 introduces four explicitly fictional cats (Honey / 蜜糖, Pebble / 卵石, Patch / 拼拼, Orbit / 星环), four independent credentialless fixture actors, and eight linked stories. Every cat has two authors. Sixteen independently generated photos cover frontal, side, rear, partial foliage, motion blur, day, rain, shade and night scenes. Honey's first album has six photographs. No source photograph is shared between V2 posts. Cat portraits reuse that cat's own first photograph deliberately, as an identity thumbnail.

The active catalogue is `apps/mobile/src/community/sample-catalog-v2.ts`; historical IDs remain in `test-samples.ts` only for translation and existing references. Public reads remain authoritative; no local fallback posts are inserted on fetch failure. Profile pages read both active and historical IDs and omit hidden records.

## Retirement policy

Only explicit historical fixture IDs with unchanged null author, body, cat and area are eligible. Real authors, extra replies, non-ledger attachments, foreign-key references and polymorphic content references preserve a post. Soft deletion uses the existing media-cleanup trigger; no broad bucket deletion occurs. Cats are archived only with their fixture ledger, original name, no real reporter/caregiver, and no additional references. Retired cats’ untouched synthetic sightings and care records are archived at the same time, and local practice conversations are upgraded to the V2 identities and coat details. Existing real posts—including `ping` uploads—and referenced old cat identities stay intact. Archive and cleanup receipts list every retired and preserved ID.

Replacement portraits, post details, cat story lists, display JPEGs and thumbnail JPEGs must all pass public-read checks before retirement runs. Repeated provisioning rejects collisions and never resurrects deleted content. Fixture Auth actors have no password, email, phone, identities, sessions, age confirmation or training consent.

## Visible changes

- Feed cards expose a direct cat profile chip.
- Post header combines back, author avatar/name, cat-follow action, share and overflow in a fixed safe-area row. Follow is explicitly labelled as following the cat.
- Cat detail header remains fixed with cat identity, follow and share; hero images no longer position back controls with a hardcoded notch offset.
- Scaffold back headers, Messages heading, sample conversation identity and sample profile identity remain outside scrolling content. Existing real conversation/comment fixed headers keep their keyboard handling.
- Public sharing opens the native share sheet with only an opaque `animalhelper://community/<uuid>` or `animalhelper://cat/<uuid>` link.

## Verification record

- Post/cat header and keyboard regression: 23 tests passed.
- Local retirement integration: real-author, unknown post FK, polymorphic content reference, unknown cat FK, sighting/care child FK holds, exact archival and rerun idempotence passed. Entire fixture transaction rolled back.
- V2 dry run: all 32 JPEG variants matched their provenance hashes.
- Independent data review: title persistence, credentialless actor checks and reference guards strengthened; child-record FK protections verified locally; final independent review passed with no remaining blockers.
- Independent UI review: no concrete blockers. Narrow-device/font visual acceptance remains on the device checklist.
- Full workspace `pnpm verify`: passed; mobile 146 suites / 1293 tests. Provisioner 18 tests and local retirement integration passed. Hosted provisioning receipt and IPA provenance: pending.

## Device acceptance (pending)

1. Refresh Home: identify C57–C64 and distinct photos; open a cat chip, then the other author's story for the same cat.
2. Open Honey's six-photo album and swipe through all six; compare the second author's evening photo.
3. Scroll a long post: back, author, follow-cat, share and overflow stay at the top; the reply composer stays above the keyboard.
4. Scroll cat profile, Messages, sample conversation and neighbour profile; verify fixed header and safe-area placement, including Chinese and large text.
5. Share a public post/cat through the native sheet; cancelling does not send anything. Check own previous posts remain accessible.

## Hosted import follow-up

Preflight run 34757626076 passed source-file hashes. Apply run 34757723203 attempt 1 stopped on a transient portrait-directory read. Attempt 2 passed portraits and stopped at C57 because the encoder omitted the JFIF APP0 header required by the production JPEG decoder. No historical retirement ran. The provisioner now prepares a minimal JFIF container header without changing compressed pixels, checks every real V2 display/thumb through the unchanged production decoder before remote writes (also in dry run), and verifies delivered bytes against the prepared hashes. Actor/cat ledgers and source portrait bytes remain unchanged. Provisioner tests: 20 passed; typecheck and full-catalogue dry run passed. Backend-only follow-up; no app-bundle changes.
