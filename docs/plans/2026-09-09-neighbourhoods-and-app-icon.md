# 0.2.1 — Neighbourhoods and a recognisable app icon

Product outcome: residents can find West Coast / 西海岸 beneath Clementi / 金文泰, browse nearby subzones, open a discussion scoped to that neighbourhood, and recognise Whisker Commons on the iPhone Home Screen.

## Official geography, checked 9 September 2026

| Layer | Source and interpretation |
| --- | --- |
| Planning region → planning area | [URA MP2025 planning-area dataset](https://data.gov.sg/datasets/d_2cc750190544007400b2cfd5d7f53209/view), existing 5 regions / 55 areas. |
| Planning area → subzone | [URA MP2019 subzone dataset](https://data.gov.sg/datasets/d_8594ae9ff96d0c708bc2af633048edfb/view), 332 indicative boundaries; data from September 2021, dataset updated 3 December 2025. This is **not** labelled MP2025. |
| Resident community / CC / RN | [PA community clubs](https://www.pa.gov.sg/our-network/community-clubs/cc-information/), [West Coast Ville RN](https://www.onepa.gov.sg/rc/west-coast-ville-rn). Familiar names are useful search aliases, not jurisdiction polygons. |
| CDC district | [CDC official five-district list](https://www.cdc.gov.sg/about-us/five-districts/), updated 3 August 2026. These are different from URA's five planning regions. |
| Electoral division | [ELD electoral boundaries](https://www.eld.gov.sg/elections_map_electoral.html). No constituency is inferred from a neighbourhood name. |

The official subzone file places West Coast (CLSZ05) under Clementi (CL). Clementi has nine subzones: Clementi Central, Clementi North, Clementi West, Clementi Woods, Faber, Pandan, Sunset Way, Toh Tuck, West Coast. West Coast CC's Clementi West Street 2 location falls in the Clementi West planning subzone; the broader resident meaning of “West Coast” can differ from CLSZ05. Chinese labels are application translations; English names and URA codes are the source identifiers.

## Implementation

- Initial map stays at 55 planning areas. Selecting a parent reveals its neighbourhoods; search reaches both levels in English and supports Chinese Clementi / West Coast names. West Coast CC is a search alias for Clementi West, not a renamed boundary.
- Discussions retain existing planning-area slugs. Subzones use stable `sg-<lowercase URA code>` slugs, e.g. `sg-clsz05`. The composer drills into a planning area, lets residents select the whole parent or a neighbourhood, and preserves existing authentication / retry controls.
- Cat activity and footprint use only already-public, delayed coarse cells. Public building names remain reporter-entered context under the previously selected product policy. No device coordinate, private row, live observation, or new backend disclosure is introduced. Where MP2019 subzones and the MP2025 parent disagree, retain the parent only.
- Marker points are guaranteed inside simplified subzone geometry. Scanline selection respects holes and chooses the largest polygon; it is a representative map point, not a cat's position.
- `scripts/build-singapore-neighbourhoods.py` reproduces the 233 KB attributed layer from the official GeoJSON. Raw data is kept outside version control. Generated source records the download SHA256.
- App icon was absent from Expo configuration. Add the opaque square `apps/mobile/assets/app-icon-v1.png` to root and iOS icon configuration. Expo's native icon pipeline creates platform sizes. Preserve `sg.animalhelper.app`; version `0.2.1`, iOS build `5`.
- Keep detailed boundary explanations on a dedicated page. Normal map rows contain names, counts and navigation; unavailable activity shows an unknown count rather than invented zero activity.

## Necessary regression and device acceptance

Domain tests cover 332 unique codes, known Clementi hierarchy, valid parents, invalid / foreign cells, and every marker inside its own polygon. Mobile route tests cover Chinese search, parent → subzone → discussion → parent, direct subzone links, composer submission scope, named cat footprints, and existing session-switch / duplicate-submit protection.

Native acceptance: update with the same Sideloadly Apple ID, keep existing app data; check the Home Screen icon, search 西海岸 / West Coast, open Clementi's nine neighbourhoods, return from a neighbourhood to its parent, post a test discussion in the chosen scope, and verify the existing report/permission journey. Apple Maps, iOS material rendering and icon appearance require device acceptance.

No migration, sample re-provisioning or backend deployment is needed for this increment. Reuse the unchanged deployed backend and its current readiness evidence, then verify the new IPA's icon declaration, assets, version and provenance.

## Design references

[Incremental reference gallery](../design/ios26-neighbourhood-v4/index.html), [icon source and prompt](../design/ios26-neighbourhood-v4/app-icon.md). The gallery contains real web fallback screenshots, not an Apple Maps or Liquid Glass simulation.

## Verification before native build

`pnpm verify` passed on 9 September 2026, including 956 mobile tests, 23 domain tests, workspace type checks and production exports. Three updated web fallback screenshots were rendered at 804 × 1748 and inspected with no page errors. Local Python required the declared Pillow development dependency; an unrelated hosted-test timeout passed when run without parallel resource contention. Final full verification passed. The interior-point regression first reproduced 12 out-of-bound markers, then passed for all 332 after correction. Native artifact verification follows the macOS build.
