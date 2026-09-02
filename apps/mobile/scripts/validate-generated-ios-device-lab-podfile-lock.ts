import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluatePodfileLock } from './podfile-lock-policy';

const lockPath = resolve(__dirname, '../ios/Podfile.lock');

if (process.argv.length !== 2) {
  fail(['podfile_lock_invalid']);
} else {
  try {
    const codes = evaluatePodfileLock(readFileSync(lockPath, 'utf8'));
    if (codes.length > 0) fail(codes);
    process.stdout.write('podfile_lock_valid\n');
  } catch {
    fail(['podfile_lock_invalid']);
  }
}

function fail(codes: readonly string[]): never {
  process.stderr.write(`${codes.join('\n')}\n`);
  process.exit(1);
}
