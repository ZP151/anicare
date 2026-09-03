import { randomBytes } from 'node:crypto';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PartialHostedScenario } from './inspection.js';

const KEYS = [
  'createdAuthRecoveryIds', 'createdUserIds', 'sightingRecoveryReferences', 'createdSightingIds', 'createdMediaIds',
  'createdJobIds', 'createdAssetIds', 'createdObjectPaths',
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_PATH = /^jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;
const MAX_TRACKED = 32;
const LEDGER_FILE = /^animalhelper-pilot-gate-2b-ledger-[1-9][0-9]*-[1-9][0-9]*\.json$/;

type CleanupLedger = Required<PartialHostedScenario>;

function invalid(): never { throw new Error('cleanup_ledger_invalid'); }

function normalize(value: unknown): CleanupLedger {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== KEYS.length ||
      !KEYS.every((key) => Object.hasOwn(value, key))) return invalid();
  const record = value as Record<string, unknown>;
  const ids = (key: typeof KEYS[number]): readonly string[] => {
    const list = record[key];
    if (!Array.isArray(list) || list.length > MAX_TRACKED || list.some((item) => typeof item !== 'string' || !UUID.test(item)) ||
        new Set(list).size !== list.length) return invalid();
    return [...list];
  };
  const paths = record.createdObjectPaths;
  if (!Array.isArray(paths) || paths.length > MAX_TRACKED ||
      paths.some((item) => typeof item !== 'string' || !OBJECT_PATH.test(item)) || new Set(paths).size !== paths.length) {
    return invalid();
  }
  return {
    createdAuthRecoveryIds: ids('createdAuthRecoveryIds'),
    createdUserIds: ids('createdUserIds'),
    sightingRecoveryReferences: (() => {
      const references = record.sightingRecoveryReferences;
      if (!Array.isArray(references) || references.length > MAX_TRACKED || references.some((item) =>
        !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 2 ||
        !UUID.test(item.reporterId) || !/^pilot-gate-2b-(?:owner|stranger)-[a-f0-9]{32}$/i.test(item.clientDedupeKey)) ||
        new Set(references.map((item) => `${item.reporterId}:${item.clientDedupeKey}`)).size !== references.length) {
        return invalid();
      }
      return references.map((item) => ({ reporterId: item.reporterId, clientDedupeKey: item.clientDedupeKey }));
    })(),
    createdSightingIds: ids('createdSightingIds'),
    createdMediaIds: ids('createdMediaIds'), createdJobIds: ids('createdJobIds'),
    createdAssetIds: ids('createdAssetIds'), createdObjectPaths: [...paths],
  };
}

function validatePath(file: string): string {
  const target = path.resolve(file);
  if (!LEDGER_FILE.test(path.basename(target))) return invalid();
  return target;
}

export async function writeCleanupLedger(file: string, value: unknown): Promise<void> {
  const target = validatePath(file);
  const normalized = normalize(value);
  const temporary = `${target}.tmp-${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
    return invalid();
  }
}

export async function persistCleanupMediaId(
  file: string,
  value: unknown,
  mediaId: string,
): Promise<CleanupLedger> {
  const tracked = normalize(value);
  if (!UUID.test(mediaId) || tracked.createdMediaIds.includes(mediaId) || tracked.createdMediaIds.length >= MAX_TRACKED) {
    return invalid();
  }
  const updated = normalize({
    ...tracked,
    createdMediaIds: [...tracked.createdMediaIds, mediaId],
  });
  await writeCleanupLedger(file, updated);
  return updated;
}

export async function readCleanupLedger(file: string): Promise<CleanupLedger> {
  const target = validatePath(file);
  const info = await lstat(target).catch(() => invalid());
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 8 * 1024) return invalid();
  const source = await readFile(target, 'utf8').catch(() => invalid());
  let value: unknown;
  try { value = JSON.parse(source); } catch { return invalid(); }
  const normalized = normalize(value);
  if (source !== `${JSON.stringify(normalized, null, 2)}\n`) return invalid();
  return normalized;
}

export async function removeCleanupLedger(file: string): Promise<void> {
  await rm(validatePath(file), { force: true });
}
