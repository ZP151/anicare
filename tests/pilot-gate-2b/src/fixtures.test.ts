import { describe, expect, it, vi } from 'vitest';

import { createHostedScenario, type HostedFixtureAdapter } from './fixtures.js';
import type { HostedGateEnvironment } from './environment.js';

const IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
] as const;

function env(): HostedGateEnvironment {
  return {
    apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co',
    anonKey: 'sb_publishable_test', serviceRoleKey: 'sb_secret_test',
    databaseUrl: 'postgresql://unused', preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'),
    sourceCommit: 'a'.repeat(40), workflowRunId: 1, workflowRunAttempt: 1, firstOwnerFinalizeTimeoutMs: 5_000,
  };
}

function adapter(failAt?: string) {
  let authIndex = 0;
  let sightingIndex = 2;
  const calls: string[] = [];
  const implementation: HostedFixtureAdapter = {
    createAuthUser: vi.fn(async (input) => {
      calls.push(`auth:${input.role}:${input.email.endsWith('@example.invalid')}:${input.password.length >= 32}:${
        /^[0-9a-f-]{36}$/i.test(input.recoveryId)}`);
      if (failAt === `auth:${input.role}`) throw new Error('secret detail');
      return IDS[authIndex++]!;
    }),
    signIn: vi.fn(async (input) => {
      calls.push(`sign-in:${input.role}`);
      return { id: IDS[input.role === 'owner' ? 0 : 1], accessToken: `access-${input.role}` };
    }),
    createAdultProfile: vi.fn(async (input) => {
      calls.push(`profile:${input.role}:${input.adultConfirmedAt.endsWith('Z')}`);
      if (failAt === `profile:${input.role}`) throw new Error('secret detail');
    }),
    createSighting: vi.fn(async (input) => {
      calls.push(`sighting:${input.role}:${input.latitude}:${input.longitude}:${input.synthetic}`);
      if (failAt === `sighting:${input.role}` || failAt === `sighting:${input.role}:ambiguous`) throw new Error('secret detail');
      return IDS[sightingIndex++]!;
    }),
    recoverSightingIds: vi.fn(async (references: readonly Readonly<{ reporterId: string; clientDedupeKey: string }>[]) => {
      calls.push(`recover:${references.map((item) => item.reporterId).join(',')}`);
      return failAt === 'sighting:owner:ambiguous' ? [IDS[2]] : [];
    }),
    deleteProfiles: vi.fn(async (ids) => { calls.push(`delete-profiles:${ids.join(',')}`); }),
    deleteSightings: vi.fn(async (ids) => { calls.push(`delete-sightings:${ids.join(',')}`); }),
    deleteAuthUsers: vi.fn(async (ids) => { calls.push(`delete-auth:${ids.join(',')}`); }),
    assertFixturesAbsent: vi.fn(async (tracked) => {
      calls.push(`absent:${tracked.sightingIds.join(',')}:${tracked.profileIds.join(',')}:${tracked.userIds.join(',')}`);
      return true;
    }),
  };
  return { implementation, calls };
}

