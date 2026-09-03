import { chmod, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { HOSTED_CHECK_IDS, type HostedCheckId } from './checks.js';

const FILENAME = 'hosted-check-diagnostic.json';

function invalid(): never { throw new Error('hosted_check_diagnostic_invalid'); }

function targetPath(file: string): string {
  if (typeof file !== 'string' || !path.isAbsolute(file) || /[\r\n\0]/.test(file)) return invalid();
  const target = path.resolve(file);
  if (path.basename(target) !== FILENAME) return invalid();
  return target;
}

function checkId(value: unknown): HostedCheckId {
  if (typeof value !== 'string' || !(HOSTED_CHECK_IDS as readonly string[]).includes(value)) return invalid();
  return value as HostedCheckId;
}

export async function writeHostedCheckDiagnostic(file: string, value: unknown): Promise<void> {
  const target = targetPath(file);
  const check = checkId(value);
  try {
    await writeFile(target, `${JSON.stringify({ check })}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await chmod(target, 0o600);
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() ||
        (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)) return invalid();
  } catch {
    return invalid();
  }
}
