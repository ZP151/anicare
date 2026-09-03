import { describe, expect, it, vi } from 'vitest';

import {
  HostedCheckFailure, hostedCheckIdFromError, hostedMediaStepFromError, hostedOwnerFinalizeOutcomeFromError,
  hostedOwnerStepFromError, ownerFinalizeOutcomeFromActorResult, runHostedChecks,
  type HostedCheckAdapter,
} from './checks.js';
import type { ActorResult } from '../../pilot-gate-2a/src/actors.js';
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

  it('preserves only a fixed media-staging step from a typed adapter failure', async () => {
    const fake = adapter({
      verifyMediaStaging: vi.fn(async () => {
        throw new HostedCheckFailure('media_staging', 'privacy_read_equivalence');
      }),
    });
    try {
      await runHostedChecks(env(), fake.implementation);
      throw new Error('expected hosted check failure');
    } catch (error) {
      expect(hostedCheckIdFromError(error)).toBe('media_staging');
      expect(hostedMediaStepFromError(error)).toBe('privacy_read_equivalence');
    }
  });

  it('preserves only a fixed owner-happy-path step from a typed adapter failure', async () => {
    const fake = adapter({
      runOwnerHappyPath: vi.fn(async () => {
        throw new HostedCheckFailure('owner_happy_path', undefined, 'replay');
      }),
    });
    try {
      await runHostedChecks(env(), fake.implementation);
      throw new Error('expected hosted check failure');
    } catch (error) {
      expect(hostedCheckIdFromError(error)).toBe('owner_happy_path');
      expect(hostedOwnerStepFromError(error)).toBe('replay');
      expect(hostedOwnerFinalizeOutcomeFromError(error)).toBeUndefined();
      expect(hostedMediaStepFromError(error)).toBeUndefined();
    }
  });

  it.each([
    [{ ok: false, stage: 'finalize', kind: 'network', status: null, code: 'network_error' }, 'network'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 401, code: 'authentication_required' }, 'http_401_authentication_required'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 403, code: 'media_not_found_or_forbidden' }, 'http_403_media_not_found_or_forbidden'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 403, code: 'media_transport_failed' }, 'http_403_unclassified'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 409, code: 'media_finalization_conflict' }, 'http_409_media_finalization_conflict'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 503, code: 'service_unavailable' }, 'http_503_service_unavailable'],
    [{ ok: false, stage: 'finalize', kind: 'http', status: 500, code: 'media_transport_failed' }, 'http_other'],
    [{ ok: false, stage: 'finalize', kind: 'invalid_response', status: null, code: 'invalid_response' }, 'invalid_response'],
  ] as const)('maps the bounded first finalization result %# to %s', (result, outcome) => {
    expect(ownerFinalizeOutcomeFromActorResult(result as ActorResult)).toBe(outcome);
  });

  it('suppresses malformed or successful finalization results without exposing their details', () => {
    expect(ownerFinalizeOutcomeFromActorResult({ ok: true, status: 200, mediaAssetId: 'asset' })).toBeUndefined();
    expect(ownerFinalizeOutcomeFromActorResult({
      ok: false, stage: 'finalize', kind: 'http', status: 'Bearer secret', code: 'https://hostile.invalid',
    } as never)).toBeUndefined();
  });

  it('propagates a fixed finalization outcome only from a typed owner-finalize failure', async () => {
    const fake = adapter({
      runOwnerHappyPath: vi.fn(async () => {
        throw new HostedCheckFailure(
          'owner_happy_path', undefined, 'finalize', 'http_409_media_finalization_conflict',
        );
      }),
    });
    try {
      await runHostedChecks(env(), fake.implementation);
      throw new Error('expected hosted check failure');
    } catch (error) {
      expect(hostedOwnerStepFromError(error)).toBe('finalize');
      expect(hostedOwnerFinalizeOutcomeFromError(error)).toBe('http_409_media_finalization_conflict');
    }
  });
});
