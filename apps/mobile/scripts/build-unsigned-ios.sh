#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
XCODE_APP='/Applications/Xcode_26.4.1.app'
IOS_DIR="$APP_DIR/ios"
LOCKFILE_SOURCE="$APP_DIR/ios-device-lab/Podfile.lock"
STAGING_DIR="$APP_DIR/.ios-device-lab-staging"
DERIVED_DATA_DIR="$APP_DIR/.ios-device-lab-derived-data"
ARTIFACT_DIR="$APP_DIR/ios-device-lab-artifacts"
ios_dir_owned=0
staging_dir_owned=0
derived_data_dir_owned=0
artifact_dir_owned=0

cleanup_owned_path() {
  local path="$1"
  local owned="$2"
  [[ "$owned" == '1' ]] || return 0
  rm -rf -- "$path"
}

cleanup() {
  case "$IOS_DIR:$STAGING_DIR:$DERIVED_DATA_DIR:$ARTIFACT_DIR" in
    "$APP_DIR/ios:$APP_DIR/.ios-device-lab-staging:$APP_DIR/.ios-device-lab-derived-data:$APP_DIR/ios-device-lab-artifacts") ;;
    *) exit 1 ;;
  esac
  cleanup_owned_path "$IOS_DIR" "$ios_dir_owned"
  cleanup_owned_path "$STAGING_DIR" "$staging_dir_owned"
  cleanup_owned_path "$DERIVED_DATA_DIR" "$derived_data_dir_owned"
  cleanup_owned_path "$ARTIFACT_DIR" "$artifact_dir_owned"
}
trap cleanup EXIT

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required_command_missing"
}

