import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeHostedCheckDiagnostic } from './check-diagnostic.js';

describe('hosted check diagnostic writer', () => {
  it('drops only the optional outcome when the maximal valid control exceeds the byte cap', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-hosted-check-diagnostic-'));
    const target = path.join(root, 'hosted-check-diagnostic.json');
    const maximal = {
      gateStage: 'cleanup', check: 'owner_happy_path', ownerStep: 'finalize',
      ownerFinalizeOutcome: 'http_403_media_not_found_or_forbidden', cleanup: [
        'setup', 'recover_auth', 'recover_sighting', 'storage_remove', 'jobs_delete', 'assets_delete',
        'sightings_delete', 'profiles_delete', 'auth_delete', 'absence_proof', 'connection_close',
      ],
    } as const;
    const expected = {
      gateStage: 'cleanup', check: 'owner_happy_path', ownerStep: 'finalize', cleanup: maximal.cleanup,
    } as const;
    try {
      expect(Buffer.byteLength(`${JSON.stringify(maximal)}\n`, 'utf8')).toBeGreaterThan(320);
      expect(Buffer.byteLength(`${JSON.stringify(expected)}\n`, 'utf8')).toBeLessThanOrEqual(320);
      await writeHostedCheckDiagnostic(target, maximal);
      await expect(readFile(target, 'utf8')).resolves.toBe(`${JSON.stringify(expected)}\n`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes only a canonical allowlisted check record with owner-only permissions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-hosted-check-diagnostic-'));
    const target = path.join(root, 'hosted-check-diagnostic.json');
    try {
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'cleanup', check: 'Bearer secret', cleanup: ['absence_proof', 'storage_remove'],
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'evidence', check: 'media_staging',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', cleanup: ['storage_remove'],
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'owner_happy_path', mediaStep: 'privacy_list',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'media_staging', ownerStep: 'upload',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'media_staging', mediaStep: 'Bearer secret',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'owner_happy_path', ownerStep: 'replay',
        ownerFinalizeOutcome: 'network',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'media_staging', mediaStep: 'privacy_list',
        ownerFinalizeOutcome: 'network',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(writeHostedCheckDiagnostic(target, {
        gateStage: 'checks', check: 'owner_happy_path', ownerStep: 'finalize',
        ownerFinalizeOutcome: 'Bearer secret',
      })).rejects.toThrow('hosted_check_diagnostic_invalid');
      const control = {
        gateStage: 'cleanup', check: 'owner_happy_path', ownerStep: 'finalize',
        ownerFinalizeOutcome: 'http_403_media_not_found_or_forbidden', cleanup: [
          'setup', 'recover_auth', 'recover_sighting', 'storage_remove', 'jobs_delete', 'assets_delete',
          'sightings_delete', 'profiles_delete', 'auth_delete', 'absence_proof',
        ],
      } as const;
      expect(Buffer.byteLength(`${JSON.stringify(control)}\n`, 'utf8')).toBeLessThanOrEqual(320);
      await writeHostedCheckDiagnostic(target, control);
      await expect(readFile(target, 'utf8')).resolves.toBe(`${JSON.stringify(control)}\n`);
      await expect(writeHostedCheckDiagnostic(target, control)).rejects.toThrow('hosted_check_diagnostic_invalid');
      await expect(readFile(target, 'utf8')).resolves.toBe(`${JSON.stringify(control)}\n`);
      await expect(writeHostedCheckDiagnostic(path.join(root, 'other.json'), 'not_allowed'))
        .rejects.toThrow('hosted_check_diagnostic_invalid');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
