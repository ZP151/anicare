import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluatePodfileLock } from './podfile-lock-policy';

const reviewedFixture = `PODS:
  - Expo (57.0.17)
  - ExpoSQLite (57.0.2)
  - GoogleMaps (9.4.0)
  - React-Core (0.86.3)
  - react-native-maps/Google (1.27.2):
    - GoogleMaps

DEPENDENCIES:
  - "ExpoSQLite (from \`../../../node_modules/expo-sqlite/ios\`)"
  - "react-native-maps/Google (from \`../../../node_modules/react-native-maps\`)"

SPEC REPOS:
  trunk:
    - Google-Maps-iOS-Utils
    - GoogleMaps

EXTERNAL SOURCES:
  ExpoSQLite:
    :path: "../../../node_modules/expo-sqlite/ios"
  React:
    :path: "../../../node_modules/react-native/"
  hermes-engine:
    :podspec: "../../../node_modules/react-native/sdks/hermes-engine/hermes-engine.podspec"
    :tag: hermes-v250829098.0.17
  react-native-maps:
    :path: "../../../node_modules/react-native-maps"

SPEC CHECKSUMS:
  ExpoSQLite: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  Expo: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  GoogleMaps: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  React-Core: cccccccccccccccccccccccccccccccccccccccc
  react-native-maps: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee

PODFILE CHECKSUM: ffffffffffffffffffffffffffffffffffffffff

COCOAPODS: 1.17.0
`;

