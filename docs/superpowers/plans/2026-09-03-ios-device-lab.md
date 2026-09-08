# WhiskerCommons iOS Device Lab Implementation Plan

> **Execution rule:** Use `superpowers:executing-plans`, `superpowers:test-driven-development`, and `superpowers:subagent-driven-development`. One implementation agent owns writes in this worktree at a time. Every task receives task-level specification review and code-quality review before the next task starts.

**Goal:** Build and attest a fail-closed unsigned iPhoneOS candidate on GitHub's free public macOS runner, consume separately produced hosted-readiness evidence, and hand the owner a bounded Windows/AltStore physical-iPhone protocol without weakening supported EAS or privacy gates.

**Architecture:** Pure TypeScript policy modules validate build inputs, evidence, and artifact metadata before any workflow shell consumes them. A full-SHA-pinned `macos-26` workflow separates dependency-lock bootstrap, secret-free PR compile proof, and protected manual candidate construction. Hosted Gate 2B remains a separate protected workflow and evidence producer; Device Lab is a read-only consumer of its versioned readiness JSON. Local re-signing and Apple credentials stay outside GitHub.

**Toolchain:** Expo SDK 57 / React Native 0.86.3, TypeScript/Jest, Node 22.23.1, pnpm 11.19.0, GitHub Actions `macos-26` arm64, Xcode 26.4.1 (17E202), Ruby 3.3.12, CocoaPods 1.17.0, shell utilities supplied by macOS/Xcode, AltStore Classic 2.2, and `pymobiledevice3==11.3.1` on Windows.

**Approved design:** `docs/superpowers/specs/2026-09-03-ios-device-lab-design.md`

---

## Task 1: Commit the known Expo/EAS project identity without adding remote credentials

**Files**

- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/scripts/native-config-command.test.ts`
- Modify: `apps/mobile/scripts/validate-pilot-build.ts`
- Create: `docs/evidence/eas-project-link.json`

**Contract**

- Keep display name `WhiskerCommons`, bundle identifier `sg.animalhelper.app`, scheme `animalhelper`, permissions, and plugins unchanged.
- Change only Expo slug to `anicare`; add owner `zhoupingdevs-team` and `extra.eas.projectId = f9b84744-77c7-4b2b-8631-f107a8b98af8`.
- Extend native/pilot policy tests so owner, slug, and project ID must match exact allowlisted values and `eas.json` still contains no credentials, env values, or secret references.
- Run `pnpm dlx eas-cli@22.6.0 project:info` only from the already-authenticated owner machine. Record an allowlisted evidence JSON containing schema version, owner, slug, project ID, CLI version, checked-at timestamp, and `status: "verified"`; do not store CLI output or a token.

**TDD sequence**

1. Add failing exact-identity assertions to the existing native/pilot policy tests.
2. Run the focused tests and record the expected failure against the old slug/missing owner/project ID.
3. Apply the minimal `app.json` metadata change.
4. Run focused tests, `pnpm validate:pilot-policies`, mobile typecheck, and `git diff --check`.
5. Run the pinned owner-local EAS command, compare its bounded fields manually, then create the evidence JSON with `apply_patch`.

**Acceptance**

- No Apple or Expo credential is added to Git, GitHub, app config, or evidence.
- Existing `pilot` profile is unchanged.
- Static and owner-local identities agree exactly.

## Task 2: Add fail-closed Device Lab input and hosted-readiness policies

**Files**

- Create: `apps/mobile/scripts/ios-device-lab-policy.ts`
- Create: `apps/mobile/scripts/ios-device-lab-policy.test.ts`
- Create: `apps/mobile/scripts/validate-ios-device-lab.ts`
- Modify: `apps/mobile/package.json`
- Modify: `package.json`
- Create: `docs/evidence/pilot-gate-2b-readiness.schema.json`

**Public interfaces**

```ts
export type DeviceLabMode = 'compile_probe' | 'device_candidate';

