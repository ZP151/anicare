import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeHostedCheckDiagnostic } from './check-diagnostic.js';

describe('hosted check diagnostic writer', () => {
  it('writes only a canonical allowlisted check record with owner-only permissions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-hosted-check-diagnostic-'));
    const target = path.join(root, 'hosted-check-diagnostic.json');
    try {
      await writeHostedCheckDiagnostic(target, 'media_staging');
      await expect(readFile(target, 'utf8')).resolves.toBe('{"check":"media_staging"}\n');
      await expect(writeHostedCheckDiagnostic(target, 'media_staging')).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(readFile(target, 'utf8')).resolves.toBe('{"check":"media_staging"}\n');
      await expect(writeHostedCheckDiagnostic(path.join(root, 'other.json'), 'not_allowed'))
        .rejects.toThrow('hosted_check_diagnostic_invalid');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
