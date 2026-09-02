export type IosArtifactCode =
  | 'payload_layout_invalid'
  | 'app_bundle_count_invalid'
  | 'app_bundle_path_invalid'
  | 'provisioning_profile_present'
  | 'signature_directory_present'
  | 'macho_file_missing'
  | 'macho_path_invalid'
  | 'macho_signature_present'
  | 'macho_arm64_missing'
  | 'macho_platform_invalid'
  | 'bundle_identifier_invalid';

type IosArtifactInventory = Readonly<{
  topLevelEntries: readonly string[];
  appPaths: readonly string[];
  provisioningProfiles: readonly string[];
  signatureDirectories: readonly string[];
  machoFiles: readonly Readonly<{
    relativePath: string;
    architectures: readonly string[];
    platform: string;
    signatureState: 'absent' | 'adhoc' | 'valid';
  }>[];
  bundleIdentifier: string;
}>;

const expectedBundleIdentifier = 'sg.animalhelper.app';
const payloadPrefix = 'Payload/';

export function evaluateIosArtifactInventory(input: IosArtifactInventory): readonly IosArtifactCode[] {
  const codes: IosArtifactCode[] = [];
  const hasSinglePayloadDirectory = input.topLevelEntries.length === 1 && input.topLevelEntries[0] === 'Payload';
  if (!hasSinglePayloadDirectory) {
    codes.push('payload_layout_invalid');
  }

  if (input.appPaths.length !== 1) {
    codes.push('app_bundle_count_invalid');
  }
  if (input.appPaths.some((path) => !isTopLevelAppBundle(path))) {
    codes.push('app_bundle_path_invalid');
  }

  if (input.provisioningProfiles.length > 0) {
    codes.push('provisioning_profile_present');
  }
  if (input.signatureDirectories.length > 0) {
    codes.push('signature_directory_present');
  }

  if (input.machoFiles.length === 0) {
    codes.push('macho_file_missing');
  }
  for (const machoFile of input.machoFiles) {
    if (!isPayloadRelativePath(machoFile.relativePath)) {
      addCode(codes, 'macho_path_invalid');
    }
    if (machoFile.signatureState !== 'absent') {
      addCode(codes, 'macho_signature_present');
    }
    if (!machoFile.architectures.includes('arm64')) {
      addCode(codes, 'macho_arm64_missing');
    }
    if (machoFile.platform !== 'iOS') {
      addCode(codes, 'macho_platform_invalid');
    }
  }

  if (input.bundleIdentifier !== expectedBundleIdentifier) {
    codes.push('bundle_identifier_invalid');
  }
  return codes;
}

function isTopLevelAppBundle(path: string): boolean {
  return /^Payload\/[^/]+\.app$/.test(path);
}

function isPayloadRelativePath(path: string): boolean {
  return path.startsWith(payloadPrefix) && !path.includes('..') && !path.includes('\\') && !path.startsWith('/');
}

function addCode(codes: IosArtifactCode[], code: IosArtifactCode): void {
  if (!codes.includes(code)) {
    codes.push(code);
  }
}