export function evaluateDeviceLabInputs(input: Readonly<{
  eventName: string;
  ref: string;
  googleMapsIosApiKey?: string;
  supabaseUrl?: string;
  supabasePublicKey?: string;
}>): Readonly<{ ok: true; mode: DeviceLabMode }> | Readonly<{
  ok: false;
  codes: readonly DeviceLabInputCode[];
}>;

export function evaluateGate2BReadiness(input: Readonly<{
  evidence: unknown;
  nowIso: string;
  candidateCommit: string;
  isAncestor: (source: string, candidate: string) => boolean;
  migrationHead: Readonly<{ filename: string; sha256: string }>;
  edgeFunctionsTreeSha256: string;
}>): readonly Gate2BReadinessCode[];
```

**Input policy**

- PR mode uses repository-owned compile placeholders and cannot become a candidate.
- Manual mode requires `workflow_dispatch`, exact `refs/heads/main`, a non-placeholder Maps iOS key, exact `https://fhugdtpjbgiatqhvjioy.supabase.co`, and only `sb_publishable_...` or a decoded legacy JWT with `role: anon`.
- Reject `sb_secret_`, `service_role`, malformed JWT, whitespace, HTTP, userinfo, query/fragment, loopback, wrong host, missing value, and known placeholders using bounded codes only.
- CLI writes only mode or bounded codes and never echoes input values.

**Readiness schema/policy**

- JSON Schema `additionalProperties: false`, schema version `1`, fixed project ref/origin and fixed `passed|failed` check enums.
- Allowlist only source commit, migration-head filename/hash, Edge Functions tree hash, workflow run ID/attempt, created/expiry timestamps, and the five approved readiness results.
- Require creation/expiry interval `> 0` and `<= 72h`, evidence unexpired, source commit ancestor of candidate, and current hashes equal evidence.

**TDD sequence**

1. Write table-driven failing tests for every event/ref/value branch, privileged-key form, evidence field, time boundary, ancestry result, and hash mismatch.
2. Run only the new Jest test; confirm red for missing module.
3. Implement pure functions without reading `process.env`, filesystem, clock, or Git.
4. Add the thin CLI adapter and scripts `validate:ios-device-lab` / `test:ios-device-lab-policy`.
5. Run focused tests, mobile typecheck, root contract tests, and secret-pattern scans over fixtures/output.

**Acceptance**

- Tests prove every invalid path fails closed with bounded output.
- Gate 2B evidence cannot be forged by extra fields, stale timestamps, unrelated source, or changed migrations/functions.

## Task 3: Add deterministic unsigned-artifact inspection and packaging contracts

**Files**

- Create: `apps/mobile/scripts/ios-device-artifact-policy.ts`
- Create: `apps/mobile/scripts/ios-device-artifact-policy.test.ts`
- Create: `apps/mobile/scripts/inspect-ios-device-artifact.ts`
- Create: `apps/mobile/scripts/build-unsigned-ios.sh`
- Modify: `apps/mobile/package.json`
- Modify: `.gitignore`

**Policy interfaces**

```ts
export function evaluateIosArtifactInventory(input: Readonly<{
  topLevelEntries: readonly string[];
  appPaths: readonly string[];
  provisioningProfiles: readonly string[];
  signatureDirectories: readonly string[];
  machoFiles: readonly Readonly<{
    relativePath: string;
    architectures: readonly string[];
    platform: string;
    signatureState: 'absent' | 'adhoc' | 'valid';
  }>[];
  bundleIdentifier: string;
}>): readonly IosArtifactCode[];
```

**Build/inspection behavior**

