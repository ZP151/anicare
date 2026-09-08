import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ReadinessChecks } from './evidence.js';
import {
  readChecksMarker,
  readCleanupMarker,
  readEvidencePrerequisites,
  writeChecksMarker,
  writeCleanupMarker,
} from './gate-markers.js';

const checks: ReadinessChecks = {
  authRedirectCheck: 'passed',
  mediaStagingCheck: 'passed',
  publicKeyOriginCheck: 'passed',
  syntheticOwnerHappyPath: 'passed',
  crossOwnerIsolation: 'passed',
};

const roots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(tmpdir(), 'animalhelper-gate-markers-'));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe('hosted process boundary markers', () => {
  it('round-trips one canonical all-passed correctness marker', async () => {
    const file = path.join(await root(), 'hosted-gate-2b-checks.json');

    await writeChecksMarker(file, checks);

    await expect(readChecksMarker(file)).resolves.toEqual(checks);
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(checks)}\n`);
  });

  it('round-trips one canonical cleanup proof marker', async () => {
    const file = path.join(await root(), 'hosted-gate-2b-cleanup.json');

    await writeCleanupMarker(file);

    await expect(readCleanupMarker(file)).resolves.toEqual({ cleanupPassed: true });
    expect(await readFile(file, 'utf8')).toBe('{"cleanupPassed":true}\n');
  });

  it('rejects wrong destinations and noncanonical marker bytes', async () => {
    const directory = await root();
    await expect(writeChecksMarker(path.join(directory, 'other.json'), checks))
      .rejects.toThrow('hosted_gate_marker_invalid');
    const malformed = path.join(directory, 'hosted-gate-2b-cleanup.json');
    await writeFile(malformed, '{ "cleanupPassed": true }\n', 'utf8');
    await expect(readCleanupMarker(malformed)).rejects.toThrow('hosted_gate_marker_invalid');
  });

  it('releases readiness checks only after both correctness and cleanup markers exist', async () => {
    const directory = await root();
    const checksPath = path.join(directory, 'hosted-gate-2b-checks.json');
    const cleanupPath = path.join(directory, 'hosted-gate-2b-cleanup.json');
    await writeChecksMarker(checksPath, checks);

    await expect(readEvidencePrerequisites(checksPath, cleanupPath))
      .rejects.toThrow('hosted_gate_marker_invalid');
    await writeCleanupMarker(cleanupPath);
    await expect(readEvidencePrerequisites(checksPath, cleanupPath)).resolves.toEqual(checks);
  });
});
