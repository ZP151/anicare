import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readCleanupMarker } from './gate-markers.js';
import { HostedCleanupFailure } from './inspection.js';
import { runHostedCleanup } from './cleanup-runner.js';

const roots: string[] = [];

async function markerPath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'animalhelper-cleanup-runner-'));
  roots.push(root);
  return path.join(root, 'hosted-gate-2b-cleanup.json');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe('authoritative hosted cleanup runner', () => {
  it('polls an absence-only convergence failure before writing cleanup proof', async () => {
    let attempt = 0;
    const cleanup = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new HostedCleanupFailure(['absence_proof']);
    });
    const wait = vi.fn(async () => undefined);
    const marker = await markerPath();

    await runHostedCleanup({ cleanup, wait, markerPath: marker, maxAttempts: 3 });

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1_000);
    await expect(readCleanupMarker(marker)).resolves.toEqual({ cleanupPassed: true });
  });

  it('classifies a non-convergence cleanup operation as cleanup_failure without polling', async () => {
    const cleanup = vi.fn(async () => { throw new HostedCleanupFailure(['storage_remove']); });
    const wait = vi.fn(async () => undefined);

    await expect(runHostedCleanup({
      cleanup, wait, markerPath: await markerPath(), maxAttempts: 3,
    })).rejects.toMatchObject({
      outcome: 'cleanup_failure', operationIds: ['storage_remove'],
    });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it('classifies exhausted absence polling as cleanup_timeout', async () => {
    const cleanup = vi.fn(async () => { throw new HostedCleanupFailure(['absence_proof']); });
    const wait = vi.fn(async () => undefined);

    await expect(runHostedCleanup({
      cleanup, wait, markerPath: await markerPath(), maxAttempts: 2,
    })).rejects.toMatchObject({
      outcome: 'cleanup_timeout', operationIds: ['absence_proof'],
    });
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
  });
});
