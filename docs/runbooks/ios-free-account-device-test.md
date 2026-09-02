# iOS free-account physical-device test handoff

**Status: NOT READY TO EXECUTE.** This runbook is a local-owner handoff only.
Do not begin until a protected `device_candidate` run has produced verified
candidate evidence. The placeholders below intentionally fail closed: do not
replace them with guesses, a PR compile run, a lock-bootstrap run, or a
locally invented hash.

## Required candidate inputs

Obtain all of the following from the reviewed candidate evidence and its
three-file artifact allowlist before opening AltStore:

- `[[REQUIRED: immutable candidate commit SHA]]`
- `[[REQUIRED: candidate run ID and attempt]]`
- `[[REQUIRED: downloaded unsigned IPA]]`
- `[[REQUIRED: matching SHA-256 checksum file]]`
- `[[REQUIRED: matching candidate manifest JSON]]`
- `[[REQUIRED: successful GitHub provenance-attestation verification]]`

The input must identify an unsigned candidate, not App Store, TestFlight, EAS,
or physical-device evidence. A missing, expired, failed, unrelated, or
checksum-mismatched input is a stop condition. Gate 2B readiness remains an
external prerequisite; this runbook neither creates it nor claims it passed.

## 1. Verify provenance and the unsigned artifact

On Windows, download only the reviewed IPA, manifest, and checksum from the
candidate allowlist. Before local re-signing, verify the GitHub attestation for
the IPA against the actual repository, then compare the IPA's SHA-256 with its
reviewed checksum file. Do not use an attestation result from another artifact.

```powershell
$candidateIpa = Read-Host 'Full path to the downloaded unsigned IPA'
$checksumFile = Read-Host 'Full path to its downloaded checksum file'
$manifestFile = Read-Host 'Full path to its downloaded candidate manifest JSON'
$repository = Read-Host 'Verified repository in owner/name form'
$candidateSha = Read-Host 'Verified immutable candidate 40-hex SHA'
$candidateRunId = Read-Host 'Verified candidate run ID'
$candidateRunAttempt = Read-Host 'Verified candidate run attempt'

if (-not (Test-Path -LiteralPath $candidateIpa -PathType Leaf)) { throw 'candidate_ipa_missing' }
if (-not (Test-Path -LiteralPath $checksumFile -PathType Leaf)) { throw 'candidate_checksum_missing' }
if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) { throw 'candidate_manifest_missing' }
if ($repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'repository_invalid' }
if ($candidateSha -notmatch '^[a-f0-9]{40}$') { throw 'candidate_sha_invalid' }
if ($candidateRunId -notmatch '^[1-9][0-9]*$' -or $candidateRunAttempt -notmatch '^[1-9][0-9]*$') { throw 'candidate_run_invalid' }

$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$manifestKeys = @('schemaVersion','repository','commitSha','runId','runAttempt','workflowRef','imageOS','imageVersion','xcodeVersion','rubyVersion','cocoapodsVersion','nodeVersion','pnpmVersion','bundleIdentifier','ipaByteSize','ipaSha256','pnpmLockSha256','podfileLockSha256')
$actualManifestKeys = @($manifest.PSObject.Properties.Name | Sort-Object)
if (@(Compare-Object -ReferenceObject ($manifestKeys | Sort-Object) -DifferenceObject $actualManifestKeys).Count -ne 0) { throw 'candidate_manifest_invalid' }
$manifestIntegerFields = @($manifest.schemaVersion, $manifest.runId, $manifest.runAttempt, $manifest.ipaByteSize)
if ($manifestIntegerFields | Where-Object { $_ -isnot [int] -and $_ -isnot [long] }) { throw 'candidate_manifest_invalid' }
$manifestStringFields = @($manifest.repository, $manifest.commitSha, $manifest.workflowRef, $manifest.imageOS, $manifest.imageVersion, $manifest.xcodeVersion, $manifest.rubyVersion, $manifest.cocoapodsVersion, $manifest.nodeVersion, $manifest.pnpmVersion, $manifest.bundleIdentifier, $manifest.ipaSha256, $manifest.pnpmLockSha256, $manifest.podfileLockSha256)
if ($manifestStringFields | Where-Object { $_ -isnot [string] }) { throw 'candidate_manifest_invalid' }
$expectedBase = "whiskercommons-unsigned-$candidateSha"
$expectedIpaName = "$expectedBase.ipa"
$expectedManifestName = "$expectedBase.manifest.json"
$expectedChecksumName = "$expectedBase.sha256"
if ((Split-Path -Leaf $candidateIpa) -ne $expectedIpaName -or
    (Split-Path -Leaf $manifestFile) -ne $expectedManifestName -or
    (Split-Path -Leaf $checksumFile) -ne $expectedChecksumName) { throw 'candidate_filename_invalid' }
if ($manifest.schemaVersion -ne 1 -or $manifest.repository -ne $repository -or
    $manifest.commitSha -ne $candidateSha -or $manifest.runId -ne [int64]$candidateRunId -or
    $manifest.runAttempt -ne [int64]$candidateRunAttempt -or
    $manifest.workflowRef -ne "$repository/.github/workflows/ios-device-lab.yml@refs/heads/main" -or
    $manifest.bundleIdentifier -ne 'sg.animalhelper.app' -or $manifest.ipaSha256 -notmatch '^[a-f0-9]{64}$' -or
    $manifest.pnpmLockSha256 -notmatch '^[a-f0-9]{64}$' -or $manifest.podfileLockSha256 -notmatch '^[a-f0-9]{64}$' -or
    $manifest.imageOS -notmatch '^[-A-Za-z0-9_. ]+$' -or
    $manifest.imageVersion -notmatch '^[-A-Za-z0-9_. ]+$' -or
    $manifest.xcodeVersion -ne "Xcode 26.4.1`nBuild version 17E202" -or
    $manifest.rubyVersion -notmatch '^ruby 3\.3\.12 ' -or $manifest.cocoapodsVersion -ne '1.17.0' -or
    $manifest.nodeVersion -ne 'v22.23.1' -or $manifest.pnpmVersion -ne '11.19.0' -or
    $manifest.ipaByteSize -lt 1) { throw 'candidate_manifest_invalid' }