- Select `/Applications/Xcode_26.4.1.app`; assert Xcode `26.4.1` build `17E202` before prebuild.
- Generate `apps/mobile/ios` with `expo prebuild --clean --platform ios --no-install`.
- Require reviewed `apps/mobile/ios-device-lab/Podfile.lock`; copy it into generated iOS and run CocoaPods 1.17.0 deployment install.
- Discover exactly one workspace and application scheme; use Release, generic iOS device destination, `iphoneos`, isolated DerivedData, and `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=`.
- Recursively remove `_CodeSignature`, embedded profiles, and any removable Mach-O signature, then inventory with `find`, `file`, `lipo`, `otool`/`vtool`, and `codesign`.
- Require one `Payload`, one app, exact pre-sign bundle ID, every Mach-O arm64/device platform, no profile/signature. Zip with `ditto`, extract fresh, repeat the policy, and emit allowlisted manifest/checksum.
- Clean generated iOS/staging/DerivedData with an unconditional trap. `.gitignore` names these paths explicitly.

**TDD sequence**

1. Add failing fixture-driven policy tests for extra payload entries, nested apps, profiles, signature directories, valid/ad-hoc signatures, missing arm64, simulator platform, wrong bundle ID, duplicate apps, and safe inventory.
2. Implement the pure inventory evaluator.
3. Implement the CLI adapter that parses a bounded inventory JSON generated by the shell; reject unknown fields and never emit filesystem paths beyond relative allowlisted entries.
4. Implement the shell pipeline using the policy adapter before and after packaging.
5. Run shell syntax checks where available, focused Jest, typecheck, native/pilot validators, and `git diff --check`. Native compilation remains a GitHub macOS gate.

**Acceptance**

- Local tests prove unsafe artifacts cannot be labelled candidates.
- Generated native/build paths are ignored, untracked, and always removed.
- Manifest contains no environment value, token, object path, device ID, or Apple identity.

## Task 4: Add the full-SHA-pinned lock-bootstrap and PR compile workflow

**Files**

- Create: `.github/workflows/ios-device-lab.yml`
- Create: `scripts/ios-device-lab-workflow-contract.test.mjs`
- Modify: `scripts/root-verify-contract.test.mjs`
- Modify: `package.json`

**Pinned action commits**

