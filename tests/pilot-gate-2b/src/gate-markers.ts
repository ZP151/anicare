import { chmod, lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ReadinessChecks } from './evidence.js';

const INVALID = 'hosted_gate_marker_invalid';
const CHECKS_FILENAME = 'hosted-gate-2b-checks.json';
const CLEANUP_FILENAME = 'hosted-gate-2b-cleanup.json';
const CHECK_KEYS = [
  'authRedirectCheck',
  'mediaStagingCheck',
  'publicKeyOriginCheck',
  'syntheticOwnerHappyPath',
  'crossOwnerIsolation',
] as const;

function invalid(): never { throw new Error(INVALID); }

function target(file: string, filename: string): string {
  if (typeof file !== 'string' || !path.isAbsolute(file) || /[\r\n\0]/.test(file)) return invalid();
  const resolved = path.resolve(file);
  if (path.basename(resolved) !== filename) return invalid();
  return resolved;
}

function checksMarker(value: unknown): ReadinessChecks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== CHECK_KEYS.length ||
      CHECK_KEYS.some((key) => candidate[key] !== 'passed')) return invalid();
  return candidate as ReadinessChecks;
}

async function writeCanonical(file: string, filename: string, value: unknown): Promise<void> {
  const resolved = target(file, filename);
  try {
    await writeFile(resolved, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(resolved, 0o600);
    const metadata = await lstat(resolved);
    if (!metadata.isFile() || metadata.isSymbolicLink() ||
        (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)) return invalid();
  } catch {
    return invalid();
  }
}

async function readCanonical(file: string, filename: string): Promise<unknown> {
  const resolved = target(file, filename);
  try {
    const metadata = await lstat(resolved);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 512 ||
        (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)) return invalid();
    const source = await readFile(resolved, 'utf8');
    const parsed = JSON.parse(source) as unknown;
    if (source !== `${JSON.stringify(parsed)}\n`) return invalid();
    return parsed;
  } catch {
    return invalid();
  }
}

export async function writeChecksMarker(file: string, checks: ReadinessChecks): Promise<void> {
  await writeCanonical(file, CHECKS_FILENAME, checksMarker(checks));
}

export async function readChecksMarker(file: string): Promise<ReadinessChecks> {
  return checksMarker(await readCanonical(file, CHECKS_FILENAME));
}

export async function writeCleanupMarker(file: string): Promise<void> {
  await writeCanonical(file, CLEANUP_FILENAME, { cleanupPassed: true });
}

export async function readCleanupMarker(file: string): Promise<Readonly<{ cleanupPassed: true }>> {
  const value = await readCanonical(file, CLEANUP_FILENAME);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 1 || (value as Record<string, unknown>).cleanupPassed !== true) return invalid();
  return { cleanupPassed: true };
}

export async function readEvidencePrerequisites(
  checksPath: string,
  cleanupPath: string,
): Promise<ReadinessChecks> {
  const checks = await readChecksMarker(checksPath);
  await readCleanupMarker(cleanupPath);
  return checks;
}
