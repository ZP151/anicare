import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  evaluateIosArtifactInventory,
  type IosArtifactCode,
} from './ios-device-artifact-policy';

const bashExecutable = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';

function readBuildScript(): string {
  return readFileSync(resolve(__dirname, 'build-unsigned-ios.sh'), 'utf8').replaceAll('\r\n', '\n');
}

const safeInventory = {
  topLevelEntries: ['Payload'],
  appPaths: ['Payload/WhiskerCommons.app'],
  provisioningProfiles: [],
  signatureDirectories: [],
  machoFiles: [{
    relativePath: 'Payload/WhiskerCommons.app/WhiskerCommons',
    architectures: ['arm64'],
    platform: 'iOS',
    signatureState: 'absent' as const,
  }],
  bundleIdentifier: 'sg.animalhelper.app',
} as const;

describe('unsigned iOS artifact inventory policy', () => {
  it('accepts a single unsigned arm64 iPhoneOS app in Payload', () => {
    expect(evaluateIosArtifactInventory(safeInventory)).toEqual([]);
  });

  it.each([
    ['extra top-level payload entries', { ...safeInventory, topLevelEntries: ['Payload', 'README.txt'] }, 'payload_layout_invalid'],
    ['a nested app bundle', { ...safeInventory, appPaths: ['Payload/WhiskerCommons.app/PlugIns/Helper.app'] }, 'app_bundle_path_invalid'],
    ['an embedded provisioning profile', { ...safeInventory, provisioningProfiles: ['Payload/WhiskerCommons.app/embedded.mobileprovision'] }, 'provisioning_profile_present'],
    ['a signature directory', { ...safeInventory, signatureDirectories: ['Payload/WhiskerCommons.app/_CodeSignature'] }, 'signature_directory_present'],
    ['a valid Mach-O signature', { ...safeInventory, machoFiles: [{ ...safeInventory.machoFiles[0], signatureState: 'valid' as const }] }, 'macho_signature_present'],
    ['an ad-hoc Mach-O signature', { ...safeInventory, machoFiles: [{ ...safeInventory.machoFiles[0], signatureState: 'adhoc' as const }] }, 'macho_signature_present'],
    ['a Mach-O without arm64', { ...safeInventory, machoFiles: [{ ...safeInventory.machoFiles[0], architectures: ['x86_64'] }] }, 'macho_arm64_missing'],
    ['a simulator Mach-O', { ...safeInventory, machoFiles: [{ ...safeInventory.machoFiles[0], platform: 'iOS Simulator' }] }, 'macho_platform_invalid'],
    ['a wrong pre-sign bundle identifier', { ...safeInventory, bundleIdentifier: 'com.example.other' }, 'bundle_identifier_invalid'],
    ['duplicate application bundles', { ...safeInventory, appPaths: ['Payload/WhiskerCommons.app', 'Payload/Copy.app'] }, 'app_bundle_count_invalid'],
  ] as const)('rejects %s with a bounded code', (_description, inventory, code) => {
    const codes = evaluateIosArtifactInventory(inventory);

    expect(codes).toContain(code as IosArtifactCode);
    expect(codes.every((value) => /^[a-z0-9_]+$/.test(value))).toBe(true);
  });

  it('does not label an inventory with no Mach-O files as a candidate', () => {
    expect(evaluateIosArtifactInventory({ ...safeInventory, machoFiles: [] }))
      .toContain('macho_file_missing');
  });
});

describe('iOS artifact inspection CLI', () => {
  it('accepts only the bounded inventory schema and never echoes an input path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ios-artifact-policy-'));
    const inventoryPath = join(directory, 'inventory.json');
    const unsafePath = '/private/runner/build/secret/Payload/WhiskerCommons.app';
    writeFileSync(inventoryPath, JSON.stringify({
      ...safeInventory,
      appPaths: [unsafePath],
      unexpected: 'must be rejected',
    }));

    const script = resolve(__dirname, 'inspect-ios-device-artifact.ts');
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), script, inventoryPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('inventory_shape_invalid');
    expect(`${result.stdout}${result.stderr}`).not.toContain(unsafePath);
    expect(`${result.stdout}${result.stderr}`).not.toContain(inventoryPath);
  });

  it('emits only an allowlisted candidate marker for a safe inventory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ios-artifact-policy-'));
    const inventoryPath = join(directory, 'inventory.json');
    writeFileSync(inventoryPath, JSON.stringify(safeInventory));
    const script = resolve(__dirname, 'inspect-ios-device-artifact.ts');

    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), script, inventoryPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('ios_artifact_candidate\n');
    expect(result.stderr).toBe('');
  });

  it('emits one bounded shape code for malformed inventory JSON', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ios-artifact-policy-'));
    const inventoryPath = join(directory, 'inventory.json');
    writeFileSync(inventoryPath, '{');
    const script = resolve(__dirname, 'inspect-ios-device-artifact.ts');

    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), script, inventoryPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('inventory_shape_invalid\n');
    expect(`${result.stdout}${result.stderr}`).not.toContain(inventoryPath);
  });

  it('rejects a control character in an otherwise relative inventory entry', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ios-artifact-policy-'));
    const inventoryPath = join(directory, 'inventory.json');
    writeFileSync(inventoryPath, JSON.stringify({
      ...safeInventory,
      appPaths: ['Payload/Whisker\nCommons.app'],
    }));
    const script = resolve(__dirname, 'inspect-ios-device-artifact.ts');
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), script, inventoryPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('inventory_shape_invalid');
  });
});

