import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { evaluatePodfileLock } from './podfile-lock-policy';

const lockPath = resolve(__dirname, '../ios/Podfile.lock');
const appRoot = resolve(__dirname, '..');

if (process.argv.length !== 2) {
  fail(['podfile_lock_invalid']);
} else {
  try {
    const codes = evaluatePodfileLock(readFixedRegularFile(lockPath));
    if (codes.length > 0) fail(codes);
    process.stdout.write('podfile_lock_valid\n');
  } catch {
    fail(['podfile_lock_invalid']);
  }
}

function readFixedRegularFile(path: string): string {
  const link = lstatSync(path);
  if (!link.isFile() || link.isSymbolicLink()) throw new Error('invalid');
  const realPath = realpathSync(path);
  if (!isWithin(appRoot, realPath) || !statSync(realPath).isFile()) throw new Error('invalid');
  return readFileSync(realPath, 'utf8');
}

function isWithin(root: string, path: string): boolean {
  const child = relative(root, path);
  return child.length > 0 && !/^\.\.(?:[\\/]|$)/.test(child) && !isAbsolute(child);
}

function fail(codes: readonly string[]): never {
  process.stderr.write(`${codes.join('\n')}\n`);
  process.exit(1);
}
