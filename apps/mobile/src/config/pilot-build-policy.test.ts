import {
  evaluatePilotBuildContract,
  type PilotBuildPolicyCode,
} from './pilot-build-policy';

const approvedPilotProfile = {
  distribution: 'internal',
  android: { buildType: 'apk' },
  ios: { simulator: false },
} as const;

const approvedEasConfig = {
  cli: { version: '22.6.0', requireCommit: true },
  build: { pilot: approvedPilotProfile },
} as const;

const approvedScripts = {
  'validate:pilot-build': 'tsx scripts/validate-pilot-build.ts',
  'build:pilot:android':
    'pnpm dlx eas-cli@22.6.0 build --profile pilot --platform android',
  'build:pilot:ios':
    'pnpm dlx eas-cli@22.6.0 build --profile pilot --platform ios',
} as const;

describe('pilot build policy', () => {
  it('accepts the approved internal profile and exact package scripts', () => {
    expect(evaluatePilotBuildContract(approvedEasConfig, approvedScripts)).toEqual([]);
  });

  it('reports each missing or mismatched contract requirement with bounded codes', () => {
    const cases: ReadonlyArray<{
      easConfig: unknown;
      scripts: unknown;
      code: PilotBuildPolicyCode;
    }> = [
      {
        easConfig: { ...approvedEasConfig, cli: { version: 'latest', requireCommit: true } },
        scripts: approvedScripts,
        code: 'eas_cli_version_mismatch',
      },
      {
        easConfig: { ...approvedEasConfig, cli: { version: '22.6.0', requireCommit: false } },
        scripts: approvedScripts,
        code: 'eas_require_commit_missing',
      },
      {
        easConfig: {
          ...approvedEasConfig,
          build: { pilot: { ...approvedPilotProfile, distribution: 'store' } },
        },
        scripts: approvedScripts,
        code: 'eas_internal_distribution_missing',
      },
      {
        easConfig: {
          ...approvedEasConfig,
          build: {
            pilot: { ...approvedPilotProfile, android: { buildType: 'app-bundle' } },
          },
        },
        scripts: approvedScripts,
        code: 'eas_android_apk_missing',
      },
      {
        easConfig: {
          ...approvedEasConfig,
          build: { pilot: { ...approvedPilotProfile, ios: { simulator: true } } },
        },
        scripts: approvedScripts,
        code: 'eas_ios_device_build_missing',
      },
      {
        easConfig: approvedEasConfig,
        scripts: {
          ...approvedScripts,
          'build:pilot:android': 'eas build --profile pilot --platform android',
        },
        code: 'pilot_android_command_mismatch',
      },
      {
        easConfig: approvedEasConfig,
        scripts: {
          ...approvedScripts,
          'build:pilot:ios': 'eas build --profile pilot --platform ios',
        },
        code: 'pilot_ios_command_mismatch',
      },
    ];

    for (const testCase of cases) {
      expect(evaluatePilotBuildContract(testCase.easConfig, testCase.scripts)).toContain(
        testCase.code,
      );
    }
  });

  it.each(['env', 'channel', 'submit', 'projectId', 'credentials', 'secrets'] as const)(
    'rejects forbidden key %s recursively in the pilot profile without returning its value',
    (forbiddenKey) => {
      const offendingValue = `do-not-return-${forbiddenKey}`;
      const easConfig = {
        ...approvedEasConfig,
        build: {
          pilot: {
            ...approvedPilotProfile,
            android: {
              ...approvedPilotProfile.android,
              nested: { deeper: { [forbiddenKey]: offendingValue } },
            },
          },
        },
      };

      const codes = evaluatePilotBuildContract(easConfig, approvedScripts);

      expect(codes).toEqual(['eas_forbidden_configuration']);
      expect(JSON.stringify(codes)).not.toContain(offendingValue);
    },
  );

  it('rejects a singular credentialSource key anywhere in the EAS config', () => {
    const codes = evaluatePilotBuildContract(
      {
        ...approvedEasConfig,
        credentialSource: 'local',
      },
      approvedScripts,
    );

    expect(codes).toEqual(['eas_forbidden_configuration']);
  });

  it.each([
    ['an extra top-level key', { metadata: 'unexpected' }],
    ['an extra CLI key', { cli: { version: '22.6.0', requireCommit: true, extra: true } }],
    [
      'an extra build profile',
      {
        build: {
          pilot: approvedPilotProfile,
          production: approvedPilotProfile,
        },
      },
    ],
  ] as const)('rejects %s from the exact EAS configuration shape', (_description, extra) => {
    const codes = evaluatePilotBuildContract(
      { ...approvedEasConfig, ...extra },
      approvedScripts,
    );

    expect(codes).toEqual(['eas_forbidden_configuration']);
  });

  it.each([
    [
      'a changed validator script',
      { ...approvedScripts, 'validate:pilot-build': 'echo changed' },
    ],
    ['a missing validator script', (() => {
      const { ['validate:pilot-build']: _removed, ...scripts } = approvedScripts;
      return scripts;
    })()],
  ] as const)('rejects %s from the exact package scripts', (_description, scriptChange) => {
    const codes = evaluatePilotBuildContract(approvedEasConfig, scriptChange);

    expect(codes).toEqual(['eas_forbidden_configuration']);
  });

  it('bounds malformed inputs to policy codes and never includes input values', () => {
    const codes = evaluatePilotBuildContract(
      { build: { pilot: { env: { TOKEN: 'do-not-return-this' } } } },
      { 'build:pilot:android': 'token=do-not-return-this' },
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        'eas_cli_version_mismatch',
        'eas_require_commit_missing',
        'eas_internal_distribution_missing',
        'eas_android_apk_missing',
        'eas_ios_device_build_missing',
        'eas_forbidden_configuration',
        'pilot_android_command_mismatch',
        'pilot_ios_command_mismatch',
      ]),
    );
    expect(codes.every((code) => /^[a-z0-9_]+$/.test(code))).toBe(true);
    expect(JSON.stringify(codes)).not.toContain('do-not-return-this');
  });
});