- `actions/checkout`: `11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node`: `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `pnpm/action-setup`: `b906affcce14559ad1aafd4ab0e942779e9f58b1`
- `ruby/setup-ruby`: `95ef2b042f9d7a56d8268cba8559e2842e2ad01b`
- `actions/upload-artifact`: `ea165f8d65b6e75b540449e92b4886f43607fa02`
- `actions/attest-build-provenance`: `977bb373ede98d70efdf65b84cb5f73e068dcc2a`

**Workflow contract**

- Unconditional `pull_request` and manual `workflow_dispatch`; workflow-level `contents: read` only.
- A bootstrap job runs only when the reviewed Pod lock is missing, resolves with exact tools, uploads only `Podfile.lock` for three days, and cannot compile, attest, attach an environment, or call itself a candidate.
- A PR compile job runs only when the reviewed Pod lock exists; fixed non-secret placeholders, no environment, no OIDC, no attestation, no installable artifact upload.
- A manual candidate job is initially present but fail-closed behind reviewed lock, exact `main`, protected `ios-device-lab` environment, three runtime secrets, valid Gate 2B evidence, and an explicit job permission map of `contents: read`, `id-token: write`, and `attestations: write`. All other permissions remain absent/`none`; no write permission is granted at workflow scope. Secret values are step-scoped to validation/prebuild/build and never global.
- Every `uses:` is an exact 40-hex SHA. No moving tag is permitted.

**TDD sequence**

1. Add a failing Node workflow contract that parses/inspects YAML text and asserts event coverage, runner/tool versions, action SHAs, job permissions, environment separation, secret scoping, bootstrap allowlist, candidate gates, cleanup, timeout, and retention.
2. Run the contract and confirm red with the workflow absent.
3. Implement the workflow minimally.
4. Run root contracts, Device Lab policy tests, YAML parse/contract, full `pnpm verify`, and diff hygiene.
5. Push the branch and open a draft PR, which the user's standing instruction authorizes. Do not merge it. Confirm the first macOS run is bootstrap-only and download only its `Podfile.lock` artifact.

**Acceptance**

- No PR or bootstrap job can access secrets or OIDC.
- First remote run yields only a Pod lock, not an IPA.

## Task 5: Review and commit the native Pod dependency lock, then obtain the secret-free macOS compile proof

**Files**

- Create: `apps/mobile/ios-device-lab/Podfile.lock`
- Create: `apps/mobile/scripts/podfile-lock-policy.ts`
- Create: `apps/mobile/scripts/podfile-lock-policy.test.ts`
- Modify: `.github/workflows/ios-device-lab.yml`

**Review contract**

- Verify the bootstrap artifact checksum and originating run/commit before copying only `Podfile.lock` into the repository with `apply_patch`.
- Reject external sources, local path pods outside the workspace allowlist, unexpected Git sources/branches, unpinned pod revisions, duplicate lock sections, missing SQLCipher/Expo/RN/Maps native pods, and CocoaPods version other than 1.17.0.
- Record no runner checkout, generated project, Pods directory, or credentials.

**TDD sequence**

1. Write failing lock-policy tests using small safe/unsafe fixtures.
2. Implement bounded text parsing/validation and run it against the downloaded lock.
3. Commit the reviewed lock and push to the same draft PR; do not merge.
4. Confirm the PR compile probe now performs prebuild, deployment-mode pod install, Release `iphoneos` compile, recursive unsigned/arm64/device checks, repack/extract recheck, and cleanup.
5. Record run ID, commit SHA, runner image, Xcode build, and bounded result in the PR; do not treat it as a device candidate.

**Acceptance**

- A fresh `macos-26` run proves SDK 57 native compatibility with the reviewed Pod lock.
- PR artifacts cannot be mistaken for installable candidates.

## Task 6: Stop at and consume the external Gate 2B readiness checkpoint

**Boundary**

This Device Lab plan does not implement, deploy, configure, run, or commit evidence for Gate 2B. It never receives Gate 2B privileged credentials. The producer requires its own approved design, implementation plan, isolated worktree, independent review and an explicit owner authorization before any hosted deployment, protected-secret configuration, synthetic-account mutation, workflow dispatch, or evidence commit.

**Read-only checks**

1. If `docs/evidence/pilot-gate-2b-readiness.json` is absent, record `gate_2b_readiness_missing` and stop the candidate path while leaving PR compile proof available.
2. If it is present, run only the Task 2 local validator against the tracked evidence, current migration/function hashes, current commit, and current clock.
3. Reject stale, failed, unrelated or hash-mismatched evidence with bounded codes. Do not attempt to refresh it from this plan.
4. Report Gate 2B readiness as an external prerequisite; never infer full Gate 2B or real token-expiry closure from it.

**Acceptance**

- Missing external evidence blocks only the manual candidate, not source verification, lock bootstrap or PR compilation.
- No Gate 2B remote mutation is reachable from Device Lab code, workflow permissions or execution steps.

## Task 7: Produce the protected manual unsigned candidate

**Files**

- Modify only if an independently reviewed finding proves a Device Lab implementation defect: `.github/workflows/ios-device-lab.yml`, Device Lab scripts/tests. Never relax the schema, validator, workflow or tests to accept failed, expired, unrelated or hash-mismatched external evidence; that evidence must be corrected by its separate producer.
- Create: `docs/evidence/ios-device-lab-candidate.json`

**Execution**

1. **Owner authorization checkpoint:** stop and request explicit approval to merge the reviewed PR. Merging is not implied by source implementation or a green PR compile proof.
2. **Owner-only configuration checkpoint:** the owner configures GitHub environment `ios-device-lab` with main-only deployment policy and the three shippable values: restricted Maps iOS key, exact hosted URL, and public Supabase key. Never add a service-role key or Apple credential. Codex may inspect the bounded environment metadata afterward but does not create/change secrets without a new explicit authorization.
3. **Owner authorization checkpoint:** after current external Gate 2B readiness evidence is present, request explicit approval to dispatch the protected candidate from exact merged/reviewed `main`. Do not dispatch before that approval.
4. Verify candidate job uses exact source SHA, passes public-key `/auth/v1/settings` probe, compiles, strips/rejects signatures, validates arm64/device payload twice, attests IPA provenance, and uploads only `.ipa`, manifest, checksum for at most seven days.
5. Download with `gh run download`, verify GitHub attestation and checksum locally, and create bounded candidate evidence containing only run/commit/artifact hashes, tool versions, pre-sign bundle ID, and `status`.
6. Request independent whole-branch specification and security/code-quality review. Resolve every Critical/Important finding and repeat affected gates.

**Acceptance**

- Candidate is explicitly unsigned and not represented as App Store/TestFlight/EAS evidence.
- Artifact and logs pass secret scans and three-file allowlist checks.

## Task 8: Prepare Windows local re-signing and stop at the physical-iPhone boundary

**Files**

- Create: `docs/runbooks/ios-free-account-device-test.md`
- Create: `docs/evidence/ios-device-physical-test-template.md`
- Modify: `docs/iteration-plan.md`
- Modify: `README.md`

**Runbook**

- Verify unsigned artifact attestation/SHA before AltStore.
- Install/use AltStore Classic 2.2 and record actual AltServer version; Apple Account is entered only locally.
- Create a throwaway venv and install exactly `pymobiledevice3==11.3.1`; use `pymobiledevice3 usbmux list` and `pymobiledevice3 apps list` with an unlocked, paired USB device. Store only redacted presence and effective bundle ID.
- Record AltStore App IDs/permissions view and sanitized AltServer errors. Do not require a re-signed IPA hash or store UDID/account data.
- If effective bundle ID changes, add it to the same Google Maps iOS restriction before launch; never make the key unrestricted.
- Execute the approved synthetic-only matrix: install/launch, glass/fallback and Dynamic Type, Maps/coarse privacy, camera/photo denial/allow, reviewed-copy/masking/source cleanup, SQLCipher process-kill recovery, Report resume/submit/receipt/My Reports, account-switch isolation, crash/network observations.
- Explain seven-day free provisioning and AltStore/SideStore experimental status. SideStore 0.6.3 is fallback evidence, not equivalent success.

**Verification and stopping rule**

1. Run full local verification and remote CI, run the Device Lab compile/candidate jobs when their authorization gates are satisfied, and read-only validate already-existing current hosted-readiness evidence before handoff. If that evidence is missing or invalid, record the external blocker; do not run or refresh Gate 2B from this plan.
2. Stop when the candidate, checksums, provenance, runbook, and empty physical evidence template are ready and the only remaining step requires the owner's connected iPhone/free Apple Account.
3. Do not claim physical-iOS completion until the owner returns the completed evidence template.

**Acceptance**

- All non-device gates are green or have an explicit external blocker with evidence.
- The final handoff identifies the exact artifact/run/SHA and the first local action, without requesting Apple credentials in chat.

---

## Final verification matrix

Run from a clean checkout of the final candidate SHA:

```powershell
pnpm install --frozen-lockfile
pnpm validate:pilot-policies
pnpm test:root-contracts
pnpm test:ios-device-lab-policy
pnpm verify
git diff --check
git status --short
```

Remote evidence required:

- existing Linux `verify` and `database-contracts` jobs green;
- macOS lock bootstrap completed once and its lock reviewed;
- macOS PR compile proof green for the committed lock;
- protected hosted Gate 2B readiness green and evidence current;
- protected manual Device Lab candidate green with provenance;
- independent final review: Critical 0, Important 0.

Physical-device evidence remains deliberately outside automated completion.
