import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { HOSTED_PROJECT_ORIGIN, HOSTED_PROJECT_REF } from './environment.js';

const INVALID = 'gate_2b_evidence_invalid';
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MIGRATION_NAME = /^\d{12,14}_[a-z0-9_]+\.sql$/;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TREE_BYTES = 32 * 1024 * 1024;
const VALIDITY_MS = 72 * 60 * 60 * 1000;
const CHECK_KEYS = [
  'authRedirectCheck',
  'mediaStagingCheck',
  'publicKeyOriginCheck',
  'syntheticOwnerHappyPath',
  'crossOwnerIsolation',
] as const;

export type ReadinessCheck = 'passed' | 'failed';
export type ReadinessChecks = Readonly<Record<(typeof CHECK_KEYS)[number], ReadinessCheck>>;

export type ReadinessEvidenceInput = Readonly<{
  sourceCommit: string;
  migrationHead: Readonly<{ filename: string; sha256: string }>;
  edgeFunctionsTreeSha256: string;
  workflowRunId: number;
  workflowRunAttempt: number;
  createdAt: string;
  checks: ReadinessChecks;
}>;

export type Gate2BReadinessEvidence = Readonly<{
  schemaVersion: 1;
  projectRef: typeof HOSTED_PROJECT_REF;
  projectOrigin: typeof HOSTED_PROJECT_ORIGIN;
  sourceCommit: string;
  migrationHead: Readonly<{ filename: string; sha256: string }>;
  edgeFunctionsTreeSha256: string;
  workflowRunId: number;
  workflowRunAttempt: number;
  createdAt: string;
  expiresAt: string;
  authRedirectCheck: ReadinessCheck;
  mediaStagingCheck: ReadinessCheck;
  publicKeyOriginCheck: ReadinessCheck;
  syntheticOwnerHappyPath: ReadinessCheck;
  crossOwnerIsolation: ReadinessCheck;
}>;

function invalid(): never {
  throw new Error(INVALID);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function buildReadinessEvidence(input: ReadinessEvidenceInput): Gate2BReadinessEvidence {
  if (!exactKeys(input, [
    'sourceCommit', 'migrationHead', 'edgeFunctionsTreeSha256', 'workflowRunId',
    'workflowRunAttempt', 'createdAt', 'checks',
  ]) ||
    typeof input.sourceCommit !== 'string' || !COMMIT.test(input.sourceCommit) ||
    !exactKeys(input.migrationHead, ['filename', 'sha256']) ||
    typeof input.migrationHead.filename !== 'string' || !MIGRATION_NAME.test(input.migrationHead.filename) ||
    typeof input.migrationHead.sha256 !== 'string' || !SHA256.test(input.migrationHead.sha256) ||
    typeof input.edgeFunctionsTreeSha256 !== 'string' || !SHA256.test(input.edgeFunctionsTreeSha256) ||
    !Number.isSafeInteger(input.workflowRunId) || input.workflowRunId < 1 ||
    !Number.isSafeInteger(input.workflowRunAttempt) || input.workflowRunAttempt < 1 ||
    !canonicalTimestamp(input.createdAt) ||
    !exactKeys(input.checks, CHECK_KEYS) || CHECK_KEYS.some((key) => input.checks[key] !== 'passed')) {
    return invalid();
  }

  const expiresAt = new Date(new Date(input.createdAt).getTime() + VALIDITY_MS).toISOString();
  return {
    schemaVersion: 1,
    projectRef: HOSTED_PROJECT_REF,
    projectOrigin: HOSTED_PROJECT_ORIGIN,
    sourceCommit: input.sourceCommit,
    migrationHead: { filename: input.migrationHead.filename, sha256: input.migrationHead.sha256 },
    edgeFunctionsTreeSha256: input.edgeFunctionsTreeSha256,
    workflowRunId: input.workflowRunId,
    workflowRunAttempt: input.workflowRunAttempt,
    createdAt: input.createdAt,
    expiresAt,
    authRedirectCheck: input.checks.authRedirectCheck,
    mediaStagingCheck: input.checks.mediaStagingCheck,
    publicKeyOriginCheck: input.checks.publicKeyOriginCheck,
    syntheticOwnerHappyPath: input.checks.syntheticOwnerHappyPath,
    crossOwnerIsolation: input.checks.crossOwnerIsolation,
  };
}

function inside(root: string, child: string): boolean {
  const path = relative(root, child);
  return path.length > 0 && !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path);
}

function fixedDirectory(path: string, root: string): string {
  const link = lstatSync(path);
  if (!link.isDirectory() || link.isSymbolicLink()) return invalid();
  const real = realpathSync(path);
  if (!inside(root, real) || !statSync(real).isDirectory()) return invalid();
  return real;
}

function fixedFile(path: string, root: string): Buffer {
  const link = lstatSync(path);
  if (!link.isFile() || link.isSymbolicLink() || link.size > MAX_FILE_BYTES) return invalid();
  const real = realpathSync(path);
  if (!inside(root, real) || !statSync(real).isFile()) return invalid();
  const bytes = readFileSync(real);
  if (bytes.byteLength > MAX_FILE_BYTES) return invalid();
  return bytes;
}

function repositoryRoot(repoRoot: string): string {
  const resolved = resolve(repoRoot);
  const link = lstatSync(resolved);
  if (!link.isDirectory() || link.isSymbolicLink()) return invalid();
  const real = realpathSync(resolved);
  if (!statSync(real).isDirectory()) return invalid();
  return real;
}

export function hashMigrationHead(repoRoot: string): Readonly<{ filename: string; sha256: string }> {
  const root = repositoryRoot(repoRoot);
  const migrations = fixedDirectory(resolve(root, 'supabase', 'migrations'), root);
  const filenames = readdirSync(migrations)
    .filter((name) => MIGRATION_NAME.test(name))
    .sort((left, right) => left.localeCompare(right));
  const filename = filenames.at(-1);
  if (filename === undefined) return invalid();
  const bytes = fixedFile(resolve(migrations, filename), migrations);
  return { filename, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function collectFiles(directory: string, root: string, output: string[]): void {
  for (const name of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
    if (name === 'node_modules' || name === 'dist' || name === '.turbo') continue;
    const path = resolve(directory, name);
    const link = lstatSync(path);
    if (link.isSymbolicLink()) return invalid();
    if (link.isDirectory()) {
      const real = realpathSync(path);
      if (!inside(root, real)) return invalid();
      collectFiles(real, root, output);
    } else if (link.isFile()) {
      output.push(realpathSync(path));
    } else {
      return invalid();
    }
  }
}

export function hashEdgeFunctionsTree(repoRoot: string): string {
  const root = repositoryRoot(repoRoot);
  const functions = fixedDirectory(resolve(root, 'supabase', 'functions'), root);
  const files: string[] = [];
  collectFiles(functions, functions, files);
  files.sort((left, right) => relative(functions, left).replaceAll('\\', '/').localeCompare(
    relative(functions, right).replaceAll('\\', '/'),
  ));

  const hash = createHash('sha256');
  hash.update('animalhelper-edge-functions-tree-v1\0');
  let totalBytes = 0;
  for (const path of files) {
    const relativePath = relative(functions, path).replaceAll('\\', '/');
    const bytes = fixedFile(path, functions);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TREE_BYTES) return invalid();
    hash.update(`${Buffer.byteLength(relativePath)}:${relativePath}\0${bytes.byteLength}:`);
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}
