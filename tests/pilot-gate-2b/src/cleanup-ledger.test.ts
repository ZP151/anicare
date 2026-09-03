import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { persistCleanupMediaId, readCleanupLedger, writeCleanupLedger } from './cleanup-ledger.js';

const ID = '11111111-1111-4111-8111-111111111111';

describe('durable hosted cleanup ledger', () => {
  it('retains all 25 bounded characterization reservations for crash recovery', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gate-2b-ledger-characterize-'));
    const file = path.join(root, 'animalhelper-pilot-gate-2b-ledger-123-1.json');
    const ids = Array.from({ length: 25 }, (_value, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
    const value = {
      createdAuthRecoveryIds: [], createdUserIds: [], sightingRecoveryReferences: [],
      createdSightingIds: [], createdMediaIds: ids,
      createdJobIds: ids, createdAssetIds: ids, createdObjectPaths: ids.map((id) => `jobs/${id}.jpg`),
    };
    try {
      await writeCleanupLedger(file, value);
      await expect(readCleanupLedger(file)).resolves.toEqual(value);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('writes and reads only canonical exact cleanup selectors', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gate-2b-ledger-'));
    const file = path.join(root, 'animalhelper-pilot-gate-2b-ledger-123-1.json');
    const value = {
      createdAuthRecoveryIds: [ID], createdUserIds: [ID], sightingRecoveryReferences: [],
      createdSightingIds: [], createdMediaIds: [ID],
      createdJobIds: [], createdAssetIds: [], createdObjectPaths: [`jobs/${ID}.jpg`],
    };
    try {
      await writeCleanupLedger(file, value);
      await expect(readCleanupLedger(file)).resolves.toEqual(value);
      expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(value, null, 2)}\n`);
      const updated = { ...value, createdJobIds: [ID] };
      await writeCleanupLedger(file, updated);
      await expect(readCleanupLedger(file)).resolves.toEqual(updated);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects unsafe paths, selectors, extra keys, and noncanonical files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gate-2b-ledger-invalid-'));
    try {
      await expect(writeCleanupLedger(path.join(root, 'other.json'), {})).rejects.toThrow('cleanup_ledger_invalid');
      await expect(writeCleanupLedger(path.join(root, 'animalhelper-pilot-gate-2b-ledger-1-1.json'), {
        createdUserIds: ['*'], extra: [],
      })).rejects.toThrow('cleanup_ledger_invalid');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('durably appends a probe media ID before the guarded request can run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gate-2b-ledger-probe-'));
    const file = path.join(root, 'animalhelper-pilot-gate-2b-ledger-123-1.json');
    const probe = '22222222-2222-4222-8222-222222222222';
    const value = {
      createdAuthRecoveryIds: [], createdUserIds: [], sightingRecoveryReferences: [],
      createdSightingIds: [], createdMediaIds: [ID],
      createdJobIds: [], createdAssetIds: [], createdObjectPaths: [],
    };
    try {
      await writeCleanupLedger(file, value);
      const tracked = await persistCleanupMediaId(file, value, probe);
      expect(tracked.createdMediaIds).toEqual([ID, probe]);
      await expect(readCleanupLedger(file)).resolves.toEqual(tracked);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
