import { describe, expect, it, vi } from 'vitest';

const deletion = vi.hoisted(() => ({ response: { error: null as unknown } }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { deleteUser: vi.fn(async () => deletion.response) } },
  }),
}));

import { createHostedFixtureAdapter } from './fixtures.js';
import type { HostedGateEnvironment } from './environment.js';

const environment: HostedGateEnvironment = {
  apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co', anonKey: 'sb_publishable_test',
  serviceRoleKey: 'sb_secret_test', databaseUrl: 'postgresql://unused',
  preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'), sourceCommit: 'a'.repeat(40),
  workflowRunId: 1, workflowRunAttempt: 1, mode: 'correctness', finalizeTimeoutMs: 10_000,
};
const userId = '11111111-1111-4111-8111-111111111111';

describe('fixture default Auth deletion replay', () => {
  it('treats only exact Supabase user_not_found as already absent', async () => {
    const adapter = createHostedFixtureAdapter(environment);
    deletion.response = { error: { status: 404, code: 'user_not_found' } };
    await expect(adapter.deleteAuthUsers([userId])).resolves.toBeUndefined();
  });

  it.each([
    { status: 404, code: 'other_error' }, { status: 400, code: 'user_not_found' },
    { status: 500, code: 'user_not_found' }, { status: undefined, code: undefined },
  ])('fails closed for near-miss Auth deletion errors %#', async (error) => {
    const adapter = createHostedFixtureAdapter(environment);
    deletion.response = { error };
    await expect(adapter.deleteAuthUsers([userId])).rejects.toThrow('auth_cleanup_failed');
  });
});
