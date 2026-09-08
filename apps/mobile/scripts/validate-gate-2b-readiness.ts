import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { evaluateGate2BReadiness } from './ios-device-lab-policy';

const appRoot = resolve(__dirname, '..');
const repositoryRoot = resolve(appRoot, '..', '..');
const evidencePath = resolve(repositoryRoot, 'docs/evidence/pilot-gate-2b-readiness.json');
const migrationsPath = resolve(repositoryRoot, 'supabase/migrations');

function fail(code: 'gate_2b_readiness_missing' | 'gate_2b_readiness_invalid' | readonly string[]): never {
  process.stderr.write(`${Array.isArray(code) ? code.join('\n') : code}\n`);
  process.exit(1);
}

if (process.argv.length !== 2) {
  fail('gate_2b_readiness_invalid');
}

let evidence: unknown;
try {
  evidence = JSON.parse(readFixedRegularFile(evidencePath, repositoryRoot));
} catch (error: unknown) {
  if (isMissingFileError(error)) fail('gate_2b_readiness_missing');
  fail('gate_2b_readiness_invalid');
}

try {
  const realMigrationsPath = fixedDirectory(migrationsPath, repositoryRoot);
  const migrationFilenames = readdirSync(realMigrationsPath).filter((value) => value.endsWith('.sql')).sort();
  for (const filename of migrationFilenames) readFixedRegularFile(resolve(realMigrationsPath, filename), realMigrationsPath);
  const migrationFilename = migrationFilenames.at(-1);
  if (migrationFilename === undefined) fail('gate_2b_readiness_invalid');
  const migrationHead = {
    filename: migrationFilename,
    sha256: createHash('sha256').update(readFixedRegularFile(resolve(realMigrationsPath, migrationFilename), realMigrationsPath)).digest('hex'),
  };
  const candidateCommit = git('rev-parse', 'HEAD').trim();
  const codes = evaluateGate2BReadiness({
    evidence,
    nowIso: new Date().toISOString(),
    candidateCommit,
    isAncestor: (source, candidate) => gitStatus('merge-base', '--is-ancestor', source, candidate),
    hasMigrationChanges: (source, candidate) => git('diff', '--name-only', source, candidate, '--', 'supabase/migrations').trim().length > 0,
    migrationHead,
    edgeFunctionsTreeSha256: hashEdgeFunctionsTree(repositoryRoot),
  });
  if (codes.length > 0) fail(codes);
  process.stdout.write('gate_2b_readiness_valid\n');
} catch {
  fail('gate_2b_readiness_invalid');
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function gitStatus(...args: string[]): boolean {
  try {
    execFileSync('git', args, { cwd: repositoryRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function fixedDirectory(path: string, root: string): string {
  const link = lstatSync(path);
  if (!link.isDirectory() || link.isSymbolicLink()) throw new Error('invalid');
  const realPath = realpathSync(path);
  if (!isWithin(root, realPath) || !statSync(realPath).isDirectory()) throw new Error('invalid');
  return realPath;
}

function readFixedRegularFile(path: string, root: string): string {
  return readFixedRegularBuffer(path, root).toString('utf8');
}

function readFixedRegularBuffer(path: string, root: string): Buffer {
  const link = lstatSync(path);
  if (!link.isFile() || link.isSymbolicLink() || link.size > 2 * 1024 * 1024) throw new Error('invalid');
  const realPath = realpathSync(path);
  if (!isWithin(root, realPath) || !statSync(realPath).isFile()) throw new Error('invalid');
  return readFileSync(realPath);
}

function hashEdgeFunctionsTree(root: string): string {
  const functionsRoot = fixedDirectory(resolve(root, 'supabase/functions'), root);
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
      if (name === 'node_modules' || name === 'dist' || name === '.turbo') continue;
      const path = resolve(directory, name);
      const link = lstatSync(path);
      if (link.isSymbolicLink()) throw new Error('invalid');
      if (link.isDirectory()) walk(realpathSync(path));
      else if (link.isFile()) files.push(realpathSync(path));
      else throw new Error('invalid');
    }
  };
  walk(functionsRoot);
  files.sort((left, right) => relative(functionsRoot, left).replaceAll('\\', '/').localeCompare(
    relative(functionsRoot, right).replaceAll('\\', '/'),
  ));
  const hash = createHash('sha256');
  hash.update('animalhelper-edge-functions-tree-v1\0');
  let totalBytes = 0;
  for (const path of files) {
    const relativePath = relative(functionsRoot, path).replaceAll('\\', '/');
    const bytes = readFixedRegularBuffer(path, functionsRoot);
    totalBytes += bytes.byteLength;
    if (totalBytes > 32 * 1024 * 1024) throw new Error('invalid');
    hash.update(`${Buffer.byteLength(relativePath)}:${relativePath}\0${bytes.byteLength}:`);
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function isWithin(root: string, path: string): boolean {
  const child = relative(root, path);
  return child.length > 0 && !/^\.\.(?:[\\/]|$)/.test(child) && !isAbsolute(child);
}
