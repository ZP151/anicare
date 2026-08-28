import { describe, expect, it } from 'vitest';

import { createSyntheticScenario } from './fixtures.js';

describe('createSyntheticScenario', () => {
  it('fails closed before network setup when the test encryption key is absent', async () => {
    const original = process.env.PRECISE_LOCATION_ENCRYPTION_KEY;
    const localApi = ['http:', '//127.0.0.1:54321'].join('');
    const localDatabase = ['postgresql:', '//', 'postgres', ':', 'postgres', '@127.0.0.1:54322/postgres'].join('');
    try {
      delete process.env.PRECISE_LOCATION_ENCRYPTION_KEY;
      await expect(createSyntheticScenario({
        apiUrl: localApi,
        anonKey: ['local', 'anon'].join('-'),
        serviceRoleKey: ['local', 'service', 'role'].join('-'),
        databaseUrl: localDatabase,
        allowedOrigin: localApi,
      })).rejects.toThrow('fixture_encryption_key_not_configured');
    } finally {
      if (original === undefined) delete process.env.PRECISE_LOCATION_ENCRYPTION_KEY;
      else process.env.PRECISE_LOCATION_ENCRYPTION_KEY = original;
    }
  });
});
