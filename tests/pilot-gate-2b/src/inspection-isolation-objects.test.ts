import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => {
  const sql = Object.assign(async () => [], { end: vi.fn(async () => undefined) });
  return { exists: vi.fn(), sql };
});

vi.mock('postgres', () => ({ default: () => boundary.sql }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: { from: () => ({ exists: boundary.exists }) } }),
}));

import { createHostedMaintenanceAdapter, hostedIsolationStepFromError } from './inspection.js';
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

const absentObjectError = {
  __isStorageError: true,
  name: 'StorageUnknownError',
  message: 'The resource was not found',
  originalError: { status: 404 },
};

beforeEach(() => {
  boundary.exists.mockReset();
  boundary.sql.end.mockClear();
});

describe('maintenance adapter isolation object inspection', () => {
  it('normalizes an absent object result to false in observed-path order', async () => {
    boundary.exists
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: absentObjectError });
    const adapter = createHostedMaintenanceAdapter(environment);

    await expect(adapter.inspectIsolation(isolationInput)).resolves.toEqual({
      jobs: [], assets: [], objectExists: [true, false],
    });

    await adapter.close();
  });

  it.each([
    ['a present object paired with an error', { data: true, error: absentObjectError }],
    ['a malformed object result', { data: 'false', error: null }],
    ['a false result without the SDK absence error', { data: false, error: null }],
  ])('fails closed for %s', async (_label, response) => {
    boundary.exists.mockResolvedValueOnce(response);
    const adapter = createHostedMaintenanceAdapter(environment);

    try {
      await adapter.inspectIsolation(isolationInput);
      throw new Error('expected isolation object failure');
    } catch (error) {
      expect(hostedIsolationStepFromError(error)).toBe('isolation_objects');
    }

    await adapter.close();
  });

  it('fails closed when object inspection throws', async () => {
    boundary.exists.mockRejectedValueOnce(new Error('network failure'));
    const adapter = createHostedMaintenanceAdapter(environment);

    try {
      await adapter.inspectIsolation(isolationInput);
      throw new Error('expected isolation object failure');
    } catch (error) {
      expect(hostedIsolationStepFromError(error)).toBe('isolation_objects');
    }

    await adapter.close();
  });
});
