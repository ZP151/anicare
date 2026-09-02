export type PodfileLockCode =
  | 'duplicate_section'
  | 'lock_section_missing'
  | 'pod_revision_unpinned'
  | 'local_path_outside_workspace'
  | 'external_source_invalid'
  | 'git_source_not_allowed'
  | 'required_pod_missing'
  | 'cocoapods_version_invalid';

const requiredSections = [
  'PODS',
  'DEPENDENCIES',
  'SPEC REPOS',
  'EXTERNAL SOURCES',
  'SPEC CHECKSUMS',
  'PODFILE CHECKSUM',
  'COCOAPODS',
] as const;

const requiredPods = [
  'Expo',
  'ExpoSQLite',
  'SQLCipher',
  'React-Core',
  'react-native-maps/Google',
  'GoogleMaps',
] as const;

const allowedLocalPath = /^(?:\.\.\/){2,}node_modules\//;
const allowedGeneratedPath = /^build\/generated\/ios\//;
const pinnedRevision = /^(?:= )?\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?$/;

export function evaluatePodfileLock(lock: string): readonly PodfileLockCode[] {
  const sections = parseSections(lock);
  const codes: PodfileLockCode[] = [];

  if (sections.duplicate) codes.push('duplicate_section');
  if (requiredSections.some((section) => !sections.byName.has(section))) {
    codes.push('lock_section_missing');
  }

  const pods = sections.byName.get('PODS') ?? [];
  if (hasUnpinnedPodRevision(pods)) codes.push('pod_revision_unpinned');
  if (requiredPods.some((pod) => !hasPod(pods, pod))) codes.push('required_pod_missing');

  const externalSources = sections.byName.get('EXTERNAL SOURCES') ?? [];
  if (hasGitSource(lock, externalSources)) {
    codes.push('git_source_not_allowed');
  } else if (hasInvalidExternalSource(externalSources)) {
    codes.push('external_source_invalid');
  } else if (hasPathOutsideWorkspace(externalSources)) {
    codes.push('local_path_outside_workspace');
  }

  const cocoapods = sections.byName.get('COCOAPODS') ?? [];
  if (cocoapods[0]?.trim() !== '1.17.0') {
    codes.push('cocoapods_version_invalid');
  }

  return codes;
}

function parseSections(lock: string): Readonly<{
  byName: ReadonlyMap<string, readonly string[]>;
  duplicate: boolean;
}> {
  const byName = new Map<string, string[]>();
  let current: string | undefined;
  let duplicate = false;

  for (const line of lock.replace(/\r\n/g, '\n').split('\n')) {
    const match = /^([A-Z][A-Z ]+):(?:\s*(.*))?$/.exec(line);
    if (match) {
      current = match[1];
      if (byName.has(current)) duplicate = true;
      else byName.set(current, match[2] === undefined ? [] : [match[2]]);
    } else if (current !== undefined) {
      byName.get(current)?.push(line);
    }
  }

  return { byName, duplicate };
}

function hasUnpinnedPodRevision(lines: readonly string[]): boolean {
  return lines.some((line) => {
    const entry = /^  - ([^ (]+)(?: \(([^)]+)\))?(?::)?$/.exec(line);
    return entry !== null && (entry[2] === undefined || !pinnedRevision.test(entry[2]));
  });
}

function hasPod(lines: readonly string[], expectedPod: string): boolean {
  return lines.some((line) => new RegExp(`^\\s*- ${escapeRegExp(expectedPod)} \\(`).test(line));
}

function hasGitSource(lock: string, externalSources: readonly string[]): boolean {
  return /^CHECKOUT OPTIONS:$/m.test(lock) || externalSources.some((line) => /^    :(?:git|branch):/.test(line));
}

function hasInvalidExternalSource(lines: readonly string[]): boolean {
  return lines.some((line) => /^    :(?!path:|podspec:|tag:)/.test(line));
}

function hasPathOutsideWorkspace(lines: readonly string[]): boolean {
  return lines.some((line) => {
    const match = /^    :(?:path|podspec): "?([^"\n]+)"?$/.exec(line);
    if (!match) return false;
    const value = match[1];
    return !allowedLocalPath.test(value) && !allowedGeneratedPath.test(value);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
