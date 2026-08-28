import {
  evaluateNativeConfigEvidence,
  normalizeNativeConfigEvidence,
  type NativeConfigEvidence,
} from './native-config-policy';

const safeEvidence: NativeConfigEvidence = {
  scheme: 'animalhelper',
  iosBundleIdentifier: 'sg.animalhelper.app',
  androidPackage: 'sg.animalhelper.app',
  androidPermissions: [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.READ_MEDIA_IMAGES',
  ],
  iosUsageDescriptionKeys: [
    'NSLocationWhenInUseUsageDescription',
    'NSPhotoLibraryUsageDescription',
  ],
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

const unsafeEvidence: NativeConfigEvidence = {
  ...safeEvidence,
  androidPermissions: [
    ...safeEvidence.androidPermissions,
    'android.permission.RECORD_AUDIO',
  ],
  iosUsageDescriptionKeys: [
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
    ...safeEvidence.iosUsageDescriptionKeys,
  ],
};

describe('native config policy', () => {
  it('reports forbidden capture and always-location evidence', () => {
    expect(evaluateNativeConfigEvidence(unsafeEvidence)).toEqual(
      expect.arrayContaining([
        'android_microphone_forbidden',
        'ios_camera_usage_forbidden',
        'ios_microphone_usage_forbidden',
        'ios_always_location_usage_forbidden',
      ]),
    );
  });

  it('accepts evidence containing only required identifiers and permissions', () => {
    expect(evaluateNativeConfigEvidence(safeEvidence)).toEqual([]);
  });

  it('requires Android gallery and foreground-location permissions', () => {
    expect(
      evaluateNativeConfigEvidence({
        ...safeEvidence,
        androidPermissions: ['android.permission.INTERNET'],
      }),
    ).toEqual(
      expect.arrayContaining([
        'photo_library_permission_missing',
        'location_when_in_use_missing',
      ]),
    );
  });

  it('normalizes only inspected native configuration fields', () => {
    expect(
      normalizeNativeConfigEvidence(
        {
          scheme: 'animalhelper',
          ios: { bundleIdentifier: 'sg.animalhelper.app' },
          android: { package: 'sg.animalhelper.app' },
          plugins: safeEvidence.plugins,
          unrelated: 'do-not-copy',
        },
        {
          android: { permissions: safeEvidence.androidPermissions },
          _internal: {
            modResults: {
              ios: {
                infoPlist: {
                  NSLocationWhenInUseUsageDescription: 'required',
                  NSPhotoLibraryUsageDescription: 'required',
                  CFBundleDisplayName: 'do-not-copy',
                },
              },
            },
          },
        },
      ),
    ).toEqual(safeEvidence);
  });

  it('rejects malformed Expo config JSON without exposing it', () => {
    expect(() => normalizeNativeConfigEvidence(null, {})).toThrow(
      'native_config_json_invalid',
    );
  });
});
