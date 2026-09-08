# Singapore community iteration — v3

## Product outcome
Make the map useful for finding and following Singapore community cats, restore reporting, and give neighbours a small discussion space. Device feedback: some v0.1.2 features work; Start report shows an unusable saved-report message. Report completion is not accepted yet.

## Accepted direction
Continue native typography, SF Symbols, grouped content and Liquid Glass controls from DESIGN.md. Preserve all 87 v2 screenshots; changed screens belong to ios26-review-v3. The user chose public HDB block / condo project names with delayed cat activity. Names are reporter-supplied context, not verified residences or live GPS pins. Normal activity remains delayed two hours, sensitive activity 24 hours; critical reports stay hidden.

## Implementation
1. R1: reproduce and fix the new-draft read failure with a behavioral regression. Preserve existing drafts. Prompt for location/camera/gallery in context, with denial recovery.
2. M3: bundle the 55 URA Master Plan 2025 planning areas and five regions. Match public coarse cells to planning areas. Add count markers, region/search filters, list and community detail. Do not invent an official South region. Display building context only after existing visibility checks.
3. S2: expand six synthetic cats with English names across five regions, HDB / condo / park scenarios and photo / no-photo cases. Provision additively and idempotently; preserve original IDs and real data. Exclude samples from adoption metrics.
4. P2: persist six default avatars through owner profile updates; simplify grouped settings and permission recovery.
5. C1: text discussion list and thread, optionally associated with a cat or planning area. Guests read; authenticated adult contributors post/reply/delete their own content. Integrate blocks, reporting, moderation and erased authors. No ranking or messaging infrastructure.
6. Delivery: integrate, run changed behavioral/SQL tests, typecheck and existing CI. Deploy additive migrations, provision samples, build one iOS candidate and record a short device checklist. Automation success is separate from device acceptance.

## Necessary regression
- New report survives save/read, navigation and restart; permission denial and missing media recover; account switching preserves draft isolation.
- Region matching, polygon holes, unsupported cells, unique cats and filters; map/list reach the same cats. Building context inherits delay/block/hide checks.
- Discussion pagination, retry, own-delete, guest read, blocks, critical hold, erasure and moderator actions.
- Avatars persist with an owner-scoped update and legacy default.

## Sources
- [URA regional plans](https://www.ura.gov.sg/land-planning/master-plan/master-plan-2025/regional-plans/)
- [Master Plan 2025 planning areas](https://data.gov.sg/datasets/d_2cc750190544007400b2cfd5d7f53209/view)
- [Singapore Open Data Licence](https://data.gov.sg/open-data-licence)

CDC districts are a separate constituency administration system. OneMap search requires credentials; use the existing Apple basemap and bundled official geography in this batch.

## Goals and acceptance
G1: cat-linked reporting/discussion. G2: five-region discovery. G3: usable reporting and neighbourhood care. G4: follow/discussion return loop. G5: profile ownership, blocks and erasure. G6: one necessary regression/build cycle per candidate. G7 AI unchanged. Pending device acceptance: report completion, native map/glass, permissions, avatar persistence and two-account discussion.

## Integration result — 2026-09-09
Implemented the six slices above for candidate 0.2.0 (4). Report recovery now retains the authenticated draft owner for no-photo drafts. New tests reproduce that failure. The map bundles attributed URA polygons for 55 planning areas, five region filters, building context and links to cat community activity. Six default avatars and text post/reply flows are connected to the backend. Samples expand to 16 cats (12 photo-backed entries using four synthetic images), including English names; deployment remains pending at this checkpoint.

Local validation: mobile 948/948 followed by two added discussion retry/thread-switch tests; domain 19/19; admin 66/66; sample provisioner 5/5; sighting payload 12/12. PostgreSQL community 34 assertions and location projection 7 assertions cover ownership, delay, block, moderation and erasure. Changed SQL and required CI remain part of delivery. Eight new [v3 design references](../design/ios26-review-v3/index.html) are archived; these are design images, not evidence of iPhone rendering.

## Deployed checkpoint
Source `f107154`: [full CI including fresh database regression](https://github.com/ZP151/anicare/actions/runs/34257057715) passed; mobile now 90 suites / 950 tests. [Hosted deployment, owner isolation and media checks](https://github.com/ZP151/anicare/actions/runs/34257057659) passed. First-install migration failure was reproduced on an isolated schema and fixed. Deployment preflight and remote-state validation now share one migration inventory, removing the duplicate list that had drifted. No extra release gate was added. The temporary database was removed. Sample provisioning and iOS build follow this checkpoint; device acceptance remains pending.

Sample verification then exposed two integration defects: JSON context was double-encoded by the PostgreSQL driver, and discovery/care still accepted only the old three areas. The importer now uses a JSON object binding with a narrow repair of known synthetic values. Migration 011 and the mobile APIs accept all 13 offered Singapore fallback areas. New failing-then-passing API tests and 18 PostgreSQL assertions cover northern discovery, care, normal delay and hidden cats. The earlier iOS build was cancelled before delivery; a new candidate must include this correction. The sample inventory is documented in [the dataset README](../test-samples/ios-v1/README.md).

Final functional source `b3dada3`: [complete CI](https://github.com/ZP151/anicare/actions/runs/34259012380) and [hosted migration 011 checks](https://github.com/ZP151/anicare/actions/runs/34259012406) passed. Mobile regression includes the two additional area-acceptance tests (952 total). The replacement iPhone build uses this corrected source through a documentation/readiness descendant.

Delivered: [sample run 34259350195](https://github.com/ZP151/anicare/actions/runs/34259350195) verifies all 16 fixtures and 12 photo-backed entries. [iOS run 34259667104](https://github.com/ZP151/anicare/actions/runs/34259667104) produced 0.2.0 (4) from `2216b1ec1f81b779bfa8635bc96c1c9ef2d13fe7`. Downloaded IPA provenance, exact manifest, SHA-256/size, source locks, bundle version/identifier and permission purpose strings were verified on Windows. The next action is the user's [device checklist](../ios-next-device-test.md), not another audit cycle. Native UI, hardware permissions and real-account interaction are not claimed as device-passed.
