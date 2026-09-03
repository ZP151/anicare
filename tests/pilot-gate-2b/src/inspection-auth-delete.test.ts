import { describe, expect, it, vi } from 'vitest';

const deletion = vi.hoisted(() => ({ response: { error: null as unknown }, throws: false }));

vi.mock('postgres', () => ({
  default: () => Object.assign(async () => [], { end: async () => undefined }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { deleteUser: vi.fn(async () => {
      if (deletion.throws) throw new Error('network failure');
      return deletion.response;
    }) } },
  }),
}));

import { createHostedMaintenanceAdapter } from './inspection.js';
import type { HostedGateEnvironment } from './environment.js';

const environment: HostedGateEnvironment = {
  apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co', anonKey: 'sb_publishable_test',
  serviceRoleKey: 'sb_secret_test', databaseUrl: 'postgresql://unused',
  preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'), sourceCommit: 'a'.repeat(40),
  workflowRunId: 1, workflowRunAttempt: 1,
};
const userId = '11111111-1111-4111-8111-111111111111';

describe('maintenance default Auth deletion replay', () => {
  it('treats only exact Supabase user_not_found as already absent', async () => {
    const adapter = createHostedMaintenanceAdapter(environment);
    deletion.throws = false;
    deletion.response = { error: { status: 404, code: 'user_not_found' } };
    await expect(adapter.deleteAuthUsers([userId])).resolves.toBeUndefined();
    await adapter.close();
  });

  it.each([
    { status: 404, code: 'other_error' }, { status: 401, code: 'user_not_found' },
    { status: undefined, code: 'user_not_found' }, { throws: true },
  ])('fails closed for near-miss or thrown Auth deletion errors %#', async (failure) => {
    const adapter = createHostedMaintenanceAdapter(environment);
    deletion.throws = failure.throws === true;
    deletion.response = { error: failure.throws ? null : failure };
    await expect(adapter.deleteAuthUsers([userId])).rejects.toThrow('auth_cleanup_failed');
    await adapter.close();
  });
});