describe('unsigned iOS build shell contract', () => {
  it('parses with Bash before a compile probe can report success', () => {
    const script = resolve(__dirname, 'build-unsigned-ios.sh');
    const result = spawnSync(bashExecutable, ['-n', script], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('sanitizes control characters from runner image metadata before writing the manifest', () => {
    const script = readBuildScript();
    const definitions = [
      'set -euo pipefail',
      "APP_DIR='/tmp'",
      script.slice(script.indexOf('write_manifest() {'), script.indexOf('\nrequire_command codesign')),
    ].join('\n');
    const runner = [
      definitions,
      "git() { printf '%s\\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; }",
      "node() { printf '%s\\n%s\\n' \"$8\" \"$9\"; }",
      "ImageOS=$'runner\\timage'",
      "ImageVersion=$'version\\nimage'",
      "write_manifest destination sha 1 lock 'Xcode 26' ruby pod node pnpm",
    ].join('\n');
    const result = spawnSync(bashExecutable, ['-c', runner], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout.trimEnd().split(/\r?\n/)).toEqual(['unavailable', 'unavailable']);
    expect(result.stderr).toBe('');
  });

  it('keeps ASCII spaces in runner image metadata', () => {
    const script = readBuildScript();
    const definitions = [
      'set -euo pipefail',
      "APP_DIR='/tmp'",
      script.slice(script.indexOf('write_manifest() {'), script.indexOf('\nrequire_command codesign')),
    ].join('\n');
    const runner = [
      definitions,
      "git() { printf '%s\\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; }",
      "node() { printf '%s\\n%s\\n' \"$8\" \"$9\"; }",
      "ImageOS='runner image'",
      "ImageVersion='version image'",
      "write_manifest destination sha 1 lock 'Xcode 26' ruby pod node pnpm",
    ].join('\n');
    const result = spawnSync(bashExecutable, ['-c', runner], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout.trimEnd().split(/\r?\n/)).toEqual(['runner image', 'version image']);
    expect(result.stderr).toBe('');
  });

  it('selects the pinned toolchain and invokes the inventory policy before and after packaging', () => {
    const script = readBuildScript();

    expect(script).toContain('/Applications/Xcode_26.4.1.app');
    expect(script).toContain('26.4.1');
    expect(script).toContain('17E202');
    expect(script).toMatch(/xcode_version_line.*== 'Xcode 26\.4\.1'/);
    expect(script).toMatch(/xcode_build_line.*== 'Build version 17E202'/);
    expect(script).toContain('expo prebuild --clean --platform ios --no-install');
    expect(script).toContain('pod _1.17.0_ install --deployment');
    expect(script).toContain('-destination generic/platform=iOS');
    expect(script).toContain('CODE_SIGNING_ALLOWED=NO');
    expect(script).toContain('CODE_SIGNING_REQUIRED=NO');
    expect(script).toContain('CODE_SIGN_IDENTITY=');
    expect(script).toContain('inspect-ios-device-artifact.ts');
    expect(script).toContain('ditto');
    expect(script).toContain('trap cleanup EXIT');
    expect(script).toContain('payload_directory_missing');
  });

  it('only cleans generated paths owned by the current invocation', () => {
    const script = readBuildScript();

    expect(script).toContain('ios_dir_owned=0');
    expect(script).toContain('staging_dir_owned=0');
    expect(script).toContain('derived_data_dir_owned=0');
    expect(script).toContain('cleanup_owned_path');
    expect(script).toContain('ios_dir_owned=1');
    expect(script).toContain('staging_dir_owned=1');
    expect(script).toContain('derived_data_dir_owned=1');
    expect(script).toContain('artifact_dir_owned=0');
    expect(script).toContain('artifact_dir_owned=1');
    expect(script).toContain('artifact_directory_not_empty');
    expect(script).toContain('artifact_allowlist_invalid');
    expect(script).toContain('pnpm validate:reviewed-ios-device-lab-podfile-lock');
    expect(script).toContain('mkdir -- "$ARTIFACT_DIR"\nartifact_dir_owned=1');
    expect(script).toContain('assert_artifact_allowlist "$artifact_base"\nartifact_dir_owned=0');
  });

  it('transfers artifact ownership after a successful allowlist assertion while failed builds still clean it', () => {
    const script = readBuildScript();
    const cleanup = script.slice(script.indexOf('cleanup_owned_path() {'), script.indexOf('\ntrap cleanup EXIT'));
    const assertion = script.slice(script.indexOf('assert_artifact_allowlist() {'), script.indexOf('\nrequire_command codesign'));
    const runner = [
      'set -euo pipefail',
      'APP_DIR="$(mktemp -d)"',
      'IOS_DIR="$APP_DIR/ios"; STAGING_DIR="$APP_DIR/.ios-device-lab-staging"; DERIVED_DATA_DIR="$APP_DIR/.ios-device-lab-derived-data"; ARTIFACT_DIR="$APP_DIR/ios-device-lab-artifacts"',
      'ios_dir_owned=0; staging_dir_owned=0; derived_data_dir_owned=0; artifact_dir_owned=0',
      "fail() { exit 1; }",
      cleanup,
      assertion,
      'mkdir "$ARTIFACT_DIR"; artifact_dir_owned=1',
      "base='whiskercommons-unsigned-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
      'touch "$ARTIFACT_DIR/${base}.ipa" "$ARTIFACT_DIR/${base}.manifest.json" "$ARTIFACT_DIR/${base}.sha256"',
      'assert_artifact_allowlist "$base"; artifact_dir_owned=0; cleanup; test -f "$ARTIFACT_DIR/${base}.ipa"',
      'artifact_dir_owned=1; cleanup; test ! -e "$ARTIFACT_DIR"',
    ].join('\n');
    const result = spawnSync(bashExecutable, ['-c', runner], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('validates the reviewed source before copying and the generated copy before CocoaPods deployment', () => {
    const script = readBuildScript();
    const reviewed = script.indexOf('pnpm validate:reviewed-ios-device-lab-podfile-lock');
    const copy = script.indexOf('cp -- "$LOCKFILE_SOURCE" "$IOS_DIR/Podfile.lock"');
    const generated = script.indexOf('pnpm validate:generated-ios-device-lab-podfile-lock');
    const deployment = script.indexOf('pod _1.17.0_ install --deployment');

    expect(reviewed).toBeGreaterThan(-1);
    expect(copy).toBeGreaterThan(reviewed);
    expect(generated).toBeGreaterThan(copy);
    expect(deployment).toBeGreaterThan(generated);
    expect(script).toContain('generated_podfile_lock_invalid');
    expect(script).toContain('podfile_lock_sha256="$(shasum -a 256 "$IOS_DIR/Podfile.lock"');
  });

  it('accepts exactly the three regular SHA-derived artifact files and rejects additions or symlinks', () => {
    const script = readBuildScript();
    const assertion = script.slice(script.indexOf('assert_artifact_allowlist() {'), script.indexOf('\nrequire_command codesign'));
    const runner = [
      'set -euo pipefail',
      "fail() { exit 1; }",
      assertion,
      'ARTIFACT_DIR="$(mktemp -d)"',
      "base='whiskercommons-unsigned-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
      'touch "$ARTIFACT_DIR/${base}.ipa" "$ARTIFACT_DIR/${base}.manifest.json" "$ARTIFACT_DIR/${base}.sha256"',
      'assert_artifact_allowlist "$base"',
      'touch "$ARTIFACT_DIR/unreviewed.zip"',
      'if (assert_artifact_allowlist "$base"); then exit 41; fi',
      'rm "$ARTIFACT_DIR/unreviewed.zip" "$ARTIFACT_DIR/${base}.manifest.json"',
      'ln -s "$ARTIFACT_DIR/${base}.ipa" "$ARTIFACT_DIR/${base}.manifest.json"',
      'if [[ -L "$ARTIFACT_DIR/${base}.manifest.json" ]] && (assert_artifact_allowlist "$base"); then exit 42; fi',
    ].join('\n');
    const result = spawnSync(bashExecutable, ['-c', runner], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
