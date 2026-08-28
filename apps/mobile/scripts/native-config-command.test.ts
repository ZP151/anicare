import {
  validateNativeConfigWithRunner,
  type ExpoConfigRunner,
} from './native-config-command';

const validPublicConfig = {
  scheme: 'animalhelper',
  ios: { bundleIdentifier: 'sg.animalhelper.app' },
  android: { package: 'sg.animalhelper.app' },
  plugins: [
    [
      'expo-image-picker',
      { cameraPermission: false, microphonePermission: false },
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
    permissions: ['android.permission.ACCESS_FINE_LOCATION'],
  },
  _internal: {
    modResults: {
      ios: {
        infoPlist: {
          NSLocationWhenInUseUsageDescription: 'required',
          NSPhotoLibraryUsageDescription: 'required',
        },
      },
    },
  },
};

describe('native config command adapter', () => {
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
