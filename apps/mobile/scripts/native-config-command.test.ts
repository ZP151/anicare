jest.mock('node:child_process', () => ({
  spawnSync: jest.fn(),
}));

import {
  runExpoConfig,
  validateNativeConfigWithRunner,
  type ExpoConfigKind,
  type ExpoConfigRunner,
} from './native-config-command';
import { spawnSync } from 'node:child_process';

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
