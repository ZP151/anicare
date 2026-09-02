# iOS physical-device evidence template

**Status: NOT STARTED — fail closed.** This empty template is completed only by
the owner after a verified protected candidate is locally re-signed and tested.
It is not candidate evidence, Gate 2B evidence, or proof that a physical iPhone
test has happened. Do not replace required placeholders with guessed values.

## Candidate chain of custody

- Candidate status: `[[REQUIRED: verified unsigned device_candidate]]`
- Candidate run ID / attempt: `[[REQUIRED: actual value]]`
- Immutable source commit: `[[REQUIRED: actual 40-hex SHA]]`
- Unsigned IPA SHA-256: `[[REQUIRED: actual 64-hex SHA-256]]`
- Candidate manifest: `[[REQUIRED: matching exact candidate manifest JSON]]`
- GitHub provenance attestation: `[[REQUIRED: PASS or FAIL after local verification]]`
- Checksum comparison: `[[REQUIRED: PASS or FAIL]]`
- Gate 2B readiness: `[[EXTERNAL PREREQUISITE: not asserted by this template]]`

Leave the template uncompleted and stop if any required candidate field is
unavailable, provenance/checksum is not `PASS`, or the candidate is not the
reviewed protected workflow output. Do not substitute a bootstrap or PR-compile
run.

## Local installation record

- Installation tool: `[[REQUIRED: AltStore Classic 2.2 or SideStore 0.6.3 fallback]]`
- Actual AltServer version: `[[REQUIRED: observed locally]]`
- SideStore fallback used: `[[NOT RUN / YES / NO — separate from AltStore result]]`
- Device detected over paired unlocked USB: `[[NOT RUN / YES / NO]]`
- Exact non-identifying device model: `[[REQUIRED after test]]`
- iOS version/build (non-identifying): `[[REQUIRED after test]]`
- Developer Mode state: `[[REQUIRED after test]]`
- USB trust state: `[[REQUIRED after test]]`
- Free storage: `[[REQUIRED after test]]`
- Effective `CFBundleIdentifier`: `[[REQUIRED after installation]]`
- Google Maps restriction action: `[[NOT RUN / unchanged / exact effective ID added to same restricted key]]`
- AltStore App IDs/permissions summary: `[[REQUIRED: redacted bounded summary]]`
- Sanitized AltServer error class: `[[NONE / bounded sanitized error]]`

Never record an Apple ID, email address, password, app-specific password,
two-factor code, UDID, serial number, ECID, pairing record, raw device listing,
raw AltServer log, exact location, token, secret, or re-signed IPA hash.

## Synthetic-only test matrix

Use only `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`, followed by a concise
sanitized observation. All rows begin `NOT RUN`.

| Check | Status | Sanitized observation |
| --- | --- | --- |
| Install and first launch | `NOT RUN` | `[[required after test]]` |
| Liquid glass/fallback and Dynamic Type | `NOT RUN` | `[[required after test]]` |
| Maps render and coarse privacy behavior | `NOT RUN` | `[[required after test]]` |
| Camera denial and allow | `NOT RUN` | `[[required after test]]` |
| Photo-library denial and allow | `NOT RUN` | `[[required after test]]` |
| Reviewed-copy creation, masking, source cleanup | `NOT RUN` | `[[required after test]]` |
| SQLCipher process-kill recovery | `NOT RUN` | `[[required after test]]` |
| Report resume, submit, receipt, My Reports | `NOT RUN` | `[[required after test]]` |
| Sign-out/account-switch isolation and recovery | `NOT RUN` | `[[required after test]]` |
| Crash/network/Windows observations | `NOT RUN` | `[[required after test]]` |

Test data declaration: `[[REQUIRED: synthetic-only; no real person, exact
location, or unreviewed photo]]`.

## Completion boundary

This template remains `NOT STARTED` until the owner enters completed evidence.
A completed sanitized template can describe physical testing but does not by
itself claim Gate 2B completion, production readiness, App Store/TestFlight/EAS
distribution, or paid-developer signing. Free provisioning is expected to need
refresh within seven days. SideStore 0.6.3 fallback evidence is not equivalent
to AltStore success.
