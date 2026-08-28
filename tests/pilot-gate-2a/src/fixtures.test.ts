import { describe, expect, it, vi } from 'vitest';

const authAdmin = vi.hoisted(() => ({ deleteUser: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { admin: authAdmin } })),
}));

import { destroySyntheticScenario } from './fixtures.js';

function localEnvironment() {
  const apiUrl = ['http:', '//127.0.0.1:54321'].join('');
  return {
    apiUrl,
    anonKey: ['local', 'anon'].join('-'),
    serviceRoleKey: ['local', 'service', 'role'].join('-'),
    databaseUrl: ['postgresql:', '//', 'postgres', ':', 'postgres', '@127.0.0.1:54322/postgres'].join(''),
    allowedOrigin: apiUrl,
    preciseLocationEncryptionKey: Buffer.alloc(32, 17).toString('base64'),
  };
}

describe('destroySyntheticScenario', () => {
  it('continues after a rejected delete and reports a sanitized bounded failure', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const strangerId = '22222222-2222-4222-8222-222222222222';
    authAdmin.deleteUser
      .mockRejectedValueOnce(new Error(['owner', 'delete', 'failure'].join('-')))
      .mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(destroySyntheticScenario(localEnvironment(), {
      owner: { id: ownerId, accessToken: ['owner', ownerId].join('-') },
      stranger: { id: strangerId, accessToken: ['stranger', strangerId].join('-') },
      ownerSightingId: '33333333-3333-4333-8333-333333333333',
      strangerSightingId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toThrow('{"scenario":"fixture-destroy","error":"auth-user-delete-failed","count":1}');

    expect(authAdmin.deleteUser).toHaveBeenCalledTimes(2);
    expect(authAdmin.deleteUser).toHaveBeenNthCalledWith(2, strangerId);
  });
});
