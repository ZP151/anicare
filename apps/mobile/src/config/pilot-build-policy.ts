export type PilotBuildPolicyCode =
  | 'eas_cli_version_mismatch'
  | 'eas_require_commit_missing'
  | 'eas_internal_distribution_missing'
  | 'eas_android_apk_missing'
  | 'eas_ios_device_build_missing'
  | 'eas_forbidden_configuration'
  | 'pilot_android_command_mismatch'
  | 'pilot_ios_command_mismatch';

const expectedAndroidCommand =
  'pnpm dlx eas-cli@22.6.0 build --profile pilot --platform android';
const expectedIosCommand =
  'pnpm dlx eas-cli@22.6.0 build --profile pilot --platform ios';
const forbiddenKeys = new Set([
  'env',
  'channel',
  'submit',
  'projectid',
  'credentials',
  'credentialsource',
  'credentialssource',
  'secret',
  'secrets',
]);
const allowedPilotKeys = new Set(['distribution', 'android', 'ios']);
const allowedAndroidKeys = new Set(['buildType']);
const allowedIosKeys = new Set(['simulator']);
const allowedConfigKeys = new Set(['cli', 'build']);
const allowedCliKeys = new Set(['version', 'requireCommit']);
const allowedBuildKeys = new Set(['pilot']);
const expectedValidateCommand = 'tsx scripts/validate-pilot-build.ts';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenKey);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([key, nestedValue]) =>
      forbiddenKeys.has(key.toLowerCase()) || hasForbiddenKey(nestedValue),
  );
}

function hasUnexpectedKeys(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): boolean {
  return isRecord(value) && Object.keys(value).some((key) => !allowedKeys.has(key));
}

function getRecord(value: unknown, key: string): Readonly<Record<string, unknown>> | null {
  if (!isRecord(value)) {
    return null;
  }
  const nestedValue = value[key];
  return isRecord(nestedValue) ? nestedValue : null;
}

export function evaluatePilotBuildContract(
  easConfig: unknown,
  scripts: unknown,
): readonly PilotBuildPolicyCode[] {
  const codes: PilotBuildPolicyCode[] = [];
  const config = isRecord(easConfig) ? easConfig : null;
  const cli = getRecord(config, 'cli');
  const build = getRecord(config, 'build');
  const pilot = getRecord(build, 'pilot');
  const android = getRecord(pilot, 'android');
  const ios = getRecord(pilot, 'ios');
  const packageScripts = isRecord(scripts) ? scripts : null;

  if (cli?.version !== '22.6.0') {
    codes.push('eas_cli_version_mismatch');
  }
  if (cli?.requireCommit !== true) {
    codes.push('eas_require_commit_missing');
  }
  if (pilot?.distribution !== 'internal') {
    codes.push('eas_internal_distribution_missing');
  }
  if (android?.buildType !== 'apk') {
    codes.push('eas_android_apk_missing');
  }
  if (ios?.simulator !== false) {
    codes.push('eas_ios_device_build_missing');
  }

  const hasForbiddenConfiguration =
    hasForbiddenKey(easConfig) ||
    hasUnexpectedKeys(config, allowedConfigKeys) ||
    hasUnexpectedKeys(cli, allowedCliKeys) ||
    hasUnexpectedKeys(build, allowedBuildKeys) ||
    hasUnexpectedKeys(pilot, allowedPilotKeys) ||
    hasUnexpectedKeys(android, allowedAndroidKeys) ||
    hasUnexpectedKeys(ios, allowedIosKeys);

  if (
    hasForbiddenConfiguration ||
    packageScripts?.['validate:pilot-build'] !== expectedValidateCommand
  ) {
    codes.push('eas_forbidden_configuration');
  }

  if (packageScripts?.['build:pilot:android'] !== expectedAndroidCommand) {
    codes.push('pilot_android_command_mismatch');
  }
  if (packageScripts?.['build:pilot:ios'] !== expectedIosCommand) {
    codes.push('pilot_ios_command_mismatch');
  }

  return codes;
}
