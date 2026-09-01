# Report Journey review — 2026-08-31

## Scope and bounded audit

The Report completion, recovery and My Reports slice was reviewed as an
Operate surface. One pre-edit phone-width web pass inspected Report hub and the
available route states; one confirmation pass inspected the Map fallback at
390×844. Native simulator/device capture was unavailable, so this is not a
native-device signoff.

| Finding | Disposition | Evidence |
| --- | --- | --- |
| Wizard did not announce its current stage as progress | Fixed | Five-step `progressbar` role/value regression test. |
| Manual selection could leave device mode active; rapid Submit could duplicate work | Fixed | Wizard tests prove manual location wins and in-flight submit is fenced. |
| Manual Google map lacked an actionable accessibility role | Fixed | Native picker test checks labelled `button` semantics. |
| Android could render blur instead of opaque fallback | Fixed | Glass policy test requires `solid` on Android. |
| Receipt omitted required stable ID/submission time; Review omitted chosen values | Fixed | Receipt and wizard regression tests. |
| Generated atlas was reachable as a map fallback | Fixed by user-directed correction | Web/native map tests prove a truthful no-map/list fallback and no production atlas reference. |
| Redaction-review and Cat Detail Chinese-copy findings | Fixed in controller closeout | Bilingual screen tests reject English control/governance copy on the Simplified Chinese surfaces. |
| Chinese draft title and out-of-Singapore map taps | Fixed in controller closeout | Report Hub localizes the saved-report title; the native picker rejects the same out-of-bounds coordinates that the server refuses. |

The native Google Maps path remains `react-native-maps` with `PROVIDER_GOOGLE`.
`GOOGLE_MAPS_IOS_API_KEY` and `GOOGLE_MAPS_ANDROID_API_KEY` are native build
keys for that SDK/tile service only. No OpenAI key, generated map image or
second map provider is part of this Report/MVP change.

## Privacy audit

The required scan was manually adjudicated. `latitude`/`longitude` matches are
test fixtures or invocation-only device/manual H3 transport; device values stay
in the active attempt ref and routes carry opaque IDs only. `accessToken`
matches are authenticated transport in `app/report/new.tsx`, never persisted
draft/receipt/history state. `candidate` matches are local parser variables or
negative assertions, not UI. `publicCellId` has no match in My Reports or
Receipt production code. No public AI, model, confidence, training or automatic
confirmation UI was added.

## Verification record

- `pnpm --filter @animalhelper/mobile test -- ReportWizard.test.tsx ReportReceipt.test.tsx ReportAreaPicker.native.test.tsx NearbyMap.web.test.tsx NearbyMap.native.test.tsx glass-policy.test.ts catalog.test.ts report-copy.test.ts --runInBand`: PASS — 8 suites, 52 tests.
- `pnpm --filter @animalhelper/mobile typecheck`: PASS.
- `pnpm --filter @animalhelper/mobile build`: PASS — 18 static routes; known Node `NO_COLOR` warning.
- `pnpm --filter @animalhelper/edge-functions test`: PASS — 6 files, 74 tests.
- `pnpm test:pilot-gate-2a-ci`: PASS — 34 tests.
- Exact `pnpm --filter @animalhelper/mobile test -- --runInBand`: not runnable
  as written because the package script already supplies `--runInBand`; Jest
  interprets the forwarded flag as a test-name pattern and reports no tests.
- Canonical `pnpm --filter @animalhelper/mobile test`: PASS — 60 suites/681
  tests. The two stale feed-route assertions now cover the approved
  save-draft-then-`/report/new` behavior, and the tab assertion matches the
  approved 88-point visual contract; no production behavior was changed.
- `pnpm pilot-gate-2a`: PASS on Windows Docker Desktop with the pinned Supabase
  CLI 2.84.2 — local credential validation, pgTAP, warning-level database lint,
  readiness and the serialized integration suite all passed. The guarded
  runner excludes the out-of-scope `logflare`/`vector` observability services
  and invokes `pnpm` through the Windows command processor without enabling the
  insecure Docker TCP endpoint.
- `pnpm verify`: PASS — pilot policies, root contracts, lint, typecheck, all
  package tests and all production builds.
- `.venv\\Scripts\\python.exe -m ruff check services/ai`: PASS.
- `.venv\\Scripts\\python.exe -m mypy services/ai/src`: PASS — 9 source files.
- Controller closeout tests for bilingual redaction/Cat Detail, localized draft
  titles and Singapore map bounds: PASS — 4 suites/35 tests; mobile typecheck
  and clean 18-route Web export also passed.
- `git diff --check`: PASS (Windows line-ending notices only).

Hosted Gate 2B, true iOS/Android Google Maps/Hermes and media/recovery checks,
and all public-AI gates remain open. Following and Profile/privacy-center work
remain open.
