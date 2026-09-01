export type NativeConfigEvidence = Readonly<{
  scheme: string | null;
  iosBundleIdentifier: string | null;
  androidPackage: string | null;
  androidPermissions: readonly string[];
  iosUsageDescriptionKeys: readonly string[];
  plugins: readonly unknown[];
}>;

export type NativeConfigPolicyCode =
  | 'scheme_mismatch'
  | 'ios_bundle_identifier_mismatch'
  | 'android_package_mismatch'
  | 'android_camera_permission_missing'
  | 'android_microphone_forbidden'
  | 'ios_camera_usage_missing'
  | 'ios_microphone_usage_forbidden'
  | 'ios_always_location_usage_forbidden'
  | 'photo_library_permission_missing'
  | 'location_when_in_use_missing'
  | 'sqlcipher_plugin_missing';

const expectedImagePicker = {
  cameraPermission: 'Take a cat photo for private review and redaction. Source media is never uploaded.',
  microphonePermission: false,
};
const expectedLocation = {
  locationAlwaysAndWhenInUsePermission: false,
  locationAlwaysPermission: false,
};
const expectedSqlite = {
  useSQLCipher: true,
};
const androidGalleryPermissions = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_EXTERNAL_STORAGE',
];
const androidForegroundLocationPermissions = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(
  value: unknown,
  key: string,
): string | null {
  const property = isRecord(value) ? value[key] : undefined;
  if (property === undefined) {
    return null;
  }
  if (typeof property !== 'string') {
    throw new Error('native_config_json_invalid');
  }
  return property;
}

function optionalRecord(value: unknown, key: string): Readonly<Record<string, unknown>> | null {
  const property = isRecord(value) ? value[key] : undefined;
  if (property === undefined) {
    return null;
  }
  if (!isRecord(property)) {
    throw new Error('native_config_json_invalid');
  }
  return property;
}

function optionalStringArray(value: unknown, key: string): readonly string[] {
  const property = isRecord(value) ? value[key] : undefined;
  if (property === undefined) {
    return [];
  }
  if (!Array.isArray(property) || !property.every((item) => typeof item === 'string')) {
    throw new Error('native_config_json_invalid');
  }
  return property;
}

function optionalUnknownArray(value: unknown, key: string): readonly unknown[] {
  const property = isRecord(value) ? value[key] : undefined;
  if (property === undefined) {
    return [];
  }
  if (!Array.isArray(property)) {
    throw new Error('native_config_json_invalid');
  }
  return property;
}

function hasInfoPlistKey(
  evidence: NativeConfigEvidence,
  key: string,
): boolean {
  return evidence.iosUsageDescriptionKeys.includes(key);
}

function hasAndroidPermission(
  evidence: NativeConfigEvidence,
  permissions: readonly string[],
): boolean {
  return permissions.some((permission) =>
    evidence.androidPermissions.includes(permission),
  );
}

function hasPluginOptions(
  plugins: readonly unknown[],
  name: string,
  expected: Readonly<Record<string, unknown>>,
): boolean {
  return plugins.some((plugin) => {
    if (!Array.isArray(plugin) || plugin.length !== 2 || plugin[0] !== name) {
      return false;
    }
    const options = plugin[1];
    return (
      isRecord(options) &&
      Object.entries(expected).every(([key, value]) => options[key] === value)
    );
  });
}

export function normalizeNativeConfigEvidence(
  publicConfig: unknown,
  introspectedConfig: unknown,
): NativeConfigEvidence {
  if (!isRecord(publicConfig) || !isRecord(introspectedConfig)) {
    throw new Error('native_config_json_invalid');
  }

  const ios = optionalRecord(publicConfig, 'ios');
  const android = optionalRecord(publicConfig, 'android');
  const introspectedAndroid = optionalRecord(introspectedConfig, 'android');
  const internal = optionalRecord(introspectedConfig, '_internal');
  const modResults = internal === null ? null : optionalRecord(internal, 'modResults');
  const introspectedIos =
    modResults === null ? null : optionalRecord(modResults, 'ios');
  const infoPlist =
    introspectedIos === null ? null : optionalRecord(introspectedIos, 'infoPlist');

  return {
    scheme: optionalString(publicConfig, 'scheme'),
    iosBundleIdentifier: ios === null ? null : optionalString(ios, 'bundleIdentifier'),
    androidPackage:
      android === null ? null : optionalString(android, 'package'),
    androidPermissions:
      introspectedAndroid === null
        ? []
        : optionalStringArray(introspectedAndroid, 'permissions'),
    iosUsageDescriptionKeys:
      infoPlist === null
        ? []
        : Object.keys(infoPlist).filter((key) =>
            ['NSCamera', 'NSMicrophone', 'NSPhotoLibrary', 'NSLocation'].some(
              (prefix) => key.startsWith(prefix),
            ),
          ),
    plugins: optionalUnknownArray(publicConfig, 'plugins'),
  };
}

export function evaluateNativeConfigEvidence(
  evidence: NativeConfigEvidence,
): readonly NativeConfigPolicyCode[] {
  const codes: NativeConfigPolicyCode[] = [];

  if (evidence.scheme !== 'animalhelper') {
    codes.push('scheme_mismatch');
  }
  if (evidence.iosBundleIdentifier !== 'sg.animalhelper.app') {
    codes.push('ios_bundle_identifier_mismatch');
  }
  if (evidence.androidPackage !== 'sg.animalhelper.app') {
    codes.push('android_package_mismatch');
  }
  if (
    !evidence.androidPermissions.includes('android.permission.CAMERA') ||
    !hasPluginOptions(evidence.plugins, 'expo-image-picker', expectedImagePicker)
  ) {
    codes.push('android_camera_permission_missing');
  }
  if (
    evidence.androidPermissions.includes('android.permission.RECORD_AUDIO') ||
    !hasPluginOptions(evidence.plugins, 'expo-image-picker', expectedImagePicker)
  ) {
    codes.push('android_microphone_forbidden');
  }
  if (!hasInfoPlistKey(evidence, 'NSCameraUsageDescription')) {
    codes.push('ios_camera_usage_missing');
  }
  if (hasInfoPlistKey(evidence, 'NSMicrophoneUsageDescription')) {
    codes.push('ios_microphone_usage_forbidden');
  }
  if (
    hasInfoPlistKey(evidence, 'NSLocationAlwaysUsageDescription') ||
    hasInfoPlistKey(evidence, 'NSLocationAlwaysAndWhenInUseUsageDescription') ||
    !hasPluginOptions(evidence.plugins, 'expo-location', expectedLocation)
  ) {
    codes.push('ios_always_location_usage_forbidden');
  }
  if (
    !hasInfoPlistKey(evidence, 'NSPhotoLibraryUsageDescription') ||
    !hasAndroidPermission(evidence, androidGalleryPermissions)
  ) {
    codes.push('photo_library_permission_missing');
  }
  if (
    !hasInfoPlistKey(evidence, 'NSLocationWhenInUseUsageDescription') ||
    !hasAndroidPermission(evidence, androidForegroundLocationPermissions)
  ) {
    codes.push('location_when_in_use_missing');
  }
  if (!hasPluginOptions(evidence.plugins, 'expo-sqlite', expectedSqlite)) {
    codes.push('sqlcipher_plugin_missing');
  }

  return codes;
}
