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
    - GoogleMaps

EXTERNAL SOURCES:
  ExpoSQLite:
    :path: "../../../node_modules/expo-sqlite/ios"
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

  it.each([
    ['a repeated root section', `${reviewedFixture}\nPODS:\n`, 'duplicate_section'],
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
    ), 'git_source_not_allowed'],
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
    ['a missing ExpoSQLite pod', reviewedFixture.replace('  - ExpoSQLite (57.0.2)\n', ''), 'required_pod_missing'],
    ['the wrong CocoaPods version', reviewedFixture.replace('COCOAPODS: 1.17.0', 'COCOAPODS: 1.16.2'), 'cocoapods_version_invalid'],
  ] as const)('rejects %s with a bounded code', (_description, lock, code) => {
    const codes = evaluatePodfileLock(lock);

    expect(codes).toContain(code);
    expect(codes.every((value) => /^[a-z0-9_]+$/.test(value))).toBe(true);
  });
});
