# WhiskerCommons Pilot Gate 1 Design

**Status:** Approved direction; design review required before implementation

**Goal:** Turn the current Sprint 2–3 implementation into a reproducible, least-privilege release candidate foundation that can enter real Supabase and native-device validation without weakening any existing privacy boundary.

**Non-goal:** This gate does not label the app pilot-ready, deploy a hosted Supabase project, create EAS credentials, publish a build, enable public media promotion, enable automatic detection, or claim real AI identity accuracy.

## Evidence baseline

The reviewed-media branch currently passes the repository's unit, type, lint and web-build gates, but the release audit found five repository-level gaps that must be resolved before external runtime evidence is meaningful:

1. `expo install --check` fails because thirteen direct mobile packages do not match Expo SDK 57's supported versions.
2. The generated Android configuration contains `RECORD_AUDIO`; the current contribution flow only calls `launchImageLibraryAsync` and does not use camera or microphone capture.
3. The native SQLite singleton permanently caches a rejected initialization promise, and an existing SecureStore database key is interpolated into `PRAGMA key` without format validation.
4. CI validates UUID literals in only one of nine pgTAP files and does not type-check the six Edge handler entrypoints in Deno.
5. There is no committed EAS internal-distribution profile or executable native-configuration attestation.

Real Docker/Supabase, signed Storage, two-session concurrency, iOS/Android device behavior, signing, hosted staging and operational/legal drills remain explicit downstream gates.

## Safety invariants

- Existing reviewed-media encryption, owner binding, receipt binding, revision/lease CAS, bounded plaintext lifetime and quarantine-before-delete behavior must not change.
- No source URI, plaintext image, access token, signed capability, Storage path, precise coordinate or secret may be added to logs, Git, EAS configuration, test snapshots or build artifacts.
- An invalid existing database key fails closed. The app must never delete or silently replace it because doing so could make a valid encrypted database unrecoverable.
- A transient initialization failure may be retried in the same process, but concurrent callers still share one initialization attempt.
- The gallery-only pilot build requests neither camera nor microphone access. Location access remains when-in-use only.
- CI checks are evidence about source and local emulation; they do not substitute for hosted Storage or physical-device evidence.
- Internal EAS builds are test artifacts, not public releases. Build URLs must require authorized Expo access when the project is configured.

## Architecture

### 1. Expo compatibility boundary

Align only the direct packages reported by the SDK 57 compatibility resolver. The implementation will use Expo's resolver rather than hand-selecting unrelated upgrades, then commit the resulting workspace lockfile.

The expected compatibility target observed during design is:

- `expo ~57.0.17`
- `expo-auth-session ~57.0.10`
- `expo-file-system ~57.0.6`
- `expo-image-manipulator ~57.0.14`
- `expo-image-picker ~57.0.14`
- `expo-linking ~57.0.8`
- `expo-location ~57.0.14`
- `expo-router ~57.0.17`
- `expo-secure-store ~57.0.2`
- `expo-sqlite ~57.0.2`
- `react-native 0.86.3`
- `react-native-gesture-handler ~2.32.0`
- `jest-expo ~57.0.5`

Acceptance is determined by a fresh `expo install --check`, frozen install, peer check, native TypeScript/Jest and Expo web export, not by the version list alone.

### 2. Least-privilege native configuration

Set both `cameraPermission` and `microphonePermission` to `false` in the `expo-image-picker` plugin configuration. Preserve the existing photo-library explanation and the existing location permission. Do not add camera UI as part of this gate.

Add a small pure native-config policy module with a CLI adapter. The adapter normalizes evidence from both `expo config --type public --json` and `expo config --type introspect --json`; its output is success or a bounded list of policy codes. Public config proves stable app metadata, while introspection proves the composed Android manifest and iOS Info.plist mods. It must reject:

- an unexpected iOS bundle identifier or Android package;
- `RECORD_AUDIO` or `CAMERA` in generated Android permissions;
- camera or microphone usage descriptions in the generated iOS configuration;
- loss of the SQLCipher-enabled SQLite plugin;
- loss of the expected custom URL scheme or when-in-use location configuration.

The pure policy receives fixtures in Jest. The CLI runs both real Expo config commands and passes only the bounded normalized evidence to the policy. It never prints the full introspection payload or environment values. CI therefore verifies the composed plugin result, not only `app.json` text.

### 3. Retryable encrypted database initialization

Keep a single in-flight database-open promise. If that exact promise rejects, clear only the cached promise reference in a rejection handler and rethrow the original bounded error. A later caller may then create a new attempt; callers attached to the failed attempt all observe the same failure.

Validate an existing SecureStore database key as exactly 64 hexadecimal characters before constructing `PRAGMA key`. A malformed value returns `secure_offline_storage_key_invalid`; it is neither logged nor overwritten. Newly generated keys continue to be 32 random bytes encoded as lowercase hexadecimal and stored with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.

Dependency seams will make both invariants testable without pretending Jest is native SQLite evidence:

- unavailable SecureStore, then available, retries successfully;
- failed SQLite open, then successful open, retries successfully;
- two concurrent callers share one open attempt;
- malformed stored keys never open SQLite and never call `setItemAsync`;
- valid stored and newly generated keys reach the quoted SQLCipher pragma.