describe('reviewed Podfile.lock policy', () => {
  it('accepts a bounded workspace-native lock with the required Expo, React Native, and Maps pods', () => {
    expect(evaluatePodfileLock(reviewedFixture)).toEqual([]);
  });

  it('accepts the actual reviewed lock only through its fixed zero-argument CLI', () => {
    const script = resolve(__dirname, 'validate-reviewed-ios-device-lab-podfile-lock.ts');
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), script], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('podfile_lock_valid\n');
    expect(result.stderr).toBe('');
    expect(evaluatePodfileLock(readFileSync(resolve(__dirname, '../ios-device-lab/Podfile.lock'), 'utf8'))).toEqual([]);
  });

  it('keeps the generated-lock CLI fixed to the generated path and bounded when absent', () => {
    const script = resolve(__dirname, 'validate-generated-ios-device-lab-podfile-lock.ts');
    const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), script, 'untrusted.lock'], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('podfile_lock_invalid\n');
    expect(`${result.stdout}${result.stderr}`).not.toContain('untrusted.lock');
  });

  it('rejects link-like fixed lock inputs before their content is read', () => {
    for (const name of ['validate-reviewed-ios-device-lab-podfile-lock.ts', 'validate-generated-ios-device-lab-podfile-lock.ts']) {
      const source = readFileSync(resolve(__dirname, name), 'utf8');
      expect(source).toContain('lstatSync');
      expect(source).toContain('isSymbolicLink()');
      expect(source).toContain('realpathSync');
    }
  });

  it.each([
    ['a repeated root section', `${reviewedFixture}\nPODS:\n`, 'duplicate_section'],
    ['an unexpected spec repo', reviewedFixture.replace('  trunk:', '  evil:'), 'spec_repos_invalid'],
    ['an unexpected spec repo pod', reviewedFixture.replace('    - GoogleMaps\n\nEXTERNAL SOURCES:', '    - GoogleMaps\n    - EvilPod\n\nEXTERNAL SOURCES:'), 'spec_repos_invalid'],
    ['a duplicate spec repo pod', reviewedFixture.replace('    - GoogleMaps\n\nEXTERNAL SOURCES:', '    - GoogleMaps\n    - GoogleMaps\n\nEXTERNAL SOURCES:'), 'spec_repos_invalid'],
    ['a malformed spec repo field', reviewedFixture.replace('    - GoogleMaps\n\nEXTERNAL SOURCES:', '    :url: https://evil.invalid\n\nEXTERNAL SOURCES:'), 'spec_repos_invalid'],
    ['an unpinned pod revision', reviewedFixture.replace('GoogleMaps (9.4.0)', 'GoogleMaps'), 'pod_revision_unpinned'],
    ['a non-workspace absolute pod path', reviewedFixture.replace(
      '  react-native-maps:\n    :path: "../../../node_modules/react-native-maps"',
      '  react-native-maps:\n    :path: "/Users/runner/work/other/node_modules/react-native-maps"',
    ), 'local_path_outside_workspace'],
    ['an arbitrary parent traversal pod path', reviewedFixture.replace(
      '  react-native-maps:\n    :path: "../../../node_modules/react-native-maps"',
      '  react-native-maps:\n    :path: "../../../../node_modules/react-native-maps"',
    ), 'local_path_outside_workspace'],
    ['a path escaping a three-parent node_modules prefix', reviewedFixture.replace(
      '  react-native-maps:\n    :path: "../../../node_modules/react-native-maps"',
      '  react-native-maps:\n    :path: "../../../node_modules/../../outside"',
    ), 'local_path_outside_workspace'],
    ['a path escaping a one-parent node_modules prefix', reviewedFixture.replace(
      '  react-native-maps:\n    :path: "../../../node_modules/react-native-maps"',
      '  react-native-maps:\n    :path: "../node_modules/maps/../outside"',
    ), 'local_path_outside_workspace'],
    ['a Git branch source', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '    :git: "https://example.invalid/react-native-maps.git"\n    :branch: main',
    ), 'git_source_not_allowed'],
    ['a deeper-indented Git source', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '      :git: "https://example.invalid/react-native-maps.git"',
    ), 'git_source_not_allowed'],
    ['a tag-only external source', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '    :tag: v1.27.2',
    ), 'external_source_invalid'],
    ['a tag paired with a path source', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '    :path: "../../../node_modules/react-native-maps"\n    :tag: v1.27.2',
    ), 'external_source_invalid'],
    ['an unsafe source tag', reviewedFixture.replace(
      '    :tag: hermes-v250829098.0.17',
      '    :tag: hermes/v250829098.0.17',
    ), 'external_source_invalid'],
    ['a duplicate source tag', reviewedFixture.replace(
      '    :tag: hermes-v250829098.0.17',
      '    :tag: hermes-v250829098.0.17\n    :tag: hermes-v250829098.0.17',
    ), 'external_source_invalid'],
    ['an empty external source path', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '    :path: ""',
    ), 'external_source_invalid'],
    ['duplicate external source fields', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '    :path: "../../../node_modules/react-native-maps"\n    :podspec: "../../../node_modules/react-native-maps/react-native-maps.podspec"',
    ), 'external_source_invalid'],
    ['a malformed external source field', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '   :path: "../../../node_modules/react-native-maps"',
    ), 'external_source_invalid'],
    ['an internal empty source path segment', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '    :path: "../../../node_modules/react-native-maps//outside"',
    ), 'local_path_outside_workspace'],
    ['multiple trailing source path slashes', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '    :path: "../../../node_modules/react-native-maps//"',
    ), 'local_path_outside_workspace'],
    ['a dot source path tail segment', reviewedFixture.replace(
      '    :path: "../../../node_modules/react-native-maps"',
      '    :path: "../../../node_modules/react-native-maps/."',
    ), 'local_path_outside_workspace'],
    ['a missing ExpoSQLite pod', reviewedFixture.replace('  - ExpoSQLite (57.0.2)\n', ''), 'required_pod_missing'],
    ['the wrong CocoaPods version', reviewedFixture.replace('COCOAPODS: 1.17.0', 'COCOAPODS: 1.16.2'), 'cocoapods_version_invalid'],
  ] as const)('rejects %s with a bounded code', (_description, lock, code) => {
    const codes = evaluatePodfileLock(lock);

    expect(codes).toContain(code);
    expect(codes.every((value) => /^[a-z0-9_]+$/.test(value))).toBe(true);
  });
});
