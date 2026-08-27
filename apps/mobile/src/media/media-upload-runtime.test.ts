import { createMediaUploadRuntime } from './media-upload-runtime.native';
import { retryRecoverableMediaDrafts as retryOnWeb, uploadDraftMediaNow as uploadOnWeb } from './media-upload-runtime.web';
import type { MediaUploadClaim } from '../offline/draft-store';

const receipt = {
  sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1' as const,
  detectorVersions: { cats: 'unavailable' as const, people: 'unavailable' as const, plates: 'unavailable' as const },
  width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
};

function draft(id: string, state: 'upload_pending' | 'waiting' | 'uploading' | 'finalizing' | 'needs_user' = 'upload_pending', overrides: Record<string, unknown> = {}) {
  const active = state === 'uploading' || state === 'finalizing';
  return {
    id, notes: '', risk: 'normal' as const, mediaId: `media-${id.slice('draft-'.length)}`,
    sightingId: '12345678-1234-1234-1234-123456789abc',
    encryptedReviewedRef: `reviewed-media/media-${id.slice('draft-'.length)}.commit-12345678.agcm`,
    encryptionVersion: 'aes-256-gcm.v1' as const, receipt, revision: 0,
    uploadJob: {
      state, attempts: active ? 1 : 0,
      nextAttemptAt: state === 'waiting' ? '2026-08-27T00:00:00.000Z' : null,
      lastError: null, resumeState: state === 'waiting' ? 'uploading' : null,
      attemptStartedAt: active ? '2026-08-26T23:00:00.000Z' : null,
    },
    ...overrides,
  };
}

function runtimeHarness(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const drafts = new Map<string, any>();
  for (const current of (overrides.drafts as any[] ?? [draft('draft-12345678')])) drafts.set(current.id, current);
  const dependencies = {
    getAccessToken: jest.fn(async () => 'current-access-token'),
    listDrafts: jest.fn(async () => [...drafts.values()]),
    getDraft: jest.fn(async (id: string) => drafts.get(id) ?? null),
    claimAttempt: jest.fn(async (id: string) => ({ draftId: id } as MediaUploadClaim)),
    runAttempt: jest.fn(async (claim: MediaUploadClaim) => { calls.push(`run:${claim.draftId}`); return 'quarantined' as const; }),
    deleteCiphertext: jest.fn(async (reference: string) => { calls.push(`ciphertext:${reference}`); }),
    cleanupQuarantined: jest.fn(async (id: string, revision: number) => { calls.push(`row:${id}:${revision}`); }),
    now: () => new Date('2026-08-27T00:01:00.000Z'),
    leaseMs: 60_000,
    ...overrides,
  };
  return { calls, dependencies };
}

describe('native media upload runtime', () => {
  it('does not consume an attempt when there is no authenticated session', async () => {
    const run = runtimeHarness({ getAccessToken: jest.fn(async () => null) });
    const runtime = createMediaUploadRuntime(run.dependencies);

    await expect(runtime.uploadDraftMediaNow('draft-12345678')).resolves.toBe('not_ready');

    expect(run.dependencies.claimAttempt).not.toHaveBeenCalled();
    expect(run.dependencies.runAttempt).not.toHaveBeenCalled();
  });

  it('claims only due or expired media rows and processes a bounded sequential batch', async () => {
    const run = runtimeHarness({
      drafts: [
        draft('draft-11111111'), draft('draft-22222222', 'waiting', { uploadJob: { state: 'waiting', attempts: 1, nextAttemptAt: '2026-08-27T00:02:00.000Z', lastError: 'network', resumeState: 'uploading', attemptStartedAt: null } }),
        draft('draft-33333333', 'uploading', { uploadJob: { state: 'uploading', attempts: 1, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: '2026-08-27T00:00:30.000Z' } }),
        draft('draft-44444444', 'finalizing'), draft('draft-55555555', 'waiting'), draft('draft-66666666'),
      ],
      runAttempt: jest.fn(async (claim: MediaUploadClaim) => {
        run.calls.push(`start:${claim.draftId}`);
        await Promise.resolve();
        run.calls.push(`end:${claim.draftId}`);
        return 'waiting' as const;
      }),
    });
    const runtime = createMediaUploadRuntime(run.dependencies);

    await expect(runtime.retryRecoverableMediaDrafts()).resolves.toEqual(['waiting', 'waiting', 'waiting', 'waiting']);

    expect(run.dependencies.claimAttempt).toHaveBeenCalledTimes(4);
    expect(run.calls).toEqual([
      'start:draft-11111111', 'end:draft-11111111',
      'start:draft-44444444', 'end:draft-44444444',
      'start:draft-55555555', 'end:draft-55555555',
      'start:draft-66666666', 'end:draft-66666666',
    ]);
  });

  it('returns a stale CAS result without starting a second runner', async () => {
    const run = runtimeHarness({ runAttempt: jest.fn(async () => 'stale' as const) });
    const runtime = createMediaUploadRuntime(run.dependencies);

    await expect(runtime.uploadDraftMediaNow('draft-12345678')).resolves.toBe('stale');

    expect(run.dependencies.claimAttempt).toHaveBeenCalledTimes(1);
    expect(run.dependencies.runAttempt).toHaveBeenCalledTimes(1);
  });

  it('reports the durable queued state when a concurrent CAS runner wins the claim', async () => {
    const run = runtimeHarness({ claimAttempt: jest.fn(async () => null) });
    const runtime = createMediaUploadRuntime(run.dependencies);

    await expect(runtime.uploadDraftMediaNow('draft-12345678')).resolves.toBe('upload_pending');

    expect(run.dependencies.runAttempt).not.toHaveBeenCalled();
  });

  it('resumes terminal cleanup only after a durable quarantined state and ciphertext deletion', async () => {
    const run = runtimeHarness({
      drafts: [draft('draft-12345678', 'upload_pending', {
        revision: 7,
        uploadJob: { state: 'quarantined', attempts: 1, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: null },
      })],
    });
    const runtime = createMediaUploadRuntime(run.dependencies);

    await expect(runtime.uploadDraftMediaNow('draft-12345678')).resolves.toBe('quarantined');

    expect(run.dependencies.claimAttempt).not.toHaveBeenCalled();
    expect(run.calls).toEqual([
      'ciphertext:reviewed-media/media-12345678.commit-12345678.agcm',
      'row:draft-12345678:7',
    ]);
  });
});

describe('web media upload runtime', () => {
  it('fails closed without decrypting, reserving, PUTting, or claiming background work', async () => {
    await expect(uploadOnWeb('draft-12345678')).resolves.toBe('unavailable');
    await expect(retryOnWeb()).resolves.toEqual([]);
  });
});
