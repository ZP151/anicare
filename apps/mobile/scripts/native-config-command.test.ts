jest.mock('node:child_process', () => ({
  spawnSync: jest.fn(),
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
