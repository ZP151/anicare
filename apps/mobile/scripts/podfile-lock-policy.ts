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
  'React-Core',
  'react-native-maps/Google',
  'GoogleMaps',
] as const;

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

  const externalSources = evaluateExternalSources(lock, sections.byName.get('EXTERNAL SOURCES') ?? []);
  if (externalSources.gitSource) codes.push('git_source_not_allowed');
  if (externalSources.invalid) codes.push('external_source_invalid');
  if (externalSources.pathOutsideWorkspace) codes.push('local_path_outside_workspace');

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

function evaluateExternalSources(lock: string, lines: readonly string[]): Readonly<{
  gitSource: boolean;
  invalid: boolean;
  pathOutsideWorkspace: boolean;
}> {
  const entries = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  let invalid = false;
  const gitSource = /^CHECKOUT OPTIONS:$/m.test(lock) || lines.some((line) => /^\s+:(?:git|branch|tag):/.test(line));

  for (const line of lines) {
    if (line.length === 0) continue;
    const entry = /^  ([A-Za-z0-9][A-Za-z0-9_.+/-]*):$/.exec(line);
    if (entry) {
      if (entries.has(entry[1])) invalid = true;
      current = new Map<string, string>();
      entries.set(entry[1], current);
      continue;
    }

    const field = /^    :(path|podspec):(?: (.*))?$/.exec(line);
    if (!field || current === undefined || current.has(field[1])) {
      invalid = true;
      continue;
    }
    current.set(field[1], field[2] ?? '');
  }

  let pathOutsideWorkspace = false;
  for (const fields of entries.values()) {
    if (fields.size !== 1) {
      invalid = true;
      continue;
    }
    const [value] = fields.values();
    if (value === undefined) {
      invalid = true;
      continue;
    }
    const path = parseLocalSourcePath(value);
    if (path === null) {
      invalid = true;
    } else if (!isAllowedLocalPath(path)) {
      pathOutsideWorkspace = true;
    }
  }

  return { gitSource, invalid, pathOutsideWorkspace };
}

function parseLocalSourcePath(value: string): string | null {
  if (value.length === 0) return null;
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 3) return null;
    value = value.slice(1, -1);
  }
  return value.length === 0 || /[\\\u0000-\u001F\u007F]/.test(value) ? null : value;
}

function isAllowedLocalPath(value: string): boolean {
  const prefix = [
    '../node_modules/',
    '../../../node_modules/',
    'build/generated/ios/',
  ].find((candidate) => value.startsWith(candidate));
  if (prefix === undefined) return false;
  const tail = value.slice(prefix.length);
  return tail.length > 0 && tail.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
