# WhiskerCommons iOS Device Lab Design

**Status:** Approved direction from the user on 2026-09-03; this document fixes the implementation boundary.

**Goal:** Produce a repeatable, unsigned iPhoneOS `.ipa` from an immutable source revision on a standard GitHub-hosted macOS runner, then let the owner re-sign and install it locally from Windows with a free Apple Account for a bounded physical-iPhone test. Repeatable means that the source revision, dependency locks, runner image identity and primary tool versions are recorded; it does not promise byte-for-byte identical artifacts across runner-image rebuilds.

**Non-goals:** This is not an Expo-supported free iPhone distribution path, App Store or TestFlight distribution, EAS ad hoc signing, production signing evidence, pilot readiness, or a substitute for a paid Apple Developer Program membership. It does not put an Apple ID, Apple password, app-specific password, signing certificate, provisioning profile, device UDID, Supabase service-role key, or database password in GitHub.

## Decision

Use Expo Continuous Native Generation on a GitHub-hosted `macos-26` arm64 runner with Xcode `26.4.1` (`17E202`) selected from `/Applications/Xcode_26.4.1.app`, Node `22.23.1`, Ruby `3.3.12` and CocoaPods `1.17.0` to generate the iOS project, compile a Release `iphoneos` application with code signing disabled, recursively remove and reject residual signatures, and package it as the sole `Payload/WhiskerCommons.app` entry inside an `.ipa`. The artifact is explicitly labelled unsigned and can only become installable after AltStore Classic `2.2` plus the Windows AltServer version recorded in the evidence locally re-signs it with the owner's Apple Account. SideStore `0.6.3` is a best-effort fallback, not an equivalent validated path.

This is an experimental bridge to device testing. The supported alternatives remain:

1. EAS internal distribution with a paid Apple Developer team and registered device; or
2. Xcode Personal Team signing on a Mac.

Those alternatives are not available under the current no-Mac/no-paid-membership constraint. Apple documents that a free Personal Team can test on device but its App IDs, registered devices and provisioning profiles expire after seven days. GitHub documents that standard hosted macOS runners are free for public repositories. Expo documents Prebuild as the supported way to generate the native iOS project, but does not support the AltStore/SideStore bridge as an EAS distribution method.

## Safety invariants

- Apple credentials and the iPhone UDID exist only on the owner's Windows machine and iPhone-side tooling.
- GitHub Actions receives only build-time values that are intended to ship in the app: a bundle-restricted Google Maps iOS key and the hosted Supabase public URL/publishable key. No privileged Supabase or Apple secret is permitted. These values are step-scoped only to input validation, Expo generation and Xcode bundling; checkout, setup, attestation and upload actions never inherit them.
- Manual device artifacts fail closed when the three required runtime values are absent. Pull-request compile probes use fixed non-secret placeholders and are labelled non-installable.
- The Google Maps key must enable only Maps SDK for iOS. Before local signing it is restricted to `sg.animalhelper.app`. The post-install Windows inspection must record the re-signed app's effective `CFBundleIdentifier`; if it differs, that exact identifier is added to the same key's iOS application restrictions before the map test. The key is never made unrestricted and the workflow never prints it.
- The Supabase URL must equal `https://fhugdtpjbgiatqhvjioy.supabase.co`, the approved Singapore non-production project. Only its public publishable/anonymous key may be embedded.
- Pull-request and lock-bootstrap jobs have only `contents: read`. Only the manually dispatched candidate job adds narrowly scoped `id-token: write` and `attestations: write`; there is no deployment, release creation, package publication or repository-content write token. Because the candidate job executes repository code while holding OIDC permission, it is restricted to reviewed `main`, the protected environment and exact source-ref checks before any build step.
- Manual candidates run only when `github.event_name == 'workflow_dispatch'` and `github.ref == 'refs/heads/main'`, under a GitHub environment named `ios-device-lab` whose deployment branch policy permits only `main`. Environment secrets are unavailable until its protection rules pass. PR probes never attach that environment.
- The artifact retention window is seven days or less. Artifact names and summaries contain the immutable commit SHA and `unsigned` marker.
- The generated `apps/mobile/ios/`, Device Lab staging and DerivedData paths are explicitly ignored, rejected if tracked, cleaned unconditionally and excluded from uploaded artifacts.
- Successful compilation proves only artifact construction. Physical-device completion requires the owner to record installation, launch, permission, SQLCipher, map, camera/photo, redaction, report recovery and network results on the target iPhone.

## Repository integration

The device-lab branch starts from merged `main` after the Report journey and iOS-only Google Maps configuration. The implementation adds the already-created Expo project link, which is not present at the base commit:

- Expo owner `zhoupingdevs-team`;
- Expo slug `anicare`;
- EAS project ID `f9b84744-77c7-4b2b-8631-f107a8b98af8`.

