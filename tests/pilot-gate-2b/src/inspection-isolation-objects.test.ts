import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => {
  const responses = new Map<string, unknown>();
  const sql = Object.assign(async () => [], { end: vi.fn(async () => undefined) });
  const exists = vi.fn(async (path: string) => {
    if (!responses.has(path)) throw new Error('unexpected_storage_path');
    return responses.get(path);
  });
  return { exists, responses, sql };
});

vi.mock('postgres', () => ({ default: () => boundary.sql }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ exists: boundary.exists }) } }),
}));

import { createHostedMaintenanceAdapter } from './inspection.js';
import type { HostedGateEnvironment } from './environment.js';

const environment: HostedGateEnvironment = {
  apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co', anonKey: 'sb_publishable_test',
  serviceRoleKey: 'sb_secret_test', databaseUrl: 'postgresql://unused',
  preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'), sourceCommit: 'a'.repeat(40),
  workflowRunId: 1, workflowRunAttempt: 1,
};

const isolationInput = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  strangerId: '22222222-2222-4222-8222-222222222222',
  ownerSightingId: '33333333-3333-4333-8333-333333333333',
  strangerSightingId: '44444444-4444-4444-8444-444444444444',
  mediaIds: ['55555555-5555-4555-8555-555555555555'],
  observedObjectPaths: [
    'jobs/66666666-6666-4666-8666-666666666666.jpg',
    'jobs/77777777-7777-4777-8777-777777777777.jpg',
  ],
};
const [ownerObjectPath, strangerObjectPath] = isolationInput.observedObjectPaths;

function storageUnknownError(status: number): Error & { __isStorageError: true; originalError: { status: number } } {
  return Object.assign(new Error('Storage request failed'), {
    __isStorageError: true as const,
    name: 'StorageUnknownError',
    originalError: { status },
  });
}

const absentObjectError = storageUnknownError(404);

function setObjectResults(ownerResult: unknown, strangerResult: unknown = { data: true, error: null }) {
  boundary.responses.set(ownerObjectPath!, ownerResult);
  boundary.responses.set(strangerObjectPath!, strangerResult);
}

beforeEach(() => {
  boundary.responses.clear();
  boundary.exists.mockClear();
  boundary.sql.end.mockClear();
});

describe('maintenance adapter isolation object inspection', () => {
  it('normalizes an absent object result to false in observed-path order', async () => {
    setObjectResults(
      { data: true, error: null },
      { data: false, error: absentObjectError },
    );
    const adapter = createHostedMaintenanceAdapter(environment);

    await expect(adapter.inspectIsolation(isolationInput)).resolves.toEqual({
      jobs: [], assets: [], objectExists: [true, false],
    });
    expect(boundary.exists).toHaveBeenCalledTimes(2);
    expect(boundary.exists).toHaveBeenNthCalledWith(1, ownerObjectPath);
    expect(boundary.exists).toHaveBeenNthCalledWith(2, strangerObjectPath);

    await adapter.close();
  });

  it('normalizes a 400 absent object result to false', async () => {
    setObjectResults(
      { data: false, error: storageUnknownError(400) },
      { data: true, error: null },
    );
    const adapter = createHostedMaintenanceAdapter(environment);

    await expect(adapter.inspectIsolation(isolationInput)).resolves.toEqual({
      jobs: [], assets: [], objectExists: [false, true],
    });

    await adapter.close();
  });

  it.each([
    ['a present object paired with an error', { data: true, error: absentObjectError }],
    ['a malformed object result', { data: 'false', error: null }],
    ['a false result without the SDK absence error', { data: false, error: null }],
    ['a false result paired with a generic error', { data: false, error: new Error('network failure') }],
    ['a false result paired with a non-absence Storage error', {
      data: false, error: storageUnknownError(500),
    }],
    ['a false 404 result with a wrong Storage marker', {
      data: false, error: {
        __isStorageError: false, name: 'StorageUnknownError', originalError: { status: 404 },
      },
    }],
    ['a false 404 result with a missing Storage marker', {
      data: false, error: { name: 'StorageUnknownError', originalError: { status: 404 } },
    }],
    ['a false 404 result with a wrong error name', {
      data: false, error: {
        __isStorageError: true, name: 'StorageApiError', originalError: { status: 404 },
      },
    }],
    ['a false 404 result with a missing error name', {
      data: false, error: { __isStorageError: true, originalError: { status: 404 } },
    }],
  ])('fails closed for %s', async (_label, response) => {
    setObjectResults(response);
    const adapter = createHostedMaintenanceAdapter(environment);

    await expect(adapter.inspectIsolation(isolationInput)).rejects.toMatchObject({
      isolationStep: 'isolation_objects',
    });

    await adapter.close();
  });

  it('fails closed when object inspection throws', async () => {
    boundary.exists.mockRejectedValueOnce(new Error('network failure'));
    const adapter = createHostedMaintenanceAdapter(environment);

    await expect(adapter.inspectIsolation(isolationInput)).rejects.toMatchObject({
      isolationStep: 'isolation_objects',
    });

    await adapter.close();
  });
});
