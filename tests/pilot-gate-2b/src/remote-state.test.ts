import { describe, expect, it, vi } from 'vitest';

import { EXPECTED_REMOTE_MIGRATIONS, verifyRemoteMigrationInventory } from './remote-state.js';
import type { HostedGateEnvironment } from './environment.js';

function env(): HostedGateEnvironment {
  return {
    apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co', anonKey: 'sb_publishable_test',
    serviceRoleKey: 'sb_secret_test', databaseUrl: 'postgresql://unused',
    preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'), sourceCommit: 'a'.repeat(40),
    workflowRunId: 1, workflowRunAttempt: 1, firstOwnerFinalizeTimeoutMs: 5_000,
  };
}

describe('remote hosted deployment state', () => {
  it('requires the exact ordered migration version and name inventory', async () => {
    const query = vi.fn(async () => EXPECTED_REMOTE_MIGRATIONS.map((item) => ({ ...item })));
    const close = vi.fn(async () => undefined);
    await expect(verifyRemoteMigrationInventory(env(), { query, close })).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['missing', 'extra', 'renamed', 'transport'])('fails closed for %s remote state', async (kind) => {
    const rows = EXPECTED_REMOTE_MIGRATIONS.map((item) => ({ ...item }));
    if (kind === 'missing') rows.pop();
    if (kind === 'extra') rows.push({ version: '999999999999', name: 'extra' });
    if (kind === 'renamed') rows[0] = { ...rows[0]!, name: 'different' };
    const close = vi.fn(async () => undefined);
    const query = vi.fn(async () => {
      if (kind === 'transport') throw new Error('database URL must not leak');
      return rows;
    });
    await expect(verifyRemoteMigrationInventory(env(), { query, close })).rejects.toThrow('remote_migrations_invalid');
    expect(close).toHaveBeenCalledOnce();
  });
});
