import { describe, expect, it, vi } from 'vitest';

import {
  cleanupHostedScenario,
  inspectHostedMedia,
  type HostedMaintenanceAdapter,
  type PartialHostedScenario,
} from './inspection.js';
import type { HostedGateEnvironment } from './environment.js';

const UUIDS = Array.from({ length: 8 }, (_, index) =>
  `${String(index + 1).repeat(8)}-${String(index + 1).repeat(4)}-4${String(index + 1).repeat(3)}-8${String(index + 1).repeat(3)}-${String(index + 1).repeat(12)}`,
);

function env(): HostedGateEnvironment {
  return {
    apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co', anonKey: 'sb_publishable_test',
    serviceRoleKey: 'sb_secret_test', databaseUrl: 'postgresql://unused',
    preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'), sourceCommit: 'a'.repeat(40),
    workflowRunId: 1, workflowRunAttempt: 1,
  };
}

function input() {
  return {
    ownerId: UUIDS[0]!, sightingId: UUIDS[1]!, mediaId: UUIDS[2]!, jobId: UUIDS[3]!,
    mediaAssetId: UUIDS[4]!, sha256: 'a'.repeat(64), byteLength: 631, width: 1, height: 1,
  };
}

function scenario(): PartialHostedScenario {
  return {
    createdUserIds: [UUIDS[0]!, UUIDS[5]!],
    createdSightingIds: [UUIDS[1]!, UUIDS[6]!],
    createdMediaIds: [UUIDS[2]!],
    createdJobIds: [UUIDS[3]!],
    createdAssetIds: [UUIDS[4]!],
    createdObjectPaths: [`jobs/${UUIDS[3]}.jpg`],
  };
}

describe('hosted inspection and cleanup', () => {
  it('accepts only bounded exact inspection inputs and returns exact normalized counts', async () => {
    const inspect = vi.fn(async () => ({
      jobCount: 1, matchingFinalizedJobCount: 1, assetCount: 1,
      matchingQuarantinedAssetCount: 1, stagingObjectExists: true,
    }));
    const result = await inspectHostedMedia(env(), input(), { inspect } as never);
    expect(result).toEqual(await inspect.mock.results[0]!.value);
    expect(inspect).toHaveBeenCalledWith(input());
    await expect(inspectHostedMedia(env(), { ...input(), width: 0 }, { inspect } as never))
      .rejects.toThrow('hosted_inspection_failed');
    await expect(inspectHostedMedia(env(), { ...input(), sql: 'select *' } as never, { inspect } as never))
      .rejects.toThrow('hosted_inspection_failed');
  });

  it('removes exact objects, deletes rows in fixed order, deletes Auth last, and proves absence', async () => {
    const calls: string[] = [];
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(),
      removeObjects: vi.fn(async (paths) => { calls.push(`objects:${paths.join(',')}`); }),
      deleteRows: vi.fn(async (table, ids) => { calls.push(`${table}:${ids.join(',')}`); }),
      deleteAuthUsers: vi.fn(async (ids) => { calls.push(`auth:${ids.join(',')}`); }),
      assertAbsent: vi.fn(async (tracked) => {
        calls.push(`absent:${Object.keys(tracked).sort().join(',')}`);
        return true;
      }),
      close: vi.fn(async () => { calls.push('close'); }),
    };
    await cleanupHostedScenario(env(), scenario(), adapter);
    expect(calls).toEqual([
      `objects:jobs/${UUIDS[3]}.jpg`,
      `media_upload_jobs:${UUIDS[3]}`,
      `media_assets:${UUIDS[4]}`,
      `sightings:${UUIDS[1]},${UUIDS[6]}`,
      `user_profiles:${UUIDS[0]},${UUIDS[5]}`,
      `auth:${UUIDS[0]},${UUIDS[5]}`,
      'absent:createdAssetIds,createdJobIds,createdMediaIds,createdObjectPaths,createdSightingIds,createdUserIds',
      'close',
    ]);
    expect(calls.join('\n')).not.toMatch(/\*|truncate|before|after|example\.invalid/i);
  });

  it('fails closed when exact absence cannot be proven and still closes the connection', async () => {
    const close = vi.fn(async () => undefined);
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), removeObjects: vi.fn(), deleteRows: vi.fn(), deleteAuthUsers: vi.fn(),
      assertAbsent: vi.fn(async () => false), close,
    };
    await expect(cleanupHostedScenario(env(), scenario(), adapter)).rejects.toThrow('hosted_cleanup_failed');
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    { createdUserIds: ['not-a-uuid'] },
    { createdObjectPaths: ['*'] },
    { createdObjectPaths: ['jobs/../escape.jpg'] },
    { createdMediaIds: ['contains wildcard *'] },
  ])('rejects unsafe cleanup selectors %#', async (unsafe) => {
    const adapter = { close: vi.fn() } as never;
    await expect(cleanupHostedScenario(env(), unsafe, adapter)).rejects.toThrow('hosted_cleanup_failed');
  });
});