$githubCli = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue
if ($null -eq $githubCli) { throw 'github_cli_missing' }
& $githubCli.Source attestation verify $candidateIpa --repo $repository --signer-workflow "$repository/.github/workflows/ios-device-lab.yml" --source-ref refs/heads/main --source-digest $candidateSha --deny-self-hosted-runners
if ($LASTEXITCODE -ne 0) { throw 'candidate_attestation_invalid' }
$expected = $manifest.ipaSha256
$actual = (Get-FileHash -LiteralPath $candidateIpa -Algorithm SHA256).Hash
$actualByteSize = (Get-Item -LiteralPath $candidateIpa).Length
$checksumContent = (Get-Content -LiteralPath $checksumFile -Raw) -replace "`r`n", "`n"
if ($manifest.ipaByteSize -ne $actualByteSize -or $checksumContent -ne "$expected  $expectedIpaName`n" -or $actual -ne $expected.ToUpperInvariant()) { throw 'candidate_sha256_mismatch' }
```

Record only a pass/fail result, the reviewed unsigned-artifact SHA-256, and the
immutable candidate run/commit in the evidence template. Do **not** require or
invent a post-AltStore re-signed IPA hash; AltStore may not expose one.

## 2. Install locally with AltStore

1. Install or use **AltStore Classic 2.2** on the owner-controlled Windows
   machine. Record the **actual** AltServer version shown locally; do not assume
   it is 2.2.
2. Connect the owner's paired, unlocked iPhone over USB and complete any local
   trust prompts. Apple Account entry, password, app-specific password, and
   two-factor approval happen only in AltStore/AltServer on that machine; never
   place them in chat, Git, GitHub, a screenshot, or the evidence template.
3. Install the verified unsigned IPA with AltStore. In AltStore's App IDs and
   permissions view, record only the effective bundle ID and a redacted
   permission/App-ID summary. Export AltServer errors only after sanitizing
   them.

Free Personal Team provisioning, App IDs, devices, and installed apps can
expire after **seven days** and are subject to Apple's limits. This is an
experimental free-account bridge, not an EAS, TestFlight, App Store, or paid
Apple Developer distribution path.

If AltStore cannot complete the local install, **SideStore 0.6.3** may be tried
as separately labelled fallback evidence. A SideStore result is not equivalent
to an AltStore success and does not erase the original failure.

## 3. Inspect the paired device without retaining identifiers

Create a throwaway virtual environment and install exactly the approved tool
version. Run these commands only with the paired, unlocked USB device present.

```powershell
py -3 -m venv .venv-ios-device-lab
.\.venv-ios-device-lab\Scripts\Activate.ps1
python -m pip install --disable-pip-version-check pymobiledevice3==11.3.1
pymobiledevice3 usbmux list
pymobiledevice3 apps list
```

Record only: `device detected: yes/no`, exact non-identifying device model, exact
iOS version/build, Developer Mode state, trust state, free storage, `app entry
present: yes/no`, and the effective `CFBundleIdentifier`. These device facts are
required observations, not optional fields.
Remove or do not copy UDID, serial number, ECID, Wi-Fi pairing data, account
data, full device listings, raw logs, and exact locations.

If the effective bundle ID differs from `sg.animalhelper.app`, add that exact
effective ID to the **same restricted Google Maps iOS key** before testing the
map. Keep the key limited to Maps SDK for iOS and its application restrictions;
never make it unrestricted. This does not authorize a rebuild merely because
the embedded key is unchanged.

## 4. Synthetic-only physical test matrix

Use synthetic cats, synthetic reports, coarse non-personal areas, and reviewed
test media only. Never use real people, unreviewed photos, exact colony
locations, Apple-account data, or production claims. Mark each row in the
evidence template as `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`, with a concise
sanitized observation.

| Area | Required observation |
| --- | --- |
| Install and launch | Install outcome, first launch, and recovery after local re-signing. |
| Glass and accessibility | Liquid-glass capability/fallback plus Dynamic Type smoke check. |
| Maps and privacy | Google Maps render and coarse-area/privacy behavior; no exact location is recorded. |
| Camera and photos | Camera and photo-library denial and allow flows. |
| Reviewed media | Reviewed-copy creation, bystander masking, and source cleanup. |
| SQLCipher | Draft persistence across process kill and restart. |
| Report journey | Resume, submit, receipt, and My Reports using synthetic data. |
| Isolation | Sign-out/account-switch isolation and recovery behavior. |
| Observations | Crash, network, AltServer, and Windows Apple Devices/iTunes observations after redaction. |

## 5. Evidence, limits, and stop rule

Complete [the empty physical evidence template](../evidence/ios-device-physical-test-template.md)
without adding credentials, UDIDs, exact locations, raw device output, or a
re-signed IPA hash. Sanitized AltServer errors may name a bounded error class
but must not contain account identifiers or tokens.

Stop and report an external blocker if candidate provenance/checksum is absent
or invalid, the protected candidate has not been authorized, Gate 2B readiness
is missing/invalid, the device is not paired/unlocked, an installation fails,
or any matrix row fails. This repository must not claim physical-iOS completion
until the owner returns a completed, sanitized evidence template.
