import { describe, expect, it, vi } from 'vitest';

import { hostedCheckIdFromError, runHostedChecks, type HostedCheckAdapter } from './checks.js';
import type { HostedGateEnvironment } from './environment.js';

function env(): HostedGateEnvironment {
  return {
    apiUrl: 'https://fhugdtpjbgiatqhvjioy.supabase.co', anonKey: 'sb_publishable_test',
    serviceRoleKey: 'sb_secret_test', databaseUrl: 'postgresql://unused',
    preciseLocationEncryptionKey: Buffer.alloc(32).toString('base64'), sourceCommit: 'a'.repeat(40),
    workflowRunId: 1, workflowRunAttempt: 1,
  };
}

function adapter(overrides: Partial<HostedCheckAdapter> = {}) {
  const order: string[] = [];
  const base: HostedCheckAdapter = {
    verifyAuthRedirects: vi.fn(async (input) => {
      order.push('auth');
      return input.siteUrl === 'animalhelper://' &&
        JSON.stringify(input.additionalRedirectUrls) === JSON.stringify(['animalhelper://auth/callback']);
    }),
    verifyMediaStaging: vi.fn(async (input) => {
      order.push('staging');
      return input.bucket === 'media-staging' && input.public === false &&
        input.fileSizeLimit === 20 * 1024 * 1024 && input.allowedMimeTypes.join(',') === 'image/jpeg';
    }),
    verifyPublicKeyOrigin: vi.fn(async (origin) => { order.push('origin'); return origin === env().apiUrl; }),
    runOwnerHappyPath: vi.fn(async () => { order.push('owner'); return true; }),
    verifyCrossOwnerIsolation: vi.fn(async () => { order.push('isolation'); return true; }),
  };
  return { implementation: { ...base, ...overrides }, order };
}

describe('hosted check coordinator', () => {
  it('runs the five fixed checks serially and returns only passed evidence values', async () => {
    const fake = adapter();
    await expect(runHostedChecks(env(), fake.implementation)).resolves.toEqual({
      authRedirectCheck: 'passed', mediaStagingCheck: 'passed', publicKeyOriginCheck: 'passed',
      syntheticOwnerHappyPath: 'passed', crossOwnerIsolation: 'passed',
    });
    expect(fake.order).toEqual(['auth', 'origin', 'owner', 'staging', 'isolation']);
  });

  it.each([
    'verifyAuthRedirects', 'verifyMediaStaging', 'verifyPublicKeyOrigin',
    'runOwnerHappyPath', 'verifyCrossOwnerIsolation',
  ] as const)('fails closed at %s and does not emit partial check values', async (method) => {
    const fake = adapter({ [method]: vi.fn(async () => false) });
    await expect(runHostedChecks(env(), fake.implementation)).rejects.toThrow('hosted_checks_failed');
    expect(fake.order.length).toBeLessThan(5);
  });

  it.each([
    ['verifyAuthRedirects', 'auth_redirect'],
    ['verifyPublicKeyOrigin', 'public_origin'],
    ['runOwnerHappyPath', 'owner_happy_path'],
    ['verifyMediaStaging', 'media_staging'],
    ['verifyCrossOwnerIsolation', 'cross_owner_isolation'],
  ] as const)('marks the fixed failing check %s without accepting adapter error text', async (method, checkId) => {
    const fake = adapter({ [method]: vi.fn(async () => { throw new Error('Bearer secret https://hostile.invalid'); }) });
    try {
      await runHostedChecks(env(), fake.implementation);
      throw new Error('expected hosted check failure');
    } catch (error) {
      expect(error).toHaveProperty('message', 'hosted_checks_failed');
      expect(hostedCheckIdFromError(error)).toBe(checkId);
    }
  });

  it('uses only public configuration constants for static assertions', async () => {
    const fake = adapter();
    await runHostedChecks(env(), fake.implementation);
    expect(fake.implementation.verifyAuthRedirects).toHaveBeenCalledWith({
      siteUrl: 'animalhelper://', additionalRedirectUrls: ['animalhelper://auth/callback'],
    });
    expect(fake.implementation.verifyMediaStaging).toHaveBeenCalledWith({
      bucket: 'media-staging', public: false, fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg'],
    });
    expect(fake.implementation.verifyPublicKeyOrigin).toHaveBeenCalledWith(env().apiUrl);
  });
});
