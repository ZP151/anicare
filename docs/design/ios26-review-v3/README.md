# Singapore community design v3

Eight incremental reference screens for the September 9 device-feedback iteration. [Open the gallery](index.html). The 87 accepted v2 screens remain unchanged.

These are static design references, not evidence of iPhone rendering or real community activity. M01–M03 use simplified URA Master Plan 2025 polygons. All counts, residences, discussions and cats are synthetic examples. The implementation uses Apple Maps and native GlassSurface; CSS blur describes the intended material and cannot prove native Liquid Glass behavior.

M01: island-wide map, region chips, count markers. M02: selected community, building context, cat/report/discussion actions. M03: list fallback. C01–C02: lightweight discussion feed/thread. R01: contextual permissions and explicit public building field. P01–P02: grouped profile and default avatars. Each PNG is 804 × 1748.

Generate with `node build-design.mjs` after building the domain package, then `node render-design.cjs` with Playwright installed. Optional `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` select an existing full Chromium runtime. Source, manifest and rendered images are versioned together.

## Attribution
- URA [Master Plan 2025 Planning Area Boundary (No Sea)](https://data.gov.sg/datasets/d_2cc750190544007400b2cfd5d7f53209/view), retrieved September 9, 2026, simplified for display; boundaries are indicative.
- [Singapore Open Data Licence](https://data.gov.sg/open-data-licence). No endorsement by URA or the Singapore government is implied.
- Lucide icons and Noto Sans SC reuse the pinned v2 assets and their adjacent ISC/MIT/OFL notices.
- Cat portraits reuse the explicitly synthetic, attributed test artwork in docs/test-samples/ios-v1.

Actual device acceptance remains in docs/ios-next-device-test.md. Layout refinements that result from actual rendering are recorded there; these references do not introduce extra approval gates.
