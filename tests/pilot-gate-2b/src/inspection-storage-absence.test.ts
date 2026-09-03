import { describe, expect, it, vi } from 'vitest';

const sqlCalls = vi.hoisted((): Array<{ text: string; values: readonly unknown[] }> => []);
const trackedCount = vi.hoisted(() => ({ value: 0 }));
const exists = vi.hoisted(() => vi.fn(async () => {
  throw new Error('Storage SDK absence errors must not decide cleanup proof');
}));

vi.mock('postgres', () => ({
  default: () => {
    const sql = async (strings: TemplateStringsArray, ...values: readonly unknown[]) => {
      const text = strings.join('?');
      sqlCalls.push({ text, values });
      if (text.includes('select id::text as id from auth.users')) return [];
      if (text.includes('select sighting.id::text as id')) return [];
      if (text.includes('select (')) return [{ tracked_count: trackedCount.value }];
      if (text.includes('select count(*)::integer as tracked_count from public.sightings')) return [{ tracked_count: 0 }];
      return [];
    };
    sql.end = async () => undefined;
    return sql;
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ remove: async () => ({ error: null }), exists }) },
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
  }),
}));

import { cleanupHostedScenario } from './inspection.js';
import type { HostedGateEnvironment } from './environment.js';

const userId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';

const environment: HostedGateEnvironment = {
  apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co', anonKey: 'sb_publishable_test',
  serviceRoleKey: 'sb_secret_test', databaseUrl: 'postgresql://unused',
  preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'), sourceCommit: 'a'.repeat(40),
  workflowRunId: 1, workflowRunAttempt: 1,
};

describe('hosted cleanup storage absence proof', () => {
  it('proves exactly tracked staging paths absent in storage.objects without Storage SDK exists()', async () => {
    sqlCalls.length = 0;
    trackedCount.value = 0;
    exists.mockClear();
    const objectPath = `jobs/${jobId}.jpg`;
    await expect(cleanupHostedScenario(environment, {
      createdUserIds: [userId], createdObjectPaths: [objectPath],
    })).resolves.toBeUndefined();
    const absence = sqlCalls.find((call) => call.text.includes('storage.objects'));
    expect(absence?.text).toContain("bucket_id = 'media-staging'");
    expect(absence?.text).toContain('name = any(?::text[])');
    expect(absence?.values).toContainEqual([objectPath]);
    expect(exists).not.toHaveBeenCalled();
  });

  it('fails closed when storage.objects still contains an exactly tracked path', async () => {
    sqlCalls.length = 0;
    trackedCount.value = 1;
    const objectPath = `jobs/${jobId}.jpg`;
    await expect(cleanupHostedScenario(environment, {
      createdUserIds: [userId], createdObjectPaths: [objectPath],
    })).rejects.toThrow('hosted_cleanup_failed');
    expect(sqlCalls.some((call) => call.text.includes('storage.objects'))).toBe(true);
    expect(exists).not.toHaveBeenCalled();
    trackedCount.value = 0;
  });
});
