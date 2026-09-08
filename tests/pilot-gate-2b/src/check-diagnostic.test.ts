import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeHostedCheckDiagnostic } from './check-diagnostic.js';
import { HOSTED_OWNER_FINALIZE_OUTCOMES } from './checks.js';

describe('hosted check diagnostic writer', () => {
  it('bounds every allowlisted owner-finalize outcome to canonical control output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-hosted-check-diagnostic-'));
    try {
      for (const ownerFinalizeOutcome of HOSTED_OWNER_FINALIZE_OUTCOMES) {
        const target = path.join(root, 'hosted-check-diagnostic.json');
        const control = {
          gateStage: 'checks', check: 'owner_happy_path', ownerStep: 'finalize', ownerFinalizeOutcome,
        } as const;
        await writeHostedCheckDiagnostic(target, control);
        const source = await readFile(target, 'utf8');
        expect(source).toBe(`${JSON.stringify(control)}\n`);
        expect(Buffer.byteLength(source, 'utf8')).toBeLessThanOrEqual(320);
        await rm(target);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['checks_timeout', 'checks_unsettled'] as const)
    ('writes the fixed %s category without accepting cleanup data', async (gateStage) => {
      const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-hosted-check-diagnostic-'));
      const target = path.join(root, 'hosted-check-diagnostic.json');
      try {
        const control = { gateStage } as const;
        await writeHostedCheckDiagnostic(target, control);
        await expect(readFile(target, 'utf8')).resolves.toBe(`${JSON.stringify(control)}\n`);
        await rm(target);
        await expect(writeHostedCheckDiagnostic(target, {
          gateStage, cleanup: ['absence_proof'],
        })).rejects.toThrow('hosted_check_diagnostic_invalid');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

  it('rejects cross-check fields, hostile values, and noncanonical destinations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-hosted-check-diagnostic-'));
    const target = path.join(root, 'hosted-check-diagnostic.json');
    try {
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'Bearer secret',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'owner_happy_path', mediaStep: 'privacy_list',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'media_staging', ownerStep: 'upload',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(path.join(root, 'other.json'), { gateStage: 'checks' }))
        .rejects.toThrow('hosted_check_diagnostic_invalid');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