Atomic schema migration, SQLCipher integrity checks, wrong-key behavior, backup/reinstall behavior and process-kill recovery stay in the physical-device gate.

### 4. Backend source and database CI gate

Strengthen the existing CI workflow rather than creating a parallel pipeline:

- loop over every `supabase/tests/*.sql` file with the UUID-literal validator;
- keep Supabase CLI pinned to `2.84.2` for `supabase start`, `supabase test db` and warning-level database lint;
- install Deno `2.9.5` with the official setup action;
- commit a Deno lockfile generated by that pinned runtime and require frozen dependency resolution in CI;
- run `deno check --config supabase/functions/deno.json --frozen` over all six `*/index.ts` handler entrypoints;
- retain the existing Vitest tests for shared Edge policy modules.

Handler checking must include the real `Deno.env`, `Deno.serve` and npm import boundary. It is still not an HTTP, Auth or Storage integration test.

The later Pilot Gate 2 will add a local-stack integration harness for two Auth users, reserve/signed-PUT/finalize/delete, expiry/replay, owner isolation and concurrency races. That harness is deliberately not hidden inside this source-hardening gate.

### 5. Internal native build contract

Add `apps/mobile/eas.json` beside the Expo app package with a `pilot` profile:

- `distribution: "internal"`;
- Android produces an installable APK;
- iOS uses internal/ad hoc distribution;
- the CLI requires a clean committed source state;
- no public environment values, project identifiers, credentials or secrets are hard-coded;
- no EAS Update channel or public submission is enabled.

Add package scripts that validate configuration and print or invoke the exact pilot build commands from `apps/mobile`. Build execution remains manual until the user signs in to Expo, creates/links the EAS project, registers iOS devices and approves credential creation. The repository must remain buildable and testable without those credentials.

Before sharing any internal build, the Expo project setting for unauthenticated access to internal builds must be disabled.

## Failure handling

- Dependency alignment failure leaves the old lockfile untouched until a complete install succeeds and all gates run.
- Native-config policy failure blocks CI with bounded policy codes; it never prints environment variables.
- Database initialization preserves the original bounded failure and permits a later retry. Unknown raw native error text is not persisted to drafts or telemetry.
- Deno or pgTAP failure blocks the branch. A missing tool is an infrastructure failure, not a skipped success.
- EAS authentication, signing or device-registration failure does not change production state and cannot be reported as a successful build.

## TDD and verification strategy

Every behavior change follows red-green-refactor:

1. Native-config fixtures first fail on the current audio/camera permissions, and the real-config adapter proves the current composed output fails for the same bounded codes.
2. Database tests first reproduce the poisoned singleton and malformed-key paths.
3. CI script tests first prove all nine SQL files and all six handlers are enumerated; the workflow then consumes those deterministic scripts.
4. Configuration changes make the focused tests green.

Fresh final verification for this gate must include:

```powershell
pnpm install --frozen-lockfile
pnpm peers check
pnpm --filter @animalhelper/mobile exec expo install --check
pnpm --filter @animalhelper/mobile run validate:native-config
pnpm --filter @animalhelper/mobile test
pnpm --filter @animalhelper/mobile typecheck
pnpm --filter @animalhelper/mobile build
pnpm --filter @animalhelper/edge-functions test
pnpm --filter @animalhelper/edge-functions typecheck
python -m ruff check services/ai
python -m mypy services/ai/src
pnpm exec turbo run lint typecheck test build --force
git diff --check
git status --short --untracked-files=all
```

On GitHub Actions, the mandatory database job must additionally prove all migrations and all pgTAP tests against a fresh Supabase stack, warning-level database lint, every SQL UUID guard and Deno checking of every handler.

## Acceptance criteria

- Expo compatibility check exits zero with no recommended-version mismatch.
- Normalized public-plus-introspected Expo evidence contains no camera or microphone permission while retaining photo library, location, scheme, bundle/package and SQLCipher requirements.
- Transient SecureStore/SQLite initialization failures are retryable without losing single-flight behavior.
- Invalid stored database keys fail closed without regeneration, overwrite or database open.
- CI deterministically enumerates nine pgTAP files and six Edge handlers; future additions cannot silently escape the gate.
- Deno dependency resolution is locked and the handler check refuses an out-of-date lockfile.
- A committed internal `pilot` EAS profile exists without secrets and requires committed source.
- All existing privacy, upload, admin and AI contract suites remain green.
- Documentation continues to state that real Storage, two-session concurrency, native-device execution, signing, hosted staging, operational/legal drills and real AI accuracy are unresolved release gates.

## Rollout and rollback

Land the gate as reviewable commits in this order: compatibility/permissions, database initialization, CI, then EAS/documentation. Each commit must independently pass its focused tests. If a compatibility upgrade breaks behavior, revert only that compatibility commit; do not weaken the config or privacy assertions. No database format or server schema changes are introduced by this gate.

Promotion to Pilot Gate 2 requires the CI database job to pass on the pushed branch and a reviewed plan for the two-user real Storage integration harness. Promotion to physical-device testing additionally requires EAS authentication, controlled credentials, registered devices and an approved test-data protocol.