The app identity remains:

- display name `WhiskerCommons`;
- iOS bundle identifier `sg.animalhelper.app`;
- URL scheme `animalhelper`.

The slug changes from `animalhelper` to the actual EAS project slug `anicare`; `owner` and `extra.eas.projectId` are added while camera/photo permissions, bundle identifier, scheme and every existing plugin remain unchanged. The existing `pilot` EAS profile remains unchanged and continues to describe the supported paid-team path. The unsigned Device Lab uses its own workflow and must not weaken `validate:pilot-build`.

The remote EAS association is verified once from the owner's already-authenticated local CLI with `pnpm dlx eas-cli@22.6.0 project:info`. That command is internally non-interactive in the pinned CLI version and declares no `--non-interactive` flag. The bounded evidence records only account, slug, project ID, command version and verification time. No `EXPO_TOKEN` is created for or exposed to GitHub Actions, and the Device Lab workflow does not call the EAS service.

## Build contract

A small Node policy module receives an event kind, ref and environment-shaped object, returning only bounded error codes plus a normalized mode:

- `pull_request` permits fixed, repository-owned compile placeholders and yields `compile_probe`;
- `workflow_dispatch` requires `refs/heads/main`, a non-placeholder Google Maps iOS key, exact hosted origin `https://fhugdtpjbgiatqhvjioy.supabase.co` and a public key in one of two explicit formats: `sb_publishable_...`, or a legacy JWT whose decoded payload has `role: "anon"`. `sb_secret_...`, malformed JWTs and JWTs with `service_role` are rejected. Valid input yields `device_candidate`;
- every other event fails closed;
- empty, whitespace, userinfo, query/fragment, HTTP, loopback, wrong-host, privileged-key or known-placeholder inputs fail;
- no rejected value is returned or logged.

