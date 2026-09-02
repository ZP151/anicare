import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  evaluateIosArtifactInventory,
  type IosArtifactCode,
} from './ios-device-artifact-policy';

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
  it('selects the pinned toolchain and invokes the inventory policy before and after packaging', () => {
    const script = readFileSync(resolve(__dirname, 'build-unsigned-ios.sh'), 'utf8');

    expect(script).toContain('/Applications/Xcode_26.4.1.app');
    expect(script).toContain('26.4.1');
    expect(script).toContain('17E202');
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
});