relative_to_root() {
  local root="$1"
  local path="$2"
  case "$path" in
    "$root"/*) printf '%s\n' "${path#"$root"/}" ;;
    *) fail "inventory_path_invalid" ;;
  esac
}

signature_state() {
  local target="$1"
  local details
  if details="$(codesign -d --verbose=4 "$target" 2>&1)"; then
    if grep -qi 'Signature=adhoc' <<<"$details"; then
      printf '%s\n' 'adhoc'
    else
      printf '%s\n' 'valid'
    fi
  else
    printf '%s\n' 'absent'
  fi
}

platform_for_macho() {
  local target="$1"
  local build_info
  build_info="$(vtool -show-build "$target" 2>/dev/null || true)"
  if grep -Eq 'platform[[:space:]]+IOSSIMULATOR' <<<"$build_info"; then
    printf '%s\n' 'iOS Simulator'
  elif grep -Eq 'platform[[:space:]]+IOS([[:space:]]|$)' <<<"$build_info"; then
    printf '%s\n' 'iOS'
  else
    printf '%s\n' 'unknown'
  fi
}

write_inventory() {
  local root="$1"
  local destination="$2"
  local inventory_dir="$STAGING_DIR/inventory"
  local top_level="$inventory_dir/top-level"
  local apps="$inventory_dir/apps"
  local profiles="$inventory_dir/profiles"
  local signatures="$inventory_dir/signatures"
  local machos="$inventory_dir/machos"
  local candidate relative file_description architectures platform signature

  [[ -d "$root/Payload" ]] || fail "payload_directory_missing"
  rm -rf -- "$inventory_dir"
  mkdir -p -- "$inventory_dir"
  : > "$top_level"
  : > "$apps"
  : > "$profiles"
  : > "$signatures"
  : > "$machos"

  while IFS= read -r -d '' candidate; do
    relative_to_root "$root" "$candidate" >> "$top_level"
  done < <(find "$root" -mindepth 1 -maxdepth 1 -print0)

  while IFS= read -r -d '' candidate; do
    relative_to_root "$root" "$candidate" >> "$apps"
  done < <(find "$root/Payload" -type d -name '*.app' -print0)

  while IFS= read -r -d '' candidate; do
    relative_to_root "$root" "$candidate" >> "$profiles"
  done < <(find "$root/Payload" -type f \( -name '*.mobileprovision' -o -name 'embedded.mobileprovision' \) -print0)

  while IFS= read -r -d '' candidate; do
    relative_to_root "$root" "$candidate" >> "$signatures"
  done < <(find "$root/Payload" -type d -name '_CodeSignature' -print0)

  while IFS= read -r -d '' candidate; do
    file_description="$(file -b "$candidate")"
    [[ "$file_description" == *'Mach-O'* ]] || continue
    relative="$(relative_to_root "$root" "$candidate")"
    architectures="$(lipo -archs "$candidate")"
    [[ -n "$architectures" ]] || fail "macho_architecture_inventory_failed"
    platform="$(platform_for_macho "$candidate")"
    signature="$(signature_state "$candidate")"
    printf '%s\t%s\t%s\t%s\n' "$relative" "$architectures" "$platform" "$signature" >> "$machos"
  done < <(find "$root/Payload" -type f -print0)

  node - "$top_level" "$apps" "$profiles" "$signatures" "$machos" "$destination" <<'NODE'
const fs = require('node:fs');
const [topLevelPath, appsPath, profilesPath, signaturesPath, machosPath, destination] = process.argv.slice(2);
const lines = (path) => fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
const machoFiles = lines(machosPath).map((line) => {
  const [relativePath, architectures, platform, signatureState, extra] = line.split('\t');
  if (extra !== undefined || !relativePath || !architectures || !platform || !signatureState) process.exit(1);
  return { relativePath, architectures: architectures.split(' '), platform, signatureState };
});
fs.writeFileSync(destination, `${JSON.stringify({
  topLevelEntries: lines(topLevelPath),
  appPaths: lines(appsPath),
  provisioningProfiles: lines(profilesPath),
  signatureDirectories: lines(signaturesPath),
  machoFiles,
  bundleIdentifier: process.env.IOS_DEVICE_BUNDLE_IDENTIFIER,
})}\n`);
NODE
}

write_manifest() {
  local destination="$1"
  local ipa_sha256="$2"
  local ipa_size="$3"
  local lock_sha256="$4"
  local xcode_version="$5"
  local ruby_version="$6"
  local pod_version="$7"
  local node_version="$8"
  local pnpm_version="$9"
  local repository="${GITHUB_REPOSITORY:-unavailable}"
  local run_id="${GITHUB_RUN_ID:-0}"
  local run_attempt="${GITHUB_RUN_ATTEMPT:-0}"
  local workflow_ref="${GITHUB_WORKFLOW_REF:-unavailable}"
  local image_os="${ImageOS:-unavailable}"
  local image_version="${ImageVersion:-unavailable}"
  local commit_sha
  commit_sha="$(git -C "$APP_DIR/../.." rev-parse HEAD)"

  [[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || repository='unavailable'
  [[ "$run_id" =~ ^[0-9]+$ ]] || run_id=0
  [[ "$run_attempt" =~ ^[0-9]+$ ]] || run_attempt=0
  [[ "$workflow_ref" =~ ^[A-Za-z0-9_./@-]+$ ]] || workflow_ref='unavailable'
  [[ "$image_os" =~ ^[-A-Za-z0-9_.\ ]+$ ]] || image_os='unavailable'
  [[ "$image_version" =~ ^[-A-Za-z0-9_.\ ]+$ ]] || image_version='unavailable'

  node - "$destination" "$repository" "$commit_sha" "$run_id" "$run_attempt" "$workflow_ref" "$image_os" "$image_version" "$xcode_version" "$ruby_version" "$pod_version" "$node_version" "$pnpm_version" "$ipa_sha256" "$ipa_size" "$lock_sha256" <<'NODE'
const fs = require('node:fs');
const [destination, repository, commitSha, runId, runAttempt, workflowRef, imageOS, imageVersion, xcodeVersion, rubyVersion, cocoapodsVersion, nodeVersion, pnpmVersion, ipaSha256, ipaByteSize, podfileLockSha256] = process.argv.slice(2);
const pnpmLockSha256 = process.env.PNPM_LOCK_SHA256;
const bundleIdentifier = process.env.IOS_DEVICE_BUNDLE_IDENTIFIER;
fs.writeFileSync(destination, `${JSON.stringify({
  schemaVersion: 1,
  repository,
  commitSha,
  runId: Number(runId),
  runAttempt: Number(runAttempt),
  workflowRef,
  imageOS,
  imageVersion,
  xcodeVersion,
  rubyVersion,
  cocoapodsVersion,
  nodeVersion,
  pnpmVersion,
  bundleIdentifier,
  ipaByteSize: Number(ipaByteSize),
  ipaSha256,
  pnpmLockSha256,
  podfileLockSha256,
})}\n`);
NODE
}

assert_artifact_allowlist() {
  local artifact_base="$1"
  local expected_ipa="$ARTIFACT_DIR/${artifact_base}.ipa"
  local expected_manifest="$ARTIFACT_DIR/${artifact_base}.manifest.json"
  local expected_checksum="$ARTIFACT_DIR/${artifact_base}.sha256"
  local entries=()
  local candidate

  [[ -d "$ARTIFACT_DIR" && ! -L "$ARTIFACT_DIR" ]] || fail "artifact_allowlist_invalid"
  while IFS= read -r -d '' candidate; do
    entries+=("$candidate")
  done < <(find "$ARTIFACT_DIR" -mindepth 1 -maxdepth 1 -print0)
  [[ "${#entries[@]}" -eq 3 ]] || fail "artifact_allowlist_invalid"
  for candidate in "${entries[@]}"; do
    [[ -f "$candidate" && ! -L "$candidate" ]] || fail "artifact_allowlist_invalid"
  done
  [[ -f "$expected_ipa" && ! -L "$expected_ipa" ]] || fail "artifact_allowlist_invalid"
  [[ -f "$expected_manifest" && ! -L "$expected_manifest" ]] || fail "artifact_allowlist_invalid"
  [[ -f "$expected_checksum" && ! -L "$expected_checksum" ]] || fail "artifact_allowlist_invalid"
}

require_command codesign
require_command ditto
require_command file
require_command find
require_command lipo
require_command node
require_command otool
require_command pod
require_command pnpm
require_command ruby
require_command shasum
require_command stat
require_command vtool
require_command xcodebuild

[[ -d "$XCODE_APP" ]] || fail "xcode_path_missing"
sudo xcode-select -s "$XCODE_APP/Contents/Developer"
export DEVELOPER_DIR="$XCODE_APP/Contents/Developer"
xcode_version="$(xcodebuild -version)"
xcode_version_line="$(printf '%s\n' "$xcode_version" | sed -n '1p')"
xcode_build_line="$(printf '%s\n' "$xcode_version" | sed -n '2p')"
[[ "$xcode_version_line" == 'Xcode 26.4.1' && "$xcode_build_line" == 'Build version 17E202' ]] || fail "xcode_version_invalid"

[[ -f "$LOCKFILE_SOURCE" ]] || fail "reviewed_podfile_lock_missing"
[[ ! -e "$IOS_DIR" && ! -e "$STAGING_DIR" && ! -e "$DERIVED_DATA_DIR" ]] || fail "generated_path_already_exists"
[[ ! -e "$ARTIFACT_DIR" ]] || fail "artifact_directory_not_empty"
ios_dir_owned=1
staging_dir_owned=1
derived_data_dir_owned=1
artifact_dir_owned=1

cd -- "$APP_DIR"
pnpm exec expo prebuild --clean --platform ios --no-install
pnpm exec tsx "$SCRIPT_DIR/prepare-ios-device-lab-podfile.ts"
cp -- "$LOCKFILE_SOURCE" "$IOS_DIR/Podfile.lock"
pnpm validate:reviewed-ios-device-lab-podfile-lock
pod_version="$(pod _1.17.0_ --version)"
[[ "$pod_version" == '1.17.0' ]] || fail "cocoapods_version_invalid"
(
  cd -- "$IOS_DIR"
  pod _1.17.0_ install --deployment
)

workspaces=()
while IFS= read -r -d '' candidate; do
  workspaces+=("$candidate")
done < <(find "$IOS_DIR" -mindepth 1 -maxdepth 1 -type d -name '*.xcworkspace' -print0)
[[ "${#workspaces[@]}" -eq 1 ]] || fail "workspace_count_invalid"

scheme_files=()
while IFS= read -r -d '' candidate; do
  scheme_files+=("$candidate")
done < <(find "$IOS_DIR" -path '*/Pods/*' -prune -o -path '*.xcodeproj/xcshareddata/xcschemes/*.xcscheme' -type f -print0)
[[ "${#scheme_files[@]}" -eq 1 ]] || fail "application_scheme_count_invalid"
scheme="$(basename -- "${scheme_files[0]}" .xcscheme)"

xcodebuild \
  -workspace "${workspaces[0]}" \
  -scheme "$scheme" \
  -configuration Release \
  -sdk iphoneos \
  -destination generic/platform=iOS \
  -derivedDataPath "$DERIVED_DATA_DIR" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY= \
  build

app_bundles=()
while IFS= read -r -d '' candidate; do
  app_bundles+=("$candidate")
done < <(find "$DERIVED_DATA_DIR/Build/Products/Release-iphoneos" -mindepth 1 -maxdepth 1 -type d -name '*.app' -print0)
[[ "${#app_bundles[@]}" -eq 1 ]] || fail "built_app_count_invalid"
app_bundle="${app_bundles[0]}"

export IOS_DEVICE_BUNDLE_IDENTIFIER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_bundle/Info.plist")"
[[ "$IOS_DEVICE_BUNDLE_IDENTIFIER" == 'sg.animalhelper.app' ]] || fail "bundle_identifier_invalid"

while IFS= read -r -d '' candidate; do
  rm -rf -- "$candidate"
done < <(find "$app_bundle" -type d -name '_CodeSignature' -print0)
while IFS= read -r -d '' candidate; do
  rm -f -- "$candidate"
done < <(find "$app_bundle" -type f \( -name '*.mobileprovision' -o -name 'embedded.mobileprovision' \) -print0)
while IFS= read -r -d '' candidate; do
  [[ "$(file -b "$candidate")" == *'Mach-O'* ]] || continue
  if codesign -d --verbose=4 "$candidate" >/dev/null 2>&1; then
    codesign --remove-signature "$candidate"
  fi
done < <(find "$app_bundle" -type f -print0)

mkdir -p -- "$STAGING_DIR/pre-package/Payload" "$STAGING_DIR/extracted"
mkdir -- "$ARTIFACT_DIR"
ditto "$app_bundle" "$STAGING_DIR/pre-package/Payload/$(basename -- "$app_bundle")"
write_inventory "$STAGING_DIR/pre-package" "$STAGING_DIR/pre-package-inventory.json"
pnpm exec tsx "$SCRIPT_DIR/inspect-ios-device-artifact.ts" "$STAGING_DIR/pre-package-inventory.json"

commit_sha="$(git -C "$APP_DIR/../.." rev-parse HEAD)"
artifact_base="whiskercommons-unsigned-${commit_sha}"
ipa_path="$ARTIFACT_DIR/${artifact_base}.ipa"
manifest_path="$ARTIFACT_DIR/${artifact_base}.manifest.json"
checksum_path="$ARTIFACT_DIR/${artifact_base}.sha256"
ditto -c -k --sequesterRsrc --keepParent "$STAGING_DIR/pre-package/Payload" "$ipa_path"
ditto -x -k "$ipa_path" "$STAGING_DIR/extracted"
write_inventory "$STAGING_DIR/extracted" "$STAGING_DIR/post-package-inventory.json"
pnpm exec tsx "$SCRIPT_DIR/inspect-ios-device-artifact.ts" "$STAGING_DIR/post-package-inventory.json"

ipa_sha256="$(shasum -a 256 "$ipa_path" | awk '{print $1}')"
ipa_size="$(stat -f '%z' "$ipa_path")"
podfile_lock_sha256="$(shasum -a 256 "$LOCKFILE_SOURCE" | awk '{print $1}')"
export PNPM_LOCK_SHA256="$(shasum -a 256 "$APP_DIR/../../pnpm-lock.yaml" | awk '{print $1}')"
write_manifest \
  "$manifest_path" "$ipa_sha256" "$ipa_size" "$podfile_lock_sha256" \
  "$xcode_version" "$(ruby --version)" "$pod_version" "$(node --version)" "$(pnpm --version)"
printf '%s  %s\n' "$ipa_sha256" "$(basename -- "$ipa_path")" > "$checksum_path"
assert_artifact_allowlist "$artifact_base"