The manual workflow performs a bounded `GET /auth/v1/settings` using the public key and accepts only a successful response from the exact origin, proving that the key belongs to the hosted project without printing its body. Runtime mapping is exact: `GOOGLE_MAPS_IOS_API_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Tests must prove those branches before the workflow consumes the policy. The workflow writes normalized non-secret mode output to `$GITHUB_OUTPUT`; secret-bearing inputs remain only in process environment.

## Workflow

The workflow has two entry points and three modes:

- `pull_request` without path filtering, for a compile-only proof with fixed placeholders and no environment secrets;
- an explicitly labelled lock-bootstrap job available only while the reviewed native `Podfile.lock` is absent; and
- `workflow_dispatch`, guarded to `refs/heads/main`, for a device candidate using the protected `ios-device-lab` GitHub environment.

It performs:

1. full-commit-SHA-pinned third-party actions, including checkout, Node/pnpm/Ruby setup, artifact upload and provenance attestation; pnpm `11.19.0`, Node `22.23.1`, frozen install, explicit Xcode `26.4.1` (`17E202`), Ruby `3.3.12` and CocoaPods `1.17.0` verification;
2. repository native/pilot policy checks and the Device Lab contract tests;
3. event-aware runtime input validation without echoing values;
4. `expo prebuild --clean --platform ios --no-install` under `apps/mobile`;
5. copy the reviewed lock from `apps/mobile/ios-device-lab/Podfile.lock` into the generated project and run CocoaPods `1.17.0` in deployment mode. If the reviewed lock is absent, only the lock-bootstrap job may resolve dependencies: its sole uploaded artifact is `Podfile.lock`, it never attests or emits a `device_candidate`, and the run stops before Xcode compilation. The normal three-file device-candidate allowlist applies only after that lock has been reviewed and committed;
6. discover exactly one generated `.xcworkspace` and one application scheme, then run `xcodebuild` with `-destination generic/platform=iOS`, Release/device SDK, signing disabled and isolated DerivedData;
7. recursively remove any `_CodeSignature` and embedded provisioning profiles, remove signatures from every Mach-O where present, then verify every executable/framework/appex Mach-O contains arm64, targets iOS, and has no valid code signature;
8. package with macOS `ditto`, extract into a fresh directory and repeat structural/signature/architecture checks; require exactly one top-level `Payload` directory and one `.app`;
9. create an allowlisted JSON manifest containing repository, immutable commit SHA, run ID/attempt, workflow path/ref, `ImageOS` and `ImageVersion`, Xcode/Ruby/CocoaPods/Node/pnpm versions, pre-sign bundle ID, IPA byte size/SHA-256, `pnpm-lock.yaml` hash and reviewed `Podfile.lock` hash;
10. create a GitHub build-provenance attestation for the IPA, then upload only the IPA, manifest and checksum for at most seven days;
11. unconditionally delete generated native/build directories from the runner.

The PR probe is allowed to establish macOS/Xcode compatibility but its output is not attested and is not a device candidate. The bootstrap job uploads only the dependency lock. A manually dispatched run with real public runtime configuration is the only job with attestation permissions and the only artifact eligible for local re-signing.

## Local re-sign and physical test

The owner downloads the `device_candidate` artifact on Windows, verifies the artifact attestation and SHA-256, and uses AltStore Classic `2.2`/AltServer locally. The Apple Account is entered only into that local tool. The unsigned artifact hash remains the chain-of-custody anchor; AltStore does not promise to return the re-signed IPA, so a signed-IPA hash is not required.

After installation, a throwaway Windows virtual environment installs exactly `pymobiledevice3==11.3.1`. With the paired, unlocked iPhone connected over USB, `pymobiledevice3 usbmux list` records a redacted device-presence result and `pymobiledevice3 apps list` records the installed app entry and its effective `CFBundleIdentifier`. AltStore's App IDs/permissions view and a sanitized AltServer Error Log export provide the available entitlement/provisioning evidence; neither raw device identifiers nor Apple-account details enter the repository. If the effective bundle identifier differs from `sg.animalhelper.app`, that exact identifier is added to the same Google Maps key's iOS application restrictions before the map test. This restriction update does not require rebuilding because the embedded key is unchanged. Free provisioning is expected to expire after seven days and may be subject to Apple's App ID, device and active-app limits. SideStore `0.6.3` is used only if AltStore fails, with separate evidence.

Before a manual candidate is issued, a separate Gate 2B workflow must produce `docs/evidence/pilot-gate-2b-readiness.json`. Device Lab consumes but never creates or weakens this evidence and never receives Gate 2B privileged secrets. The evidence has a versioned, allowlisted schema containing: `schemaVersion`, exact hosted project ref/origin, source commit, migration-head filename and SHA-256, Edge Functions tree SHA-256, Gate 2B workflow run ID/attempt, creation/expiry timestamps, Auth redirect check, private `media-staging` check, public-key/origin check, synthetic-owner happy-path result and cross-owner isolation result. Check values are fixed enums (`passed` or `failed`); the file contains no user ID, token, object path, media locator, database password or service-role key.

The Device Lab validator requires schema version `1`, exact project ref/origin, every required check equal to `passed`, an unexpired evidence window of at most 72 hours, the source commit to be an ancestor of the candidate commit, and current migration-head/function-tree hashes to equal the evidence. A docs-only evidence commit may therefore follow the deployed source commit without invalidating the proof, while any database or function change forces Gate 2B readiness to rerun. Full real token-expiry closure may continue as a separate long-running Gate 2B job, but no hosted-readiness claim is inferred from the IPA build and no full Gate 2B completion claim is made from readiness alone.

The physical test protocol records, without personal or precise-location data:

1. exact device model, iOS version/build, Developer Mode/trust state, free storage, artifact SHA, effective bundle ID and installation tool/version;
2. install and first launch;
3. liquid-glass capability/fallback and Dynamic Type smoke checks;
4. Google Maps render plus coarse-area/privacy behavior;
5. camera and photo-library permission denial/allow flows;
6. on-device reviewed-copy creation, bystander masking and source cleanup;
7. SQLCipher-backed draft persistence across process kill/restart;
8. Report resume, submission, receipt and My Reports against the dedicated hosted test project;
9. sign-out/account-switch isolation and recovery behavior;
10. crash, Windows Apple Devices/iTunes/AltServer logs and network-error observations with secrets and precise locations removed.

No real person, exact colony location or unreviewed photo is used. Synthetic test data is mandatory.

## Acceptance criteria

- The merged main baseline and all existing CI gates remain green.
- The Expo link is committed without credentials and resolves to the known project/account.
- Device Lab policy tests demonstrate fail-closed manual input handling.
- A fresh GitHub macOS runner generates an unsigned arm64 iPhoneOS `.ipa` whose pre-sign bundle ID is `sg.animalhelper.app`, with no provisioning profile, valid signature or `_CodeSignature` anywhere in the extracted payload.
- The workflow uploads only the `.ipa`, allowlisted manifest and checksum, and emits GitHub provenance attestation; logs/artifacts contain no privileged secret.
- A manual device-candidate run cannot use compile placeholders.
- Documentation keeps the unsupported/free-side-load boundary explicit.
- Final completion is not claimed until the owner installs the re-signed artifact on an iPhone and returns the physical-test evidence checklist.

## Rollback

The Device Lab is additive. If macOS generation or unsigned packaging proves incompatible, revert the workflow, policy and runbook without changing the existing EAS profile, application runtime, database or privacy contracts. A failed experimental path does not justify weakening signing, credential or native-config gates.
