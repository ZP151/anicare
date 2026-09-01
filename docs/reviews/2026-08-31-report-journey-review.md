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
| Redaction-review and Cat Detail Chinese-copy findings | Open | Redaction route and Cat Detail require a separate bounded localization follow-up; Cat Detail is outside this Task 8 file scope. |

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
- Canonical `pnpm --filter @animalhelper/mobile test`: 58 suites/671 tests
  passed; 2 suites/3 stale-or-regression failures remain under controller
  investigation in `feed-screens.test.tsx` and `tab-style.test.ts`, outside
  this task's file scope.
- `pnpm pilot-gate-2a`: unavailable on this host at `supabase-start`; the
  Supabase CLI/Docker executable is absent. Gate 2A is not waived.
- `pnpm verify`: stops at the same mobile-suite failures.
- `.venv\\Scripts\\python.exe -m ruff check services/ai` and mypy: unavailable;
  the repository virtual environment is absent.
- `git diff --check`: PASS (Windows line-ending notices only).

Hosted Gate 2B, true iOS/Android Google Maps/Hermes and media/recovery checks,
and all public-AI gates remain open. Following and Profile/privacy-center work
remain open.
