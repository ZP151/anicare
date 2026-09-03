import { describe, expect, it, vi } from 'vitest';

import {
  cleanupHostedScenario,
  cleanupOperationIdsFromError,
  createHostedInspectionSession,
  HostedIsolationFailure,
  hostedIsolationStepFromError,
  inspectHostedIsolationState,
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
    createdAuthRecoveryIds: [UUIDS[7]!],
    createdUserIds: [UUIDS[0]!, UUIDS[5]!],
    sightingRecoveryReferences: [{
      reporterId: UUIDS[0]!, clientDedupeKey: 'pilot-gate-2b-owner-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }],
    createdSightingIds: [UUIDS[1]!, UUIDS[6]!],
    createdMediaIds: [UUIDS[2]!],
    createdJobIds: [UUIDS[3]!],
    createdAssetIds: [UUIDS[4]!],
    createdObjectPaths: [`jobs/${UUIDS[3]}.jpg`],
  };
}

describe('hosted inspection and cleanup', () => {
  it('reuses one inspection adapter through checks and closes it exactly once during cleanup', async () => {
    const close = vi.fn(async () => undefined);
    const inspection = {
      jobCount: 1, matchingFinalizedJobCount: 1, assetCount: 1,
      matchingQuarantinedAssetCount: 1, stagingObjectExists: true,
    };
    const isolationInput = {
      ownerId: UUIDS[0]!, strangerId: UUIDS[5]!,
      ownerSightingId: UUIDS[1]!, strangerSightingId: UUIDS[6]!,
      mediaIds: [UUIDS[2]!],
      observedObjectPaths: [`jobs/${UUIDS[3]}.jpg`, `jobs/${UUIDS[7]}.jpg`],
    };
    const isolation = { jobs: [], assets: [], objectExists: [true, false] };
    const adapter = {
      inspect: vi.fn(async () => inspection),
      inspectIsolation: vi.fn(async () => isolation),
      recoverAuthUserIds: vi.fn(async () => []), recoverSightingIds: vi.fn(async () => []),
      removeObjects: vi.fn(), deleteRows: vi.fn(), deleteAuthUsers: vi.fn(),
      assertAbsent: vi.fn(async () => true), close,
    };
    const session = createHostedInspectionSession(env(), adapter);
    await expect(session.inspectMedia(input())).resolves.toEqual(inspection);
    await expect(session.inspectIsolation(isolationInput)).resolves.toEqual(isolation);
    expect(close).not.toHaveBeenCalled();
    await expect(session.cleanup({})).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes a session-owned adapter when cleanup input validation fails', async () => {
    const close = vi.fn(async () => undefined);
    const adapter = {
      inspect: vi.fn(), inspectIsolation: vi.fn(),
      recoverAuthUserIds: vi.fn(), recoverSightingIds: vi.fn(), removeObjects: vi.fn(),
      deleteRows: vi.fn(), deleteAuthUsers: vi.fn(), assertAbsent: vi.fn(), close,
    };
    const session = createHostedInspectionSession(env(), adapter);
    await expect(session.cleanup({ createdUserIds: ['not-a-uuid'] })).rejects.toThrow('hosted_cleanup_failed');
    expect(close).toHaveBeenCalledOnce();
  });

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

  it('accepts only an exact two-actor isolation scope and a canonical bounded snapshot', async () => {
    const isolationInput = {
      ownerId: UUIDS[0]!, strangerId: UUIDS[5]!,
      ownerSightingId: UUIDS[1]!, strangerSightingId: UUIDS[6]!,
      mediaIds: [UUIDS[2]!],
      observedObjectPaths: [`jobs/${UUIDS[3]}.jpg`, `jobs/${UUIDS[7]}.jpg`],
    };
    const snapshot = { jobs: [], assets: [], objectExists: [true, false] };
    const inspectIsolation = vi.fn(async () => snapshot);
    await expect(inspectHostedIsolationState(env(), isolationInput, { inspectIsolation }))
      .resolves.toEqual(snapshot);
    expect(inspectIsolation).toHaveBeenCalledWith(isolationInput);
    await expect(inspectHostedIsolationState(env(), {
      ...isolationInput, strangerId: isolationInput.ownerId,
    }, { inspectIsolation })).rejects.toThrow('hosted_inspection_failed');
    await expect(inspectHostedIsolationState(env(), {
      ...isolationInput,
      observedObjectPaths: [...isolationInput.observedObjectPaths, `jobs/${UUIDS[4]}.jpg`],
    }, { inspectIsolation })).rejects.toThrow('hosted_inspection_failed');
  });

  it('rejects malformed or overflowing isolation snapshots', async () => {
    const isolationInput = {
      ownerId: UUIDS[0]!, strangerId: UUIDS[5]!,
      ownerSightingId: UUIDS[1]!, strangerSightingId: UUIDS[6]!,
      mediaIds: [UUIDS[2]!],
      observedObjectPaths: [`jobs/${UUIDS[3]}.jpg`, `jobs/${UUIDS[7]}.jpg`],
    };
    try {
      await inspectHostedIsolationState(env(), isolationInput, {
        inspectIsolation: async () => ({ jobs: [], assets: [], objectExists: [true, 'false'] }),
      });
      throw new Error('expected isolation validation failure');
    } catch (error) {
      expect(hostedIsolationStepFromError(error)).toBe('isolation_validation');
    }
    await expect(inspectHostedIsolationState(env(), isolationInput, {
      inspectIsolation: async () => ({
        jobs: Array.from({ length: 17 }, () => ({})), assets: [], objectExists: [true, false],
      }),
    })).rejects.toThrow('hosted_inspection_failed');
  });

  it('preserves only a typed finite isolation operation step', async () => {
    const isolationInput = {
      ownerId: UUIDS[0]!, strangerId: UUIDS[5]!,
      ownerSightingId: UUIDS[1]!, strangerSightingId: UUIDS[6]!, mediaIds: [UUIDS[2]!],
      observedObjectPaths: [`jobs/${UUIDS[3]}.jpg`, `jobs/${UUIDS[7]}.jpg`],
    };
    try {
      await inspectHostedIsolationState(env(), isolationInput, {
        inspectIsolation: async () => { throw new HostedIsolationFailure('isolation_jobs'); },
      });
      throw new Error('expected isolation query failure');
    } catch (error) {
      expect(hostedIsolationStepFromError(error)).toBe('isolation_jobs');
      expect(String(error)).not.toMatch(/Bearer|https:|secret/);
    }
  });

  it('removes exact objects, deletes rows in fixed order, deletes Auth last, and proves absence', async () => {
    const calls: string[] = [];
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(),
      recoverAuthUserIds: vi.fn(async (ids) => { calls.push(`recover-auth:${ids.join(',')}`); return []; }),
      recoverSightingIds: vi.fn(async (references: readonly Readonly<{ clientDedupeKey: string }>[]) => {
        calls.push(`recover-sightings:${references.map((item) => item.clientDedupeKey).join(',')}`); return [];
      }),
      removeObjects: vi.fn(async (paths) => { calls.push(`objects:${paths.join(',')}`); }),
      deleteRows: vi.fn(async (table, ids, mediaIds, ownerIds) => {
        calls.push(`${table}:${ids.join(',')}:${mediaIds?.join(',') ?? ''}:${ownerIds?.join(',') ?? ''}`);
      }),
      deleteAuthUsers: vi.fn(async (ids) => { calls.push(`auth:${ids.join(',')}`); }),
      assertAbsent: vi.fn(async (tracked) => {
        calls.push(`absent:${Object.keys(tracked).sort().join(',')}`);
        return true;
      }),
      close: vi.fn(async () => { calls.push('close'); }),
    };
    await cleanupHostedScenario(env(), scenario(), adapter);
    expect(calls).toEqual([
      `recover-auth:${UUIDS[7]}`,
      'recover-sightings:pilot-gate-2b-owner-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      `objects:jobs/${UUIDS[3]}.jpg`,
      `media_upload_jobs:${UUIDS[3]}:${UUIDS[2]}:${UUIDS[0]},${UUIDS[5]}`,
      `media_assets:${UUIDS[4]}:${UUIDS[2]}:${UUIDS[0]},${UUIDS[5]}`,
      `sightings:${UUIDS[1]},${UUIDS[6]}::`,
      `user_profiles:${UUIDS[0]},${UUIDS[5]}::`,
      `auth:${UUIDS[0]},${UUIDS[5]}`,
      'absent:createdAssetIds,createdAuthRecoveryIds,createdJobIds,createdMediaIds,createdObjectPaths,createdSightingIds,createdUserIds,sightingRecoveryReferences',
      'close',
    ]);
    expect(calls.join('\n')).not.toMatch(/\*|truncate|before|after|example\.invalid/i);
  });

  it('fails closed when exact absence cannot be proven and still closes the connection', async () => {
    const close = vi.fn(async () => undefined);
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => []), recoverSightingIds: vi.fn(async () => []),
      removeObjects: vi.fn(), deleteRows: vi.fn(), deleteAuthUsers: vi.fn(),
      assertAbsent: vi.fn(async () => false), close,
    };
    await expect(cleanupHostedScenario(env(), scenario(), adapter)).rejects.toThrow('hosted_cleanup_failed');
    expect(close).toHaveBeenCalledOnce();
  });

  it('recovers hard-cancelled Auth and sighting IDs from durable pre-request markers', async () => {
    const deleted: string[] = [];
    const sightingRecoveryReferences = [{
      reporterId: UUIDS[0]!, clientDedupeKey: 'pilot-gate-2b-owner-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }];
    const assertAbsent = vi.fn(async (tracked: Required<PartialHostedScenario>) =>
      tracked.createdAuthRecoveryIds.length === 1 &&
      tracked.sightingRecoveryReferences.length === 1,
    );
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(),
      recoverAuthUserIds: vi.fn(async () => [UUIDS[0]!]),
      recoverSightingIds: vi.fn(async () => [UUIDS[1]!]),
      removeObjects: vi.fn(),
      deleteRows: vi.fn(async (table, ids) => { deleted.push(`${table}:${ids.join(',')}`); }),
      deleteAuthUsers: vi.fn(async (ids) => { deleted.push(`auth:${ids.join(',')}`); }),
      assertAbsent,
      close: vi.fn(async () => undefined),
    };
    await cleanupHostedScenario(env(), {
      createdAuthRecoveryIds: [UUIDS[7]!],
      sightingRecoveryReferences,
    }, adapter);
    expect(assertAbsent).toHaveBeenCalledWith(expect.objectContaining({ sightingRecoveryReferences }));
    expect(deleted).toEqual([
      'media_upload_jobs:', 'media_assets:', `sightings:${UUIDS[1]}`,
      `user_profiles:${UUIDS[0]}`, `auth:${UUIDS[0]}`,
    ]);
  });

  it('accepts authoritative absence after a provisional sighting recovery exception', async () => {
    const calls: string[] = [];
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => []),
      recoverSightingIds: vi.fn(async () => { calls.push('recover-sightings'); throw new Error('transient'); }),
      removeObjects: vi.fn(async () => { calls.push('objects'); }),
      deleteRows: vi.fn(async (table) => { calls.push(table); }),
      deleteAuthUsers: vi.fn(async () => { calls.push('auth'); }),
      assertAbsent: vi.fn(async () => { calls.push('absent'); return true; }),
      close: vi.fn(async () => { calls.push('close'); }),
    };
    await expect(cleanupHostedScenario(env(), scenario(), adapter)).resolves.toBeUndefined();
    expect(calls).toEqual([
      'recover-sightings', 'objects', 'media_upload_jobs', 'media_assets', 'sightings',
      'user_profiles', 'auth', 'absent', 'close',
    ]);
  });

  it('accepts authoritative absence after an invalid provisional sighting recovery result', async () => {
    const calls: string[] = [];
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => []),
      recoverSightingIds: vi.fn(async () => ['not-a-uuid']),
      removeObjects: vi.fn(async () => { calls.push('objects'); }),
      deleteRows: vi.fn(async (table) => { calls.push(table); }),
      deleteAuthUsers: vi.fn(async () => { calls.push('auth'); }),
      assertAbsent: vi.fn(async () => { calls.push('absent'); return true; }),
      close: vi.fn(async () => { calls.push('close'); }),
    };
    await expect(cleanupHostedScenario(env(), scenario(), adapter)).resolves.toBeUndefined();
    expect(calls).toEqual([
      'objects', 'media_upload_jobs', 'media_assets', 'sightings', 'user_profiles', 'auth', 'absent', 'close',
    ]);
  });

  it('accepts authoritative absence after a hostile malformed sighting recovery array', async () => {
    const calls: string[] = [];
    const cleanupScenario = scenario();
    const assertAbsent = vi.fn(async (tracked: Required<PartialHostedScenario>) => {
      calls.push('absent');
      expect(tracked.sightingRecoveryReferences).toEqual(cleanupScenario.sightingRecoveryReferences);
      return true;
    });
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => []),
      recoverSightingIds: vi.fn(async () => [Symbol('hostile')] as never),
      removeObjects: vi.fn(async () => { calls.push('objects'); }),
      deleteRows: vi.fn(async (table) => { calls.push(table); }),
      deleteAuthUsers: vi.fn(async () => { calls.push('auth'); }),
      assertAbsent, close: vi.fn(async () => { calls.push('close'); }),
    };
    await expect(cleanupHostedScenario(env(), cleanupScenario, adapter)).resolves.toBeUndefined();
    expect(calls).toEqual([
      'objects', 'media_upload_jobs', 'media_assets', 'sightings', 'user_profiles', 'auth', 'absent', 'close',
    ]);
    expect(assertAbsent).toHaveBeenCalledOnce();
  });

  it('copies a stateful sighting recovery array before cleanup selectors use it', async () => {
    const calls: string[] = [];
    const cleanupScenario = scenario();
    const recoveryResult: unknown[] = [];
    let recoveryReads = 0;
    Object.defineProperty(recoveryResult, '0', {
      configurable: true,
      enumerable: true,
      get: () => {
        recoveryReads += 1;
        return recoveryReads === 1 ? UUIDS[1]! : Symbol('hostile');
      },
    });
    const assertAbsent = vi.fn(async (tracked: Required<PartialHostedScenario>) => {
      calls.push('absent');
      expect(tracked.sightingRecoveryReferences).toEqual(cleanupScenario.sightingRecoveryReferences);
      return true;
    });
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => []),
      recoverSightingIds: vi.fn(async () => recoveryResult as never),
      removeObjects: vi.fn(async () => { calls.push('objects'); }),
      deleteRows: vi.fn(async (table) => { calls.push(table); }),
      deleteAuthUsers: vi.fn(async () => { calls.push('auth'); }),
      assertAbsent, close: vi.fn(async () => { calls.push('close'); }),
    };
    await expect(cleanupHostedScenario(env(), cleanupScenario, adapter)).resolves.toBeUndefined();
    expect(recoveryReads).toBe(1);
    expect(calls).toEqual([
      'objects', 'media_upload_jobs', 'media_assets', 'sightings', 'user_profiles', 'auth', 'absent', 'close',
    ]);
    expect(assertAbsent).toHaveBeenCalledOnce();
  });

  it('preserves durable sighting recovery references when the recovery adapter mutates its copy', async () => {
    const calls: string[] = [];
    const cleanupScenario = scenario();
    let recoveryReferences: readonly Readonly<{ reporterId: string; clientDedupeKey: string }>[] | undefined;
    const assertAbsent = vi.fn(async (tracked: Required<PartialHostedScenario>) => {
      calls.push('absent');
      expect(tracked.sightingRecoveryReferences).toEqual(cleanupScenario.sightingRecoveryReferences);
      expect(tracked.sightingRecoveryReferences).not.toBe(recoveryReferences);
      return true;
    });
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => []),
      recoverSightingIds: vi.fn(async (references) => {
        recoveryReferences = references;
        const mutable = references as Array<{ reporterId: string; clientDedupeKey: string }>;
        mutable[0]!.clientDedupeKey = 'pilot-gate-2b-owner-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
        mutable.splice(0, 1);
        throw new Error('hostile');
      }),
      removeObjects: vi.fn(async () => { calls.push('objects'); }),
      deleteRows: vi.fn(async (table) => { calls.push(table); }),
      deleteAuthUsers: vi.fn(async () => { calls.push('auth'); }),
      assertAbsent, close: vi.fn(async () => { calls.push('close'); }),
    };
    await expect(cleanupHostedScenario(env(), cleanupScenario, adapter)).resolves.toBeUndefined();
    expect(calls).toEqual([
      'objects', 'media_upload_jobs', 'media_assets', 'sightings', 'user_profiles', 'auth', 'absent', 'close',
    ]);
    expect(assertAbsent).toHaveBeenCalledOnce();
  });

  it('contains a stateful Auth recovery array without suppressing recover_auth', async () => {
    const calls: string[] = [];
    const authResult: unknown[] = [];
    let authReads = 0;
    Object.defineProperty(authResult, '0', {
      configurable: true,
      enumerable: true,
      get: () => {
        authReads += 1;
        return authReads === 1 ? Symbol('hostile') : UUIDS[0]!;
      },
    });
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => authResult as never),
      recoverSightingIds: vi.fn(async () => []),
      removeObjects: vi.fn(async () => { calls.push('objects'); }),
      deleteRows: vi.fn(async (table) => { calls.push(table); }),
      deleteAuthUsers: vi.fn(async () => { calls.push('auth'); }),
      assertAbsent: vi.fn(async () => { calls.push('absent'); return true; }),
      close: vi.fn(async () => { calls.push('close'); }),
    };
    try {
      await cleanupHostedScenario(env(), scenario(), adapter);
      throw new Error('expected cleanup failure');
    } catch (error) {
      expect(cleanupOperationIdsFromError(error)).toEqual(['recover_auth']);
      expect(String(error)).not.toMatch(/hostile/);
    }
    expect(authReads).toBe(1);
    expect(calls).toEqual([
      'objects', 'media_upload_jobs', 'media_assets', 'sightings', 'user_profiles', 'auth', 'absent', 'close',
    ]);
  });

  it.each([
    ['returns false', async () => false],
    ['throws', async () => { throw new Error('transient'); }],
    ['returns a truthy object', async () => ({}) as never],
    ['returns truthy one', async () => 1 as never],
    ['returns a truthy string', async () => 'true' as never],
  ])('retains provisional sighting recovery failure when absence proof %s', async (_label, assertAbsent) => {
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => []),
      recoverSightingIds: vi.fn(async () => { throw new Error('transient'); }),
      removeObjects: vi.fn(), deleteRows: vi.fn(), deleteAuthUsers: vi.fn(), assertAbsent,
      close: vi.fn(),
    };
    try {
      await cleanupHostedScenario(env(), scenario(), adapter);
      throw new Error('expected cleanup failure');
    } catch (error) {
      expect(cleanupOperationIdsFromError(error)).toEqual(['recover_sighting', 'absence_proof']);
      expect(String(error)).not.toMatch(/transient/);
    }
  });

  it('does not suppress Auth, deletion, or close failures after a successful absence proof', async () => {
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(),
      recoverAuthUserIds: vi.fn(async () => { throw new Error('transient'); }),
      recoverSightingIds: vi.fn(async () => []),
      removeObjects: vi.fn(async () => { throw new Error('transient'); }),
      deleteRows: vi.fn(), deleteAuthUsers: vi.fn(), assertAbsent: vi.fn(async () => true),
      close: vi.fn(async () => { throw new Error('transient'); }),
    };
    try {
      await cleanupHostedScenario(env(), scenario(), adapter);
      throw new Error('expected cleanup failure');
    } catch (error) {
      expect(cleanupOperationIdsFromError(error)).toEqual([
        'recover_auth', 'storage_remove', 'connection_close',
      ]);
      expect(String(error)).not.toMatch(/transient/);
    }
  });

  it('best-effort attempts every cleanup category and absence proof after transient failures', async () => {
    const calls: string[] = [];
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(),
      recoverAuthUserIds: vi.fn(async () => { calls.push('recover-auth'); throw new Error('transient'); }),
      recoverSightingIds: vi.fn(async () => { calls.push('recover-sightings'); return []; }),
      removeObjects: vi.fn(async () => { calls.push('objects'); throw new Error('transient'); }),
      deleteRows: vi.fn(async (table) => {
        calls.push(table);
        if (table === 'media_upload_jobs') throw new Error('transient');
      }),
      deleteAuthUsers: vi.fn(async () => { calls.push('auth'); }),
      assertAbsent: vi.fn(async () => { calls.push('absent'); return false; }),
      close: vi.fn(async () => { calls.push('close'); }),
    };
    await expect(cleanupHostedScenario(env(), scenario(), adapter)).rejects.toThrow('hosted_cleanup_failed');
    expect(calls).toEqual([
      'recover-auth', 'recover-sightings', 'objects', 'media_upload_jobs', 'media_assets',
      'sightings', 'user_profiles', 'auth', 'absent', 'close',
    ]);
  });

  it('returns deduplicated cleanup operation IDs in fixed execution order without raw errors', async () => {
    const calls: string[] = [];
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(),
      recoverAuthUserIds: vi.fn(async () => { calls.push('recover-auth'); throw new Error('Bearer secret'); }),
      recoverSightingIds: vi.fn(async () => { calls.push('recover-sightings'); throw new Error('https://hostile.invalid'); }),
      removeObjects: vi.fn(async () => { calls.push('objects'); throw new Error('transient'); }),
      deleteRows: vi.fn(async (table) => { calls.push(table); if (table !== 'sightings') throw new Error('transient'); }),
      deleteAuthUsers: vi.fn(async () => { calls.push('auth'); throw new Error('transient'); }),
      assertAbsent: vi.fn(async () => { calls.push('absent'); return false; }),
      close: vi.fn(async () => { calls.push('close'); throw new Error('transient'); }),
    };
    try {
      await cleanupHostedScenario(env(), scenario(), adapter);
      throw new Error('expected cleanup failure');
    } catch (error) {
      expect(cleanupOperationIdsFromError(error)).toEqual([
        'recover_auth', 'recover_sighting', 'storage_remove', 'jobs_delete', 'assets_delete',
        'profiles_delete', 'auth_delete', 'absence_proof', 'connection_close',
      ]);
      expect(String(error)).not.toMatch(/Bearer|https:|secret/);
    }
    expect(calls).toEqual([
      'recover-auth', 'recover-sightings', 'objects', 'media_upload_jobs', 'media_assets',
      'sightings', 'user_profiles', 'auth', 'absent', 'close',
    ]);
  });

  it('passes every durable denial-probe media ID to row cleanup and absence proof', async () => {
    const probe = UUIDS[7]!;
    const observed: string[][] = [];
    const adapter: HostedMaintenanceAdapter = {
      inspect: vi.fn(), recoverAuthUserIds: vi.fn(async () => []), recoverSightingIds: vi.fn(async () => []),
      removeObjects: vi.fn(),
      deleteRows: vi.fn(async (table, _ids, mediaIds = []) => {
        if (table === 'media_upload_jobs' || table === 'media_assets') observed.push([...mediaIds]);
      }),
      deleteAuthUsers: vi.fn(),
      assertAbsent: vi.fn(async (tracked) => {
        observed.push([...tracked.createdMediaIds]);
        return tracked.createdMediaIds.includes(probe);
      }),
      close: vi.fn(),
    };
    await cleanupHostedScenario(env(), { ...scenario(), createdMediaIds: [UUIDS[2]!, probe] }, adapter);
    expect(observed).toEqual([
      [UUIDS[2]!, probe], [UUIDS[2]!, probe], [UUIDS[2]!, probe],
    ]);
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
