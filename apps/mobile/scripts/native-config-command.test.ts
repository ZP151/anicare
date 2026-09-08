jest.mock('node:child_process', () => ({
  spawnSync: jest.fn(),
}));

import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  runExpoConfig,
  validateNativeConfigWithRunner,
  type ExpoConfigKind,
  type ExpoConfigRunner,
} from './native-config-command';
import { spawnSync } from 'node:child_process';

function readAppConfig(): Readonly<Record<string, unknown>> {
  return JSON.parse(
    readFileSync(resolve(__dirname, '..', 'app.json'), 'utf8'),
  ) as Readonly<Record<string, unknown>>;
}

const mobileRoot = resolve(__dirname, '..');
const appConfigPath = resolve(mobileRoot, 'app.json');
const pilotBuildValidatorSourcePath = resolve(
  mobileRoot,
  'scripts',
  'validate-pilot-build.ts',
);
const pilotBuildPolicySourcePath = resolve(
  mobileRoot,
  'src',
  'config',
  'pilot-build-policy.ts',
);
const actualSpawnSync = jest.requireActual<typeof import('node:child_process')>(
  'node:child_process',
).spawnSync;

function runPilotBuildValidator(appConfig: unknown) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'animalhelper-pilot-build-'));
  const fixtureValidatorPath = resolve(
    fixtureRoot,
    'scripts',
    'validate-pilot-build.ts',
  );
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const argumentsList =
    process.platform === 'win32'
      ? [
          '/d',
          '/s',
          '/c',
          'pnpm.cmd',
          'exec',
          'tsx',
          fixtureValidatorPath,
        ]
      : ['exec', 'tsx', fixtureValidatorPath];

  try {
    mkdirSync(resolve(fixtureRoot, 'scripts'), { recursive: true });
    mkdirSync(resolve(fixtureRoot, 'src', 'config'), { recursive: true });
    copyFileSync(pilotBuildValidatorSourcePath, fixtureValidatorPath);
    copyFileSync(
      pilotBuildPolicySourcePath,
      resolve(fixtureRoot, 'src', 'config', 'pilot-build-policy.ts'),
    );
    writeFileSync(
      resolve(fixtureRoot, 'app.json'),
      `${JSON.stringify(appConfig, null, 2)}\n`,
      'utf8',
    );
    for (const fileName of ['eas.json', 'package.json']) {
      writeFileSync(
        resolve(fixtureRoot, fileName),
        readFileSync(resolve(mobileRoot, fileName), 'utf8'),
        'utf8',
      );
    }

    return actualSpawnSync(command, argumentsList, {
      cwd: mobileRoot,
      encoding: 'utf8',
    });
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

const validPublicConfig = {
  scheme: 'animalhelper',
  ios: { bundleIdentifier: 'sg.animalhelper.app' },
  android: { package: 'sg.animalhelper.app' },
  plugins: [
    [
      'expo-image-picker',
      { cameraPermission: 'Take a cat photo for private review and redaction. Source media is never uploaded.', microphonePermission: false },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
      },
    ],
    ['expo-sqlite', { useSQLCipher: true }],
  ],
};

const validIntrospectedConfig = {
  android: {
    permissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.CAMERA',
    ],
  },
  _internal: {
    modResults: {
      ios: {
        infoPlist: {
          NSLocationWhenInUseUsageDescription: 'required',
          NSPhotoLibraryUsageDescription: 'required',
          NSCameraUsageDescription: 'required',
        },
      },
    },
  },
};

describe('native config command adapter', () => {
  it('runs the pilot validator successfully for the exact approved Expo identity', () => {
    const result = runPilotBuildValidator(readAppConfig());

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('pilot_build_policy_ok\n');
    expect(result.stderr).toBe('');
  });

  it.each([
    ['a missing owner', (expo: Record<string, unknown>) => delete expo.owner],
    ['a missing slug', (expo: Record<string, unknown>) => delete expo.slug],
    [
      'a missing project ID',
      (expo: Record<string, unknown>) =>
        delete (expo.extra as Record<string, Record<string, unknown>>).eas.projectId,
    ],
    ['a mismatched owner', (expo: Record<string, unknown>) => { expo.owner = 'other-team'; }],
    ['a mismatched slug', (expo: Record<string, unknown>) => { expo.slug = 'other-app'; }],
    [
      'a mismatched project ID',
      (expo: Record<string, unknown>) => {
        (expo.extra as Record<string, Record<string, unknown>>).eas.projectId =
          '00000000-0000-0000-0000-000000000000';
      },
    ],
  ] as const)(
    'fails closed when the Expo identity has %s',
    (_description, mutateExpoConfig) => {
      const appConfig = readAppConfig() as {
        expo: Record<string, unknown>;
      };
      mutateExpoConfig(appConfig.expo);

      const result = runPilotBuildValidator(appConfig);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('eas_forbidden_configuration\n');
    },
  );

  it('keeps the Expo project identity on the exact approved EAS link', () => {
    expect(readAppConfig()).toEqual(
      expect.objectContaining({
        expo: expect.objectContaining({
          owner: 'zhoupingdevs-team',
          slug: 'anicare',
          extra: {
            eas: {
              projectId: 'f9b84744-77c7-4b2b-8631-f107a8b98af8',
            },
          },
        }),
      }),
    );
  });

  it('rejects an invalid config kind before spawning a command', () => {
    expect(() => runExpoConfig('invalid' as ExpoConfigKind)).toThrow(
      'native_config_command_failed',
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns policy codes from the public and introspected command results', () => {
    const run: ExpoConfigRunner = (kind) =>
      kind === 'public' ? validPublicConfig : validIntrospectedConfig;

    expect(validateNativeConfigWithRunner(run)).toEqual([]);
  });

  it('returns a bounded command failure when the runner throws', () => {
    const run: ExpoConfigRunner = () => {
      throw new Error('token=secret');
    };

    expect(validateNativeConfigWithRunner(run)).toEqual([
      'native_config_command_failed',
    ]);
  });

  it('returns a bounded JSON failure for malformed command results', () => {
    const run: ExpoConfigRunner = (kind) =>
      kind === 'public' ? null : validIntrospectedConfig;

    expect(validateNativeConfigWithRunner(run)).toEqual([
      'native_config_json_invalid',
    ]);
  });
});
