import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  prepareIosDeviceLabPodfile,
  prepareIosDeviceLabPodfileAtRoot,
} from './prepare-ios-device-lab-podfile';

const generatedMapsLine = '  rn_maps_path = File.dirname(`node --print "require.resolve(\'react-native-maps/package.json\')"`) ';
const normalizedMapsLine = "  rn_maps_path = '../node_modules/react-native-maps'";
const podfile = `platform :ios, '15.1'
${generatedMapsLine}
  pod 'react-native-maps/Google', :path => rn_maps_path 
`;

const enabledProperties = JSON.stringify({
  'expo.sqlite.useSQLCipher': 'true',
});

function createFixtureWorkspace(): Readonly<{ appRoot: string; podfilePath: string }> {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'ios-device-lab-podfile-'));
  const appRoot = join(workspaceRoot, 'apps', 'mobile');
  const iosRoot = join(appRoot, 'ios');
  mkdirSync(iosRoot, { recursive: true });
  const podfilePath = join(iosRoot, 'Podfile');
  writeFileSync(podfilePath, podfile);
  writeFileSync(join(iosRoot, 'Podfile.properties.json'), enabledProperties);
  return { appRoot, podfilePath };
}

describe('iOS Device Lab generated Podfile preparation', () => {
  it('requires the generated SQLCipher property and normalizes the exact Maps path line once', () => {
    expect(prepareIosDeviceLabPodfile({
      podfile,
      podfileProperties: enabledProperties,
    })).toBe(podfile.replace(generatedMapsLine, normalizedMapsLine));
  });

  it.each([
    ['a missing SQLCipher property', '{}'],
    ['a false SQLCipher property', JSON.stringify({ 'expo.sqlite.useSQLCipher': 'false' })],
    ['a non-string SQLCipher property', JSON.stringify({ 'expo.sqlite.useSQLCipher': true })],
  ])('rejects %s before touching the generated Podfile', (_description, podfileProperties) => {
    expect(() => prepareIosDeviceLabPodfile({ podfile, podfileProperties }))
      .toThrow('expo_sqlite_sqlcipher_property_invalid');
  });

  it.each([
    ['a missing Maps path line', podfile.replace(`${generatedMapsLine}\n`, '')],
    ['a duplicate Maps path line', `${podfile}${generatedMapsLine}\n`],
    ['an unexpected Maps path line', podfile.replace(generatedMapsLine, "  rn_maps_path = '../other-package'")],
    ['an absolute Maps path line', podfile.replace(generatedMapsLine, "  rn_maps_path = '/Users/runner/work/anicare/anicare/node_modules/react-native-maps'")],
  ])('rejects %s', (_description, candidate) => {
    expect(() => prepareIosDeviceLabPodfile({
      podfile: candidate,
      podfileProperties: enabledProperties,
    })).toThrow('rn_maps_path_invalid');
  });

  it('prepares only regular files under an isolated app root', () => {
    const fixture = createFixtureWorkspace();

    prepareIosDeviceLabPodfileAtRoot(fixture.appRoot);

    expect(readFileSync(fixture.podfilePath, 'utf8')).toBe(podfile.replace(generatedMapsLine, normalizedMapsLine));
  });

  it('rejects a symlinked Podfile without following it when symlinks are supported', () => {
    const fixture = createFixtureWorkspace();
    const target = join(fixture.appRoot, 'outside-podfile');
    writeFileSync(target, podfile);
    try {
      unlinkSync(fixture.podfilePath);
      symlinkSync(target, fixture.podfilePath, 'file');
    } catch {
      return;
    }

    expect(() => prepareIosDeviceLabPodfileAtRoot(fixture.appRoot))
      .toThrow('ios_device_lab_podfile_file_invalid');
    expect(readFileSync(target, 'utf8')).toBe(podfile);
  });

  it('rejects CLI arguments before it can select an arbitrary target', () => {
    const script = resolve(__dirname, 'prepare-ios-device-lab-podfile.ts');
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), script, 'unexpected'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('ios_device_lab_podfile_arguments_invalid');
  });
});