describe('hosted synthetic fixtures', () => {
  it('creates two distinct confirmed adult actors and Singapore synthetic sightings', async () => {
    const fake = adapter();
    const scenario = await createHostedScenario(env(), fake.implementation, async (progress) => {
      fake.calls.push(`progress:${progress.kind}`);
    });
    expect(scenario).toEqual({
      owner: { id: IDS[0], accessToken: 'access-owner' },
      stranger: { id: IDS[1], accessToken: 'access-stranger' },
      ownerSightingId: IDS[2], strangerSightingId: IDS[3],
      createdUserIds: [IDS[0], IDS[1]], createdObjectPaths: [],
    });
    expect(fake.calls).toEqual(expect.arrayContaining([
      'auth:owner:true:true:true', 'auth:stranger:true:true:true',
      'profile:owner:true', 'profile:stranger:true',
      'sighting:owner:1.3001:103.8001:true',
      'sighting:stranger:1.3002:103.8002:true',
    ]));
    expect(fake.calls.indexOf('progress:auth-reference')).toBeLessThan(fake.calls.indexOf('auth:owner:true:true:true'));
    expect(fake.calls.indexOf('progress:sighting-reference')).toBeLessThan(
      fake.calls.indexOf('sighting:owner:1.3001:103.8001:true'),
    );
  });

  it('does not start an Auth side effect until the durable pre-request marker callback resolves', async () => {
    const fake = adapter();
    await expect(createHostedScenario(env(), fake.implementation, async (progress) => {
      if (progress.kind === 'auth-reference') throw new Error('ledger unavailable');
    })).rejects.toThrow('hosted_fixture_failed');
    expect(fake.implementation.createAuthUser).not.toHaveBeenCalled();
  });

  it('emits sighting recovery keys in the cleanup-ledger canonical format', async () => {
    const fake = adapter();
    const keys: string[] = [];
    await createHostedScenario(env(), fake.implementation, async (progress) => {
      if (progress.kind === 'sighting-reference') keys.push(progress.clientDedupeKey);
    });

    expect(keys).toHaveLength(2);
    expect(keys).toEqual(expect.arrayContaining([
      expect.stringMatching(/^pilot-gate-2b-owner-[a-f0-9]{32}$/),
      expect.stringMatching(/^pilot-gate-2b-stranger-[a-f0-9]{32}$/),
    ]));
  });

  it('cleans every exact fixture after a partial owner profile failure', async () => {
    const fake = adapter('profile:owner');
    await expect(createHostedScenario(env(), fake.implementation)).rejects.toThrow('hosted_fixture_failed');
    expect(fake.calls.slice(-5)).toEqual([
      'recover:',
      'delete-sightings:',
      `delete-profiles:${IDS[0]}`,
      `delete-auth:${IDS[0]}`,
      `absent::${IDS[0]}:${IDS[0]}`,
    ]);
    expect(fake.calls.join('\n')).not.toMatch(/\*|@example\.invalid|secret detail/);
  });

  it.each(['auth:stranger', 'profile:stranger', 'sighting:owner', 'sighting:stranger'])
    ('cleans only exact tracked IDs after failure at %s', async (boundary) => {
      const fake = adapter(boundary);
      await expect(createHostedScenario(env(), fake.implementation)).rejects.toThrow('hosted_fixture_failed');
      const cleanup = fake.calls.filter((call) => call.startsWith('delete-'));
      expect(cleanup).toHaveLength(3);
      expect(cleanup.join('\n')).not.toMatch(/\*|example\.invalid|before|after|domain/i);
    });

  it('deletes and proves absence of the owner sighting when stranger sighting creation fails', async () => {
    const fake = adapter('sighting:stranger');
    await expect(createHostedScenario(env(), fake.implementation)).rejects.toThrow('hosted_fixture_failed');
    expect(fake.calls.slice(-5)).toEqual([
      `recover:${IDS[1]},${IDS[0]}`,
      `delete-sightings:${IDS[2]}`,
      `delete-profiles:${IDS[1]},${IDS[0]}`,
      `delete-auth:${IDS[1]},${IDS[0]}`,
      `absent:${IDS[2]}:${IDS[1]},${IDS[0]}:${IDS[1]},${IDS[0]}`,
    ]);
  });

  it('recovers an exact dedupe-key sighting after an ambiguous create failure before deleting it', async () => {
    const fake = adapter('sighting:owner:ambiguous');
    await expect(createHostedScenario(env(), fake.implementation)).rejects.toThrow('hosted_fixture_failed');
    expect(fake.calls.slice(-5)).toEqual([
      `recover:${IDS[0]}`,
      `delete-sightings:${IDS[2]}`,
      `delete-profiles:${IDS[1]},${IDS[0]}`,
      `delete-auth:${IDS[1]},${IDS[0]}`,
      `absent:${IDS[2]}:${IDS[1]},${IDS[0]}:${IDS[1]},${IDS[0]}`,
    ]);
  });
});
