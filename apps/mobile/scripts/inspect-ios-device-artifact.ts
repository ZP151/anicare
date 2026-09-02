import { readFileSync } from 'node:fs';

import { evaluateIosArtifactInventory, type IosArtifactCode } from './ios-device-artifact-policy';

type Inventory = Readonly<{
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

const inventoryKeys = new Set([
  'topLevelEntries',
  'appPaths',
  'provisioningProfiles',
  'signatureDirectories',
  'machoFiles',
  'bundleIdentifier',
]);
const machoKeys = new Set(['relativePath', 'architectures', 'platform', 'signatureState']);
const safePathSegment = /^[A-Za-z0-9._ +()@-]+$/;
const bundleIdentifierPattern = /^[A-Za-z0-9.-]+$/;

function parseInventory(value: unknown): Inventory | null {
  if (!isRecord(value) || !hasExactKeys(value, inventoryKeys)) return null;
  if (
    !isTopLevelEntries(value.topLevelEntries) ||
    !isPayloadPathArray(value.appPaths) ||
    !isPayloadPathArray(value.provisioningProfiles) ||
    !isPayloadPathArray(value.signatureDirectories) ||
    !isMachoFiles(value.machoFiles) ||
    typeof value.bundleIdentifier !== 'string' ||
    !bundleIdentifierPattern.test(value.bundleIdentifier)
  ) {
    return null;
  }
  return value as Inventory;
}

function isTopLevelEntries(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) =>
    typeof entry === 'string' && safePathSegment.test(entry) && entry !== '.' && entry !== '..',
  );
}

function isPayloadPathArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && isPayloadRelativePath(entry));
}

function isMachoFiles(value: unknown): value is Inventory['machoFiles'] {
  return Array.isArray(value) && value.every((entry) =>
    isRecord(entry) &&
    hasExactKeys(entry, machoKeys) &&
    typeof entry.relativePath === 'string' &&
    isPayloadRelativePath(entry.relativePath) &&
    Array.isArray(entry.architectures) &&
    entry.architectures.every((architecture) => typeof architecture === 'string' && /^[A-Za-z0-9_]+$/.test(architecture)) &&
    typeof entry.platform === 'string' &&
    (entry.signatureState === 'absent' || entry.signatureState === 'adhoc' || entry.signatureState === 'valid'),
  );
}

function isPayloadRelativePath(value: string): boolean {
  return value.startsWith('Payload/') &&
    value.length > 'Payload/'.length &&
    value.split('/').every((part) => safePathSegment.test(part) && part !== '.' && part !== '..');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: ReadonlySet<string>): boolean {
  const presentKeys = Object.keys(value);
  return presentKeys.length === keys.size && presentKeys.every((key) => keys.has(key));
}

function reportCodes(codes: readonly IosArtifactCode[] | readonly ['inventory_shape_invalid']): void {
  process.stderr.write(`${codes.join('\n')}\n`);
  process.exitCode = 1;
}

const inputPath = process.argv[2];
if (process.argv.length !== 3 || inputPath === undefined) {
  reportCodes(['inventory_shape_invalid']);
} else {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch {
    reportCodes(['inventory_shape_invalid']);
    parsed = undefined;
  }

  const inventory = parseInventory(parsed);
  if (inventory === null) {
    reportCodes(['inventory_shape_invalid']);
  } else {
    const codes = evaluateIosArtifactInventory(inventory);
    if (codes.length === 0) {
      process.stdout.write('ios_artifact_candidate\n');
    } else {
      reportCodes(codes);
    }
  }
}
