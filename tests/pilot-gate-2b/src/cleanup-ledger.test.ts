import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readCleanupLedger, writeCleanupLedger } from './cleanup-ledger.js';

const ID = '11111111-1111-4111-8111-111111111111';

describe('durable hosted cleanup ledger', () => {
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
});
