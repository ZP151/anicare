import { nextUploadOutcome, type UploadJob } from './upload-job';

const now = new Date('2026-08-27T00:00:00.000Z');
const uploading: UploadJob = {
  state: 'uploading',
  attempts: 2,
  nextAttemptAt: null,
  lastError: null,
  resumeState: null,
  attemptStartedAt: '2026-08-26T23:59:30.000Z',
};

describe('private media upload outcome policy', () => {
  it.each([
    [{ kind: 'network' } as const, 'network'],
    [{ kind: 'http', status: 408 } as const, 'http_408'],
    [{ kind: 'http', status: 429 } as const, 'http_429'],
    [{ kind: 'http', status: 503 } as const, 'http_503'],
  ])('waits in the current resume phase without incrementing for %j', (result, expectedError) => {
    expect(nextUploadOutcome(uploading, result, now, () => 0.5)).toEqual({
      state: 'waiting',
      attempts: 2,
      nextAttemptAt: '2026-08-27T00:00:02.000Z',
      lastError: expectedError,
      resumeState: 'uploading',
      attemptStartedAt: null,
    });
  });

  it('retains finalizing as the retry phase after an uncertain finalize response', () => {
    expect(nextUploadOutcome({ ...uploading, state: 'finalizing' }, { kind: 'network' }, now, () => 0.5))
      .toMatchObject({ state: 'waiting', attempts: 2, resumeState: 'finalizing' });
  });

  it.each([
    { kind: 'http', status: 400 } as const,
    { kind: 'http', status: 403 } as const,
    { kind: 'hash_mismatch' } as const,
    { kind: 'metadata_mismatch' } as const,
    { kind: 'version_mismatch' } as const,
    { kind: 'local_media_corrupt' } as const,
  ])('requires user action without changing the claimed attempt count for %j', (result) => {
    expect(nextUploadOutcome(uploading, result, now, () => 0.5)).toMatchObject({
      state: 'needs_user',
      attempts: 2,
      nextAttemptAt: null,
      resumeState: null,
      attemptStartedAt: null,
    });
  });

  it('does not schedule attempt six after the fifth claimed attempt fails', () => {
    expect(nextUploadOutcome({ ...uploading, attempts: 5 }, { kind: 'network' }, now, () => 0.5)).toEqual({
      state: 'needs_user',
      attempts: 5,
      nextAttemptAt: null,
      lastError: 'retry_limit_reached',
      resumeState: null,
      attemptStartedAt: null,
    });
  });

  it('recognizes quarantined as the only transport success', () => {
    expect(nextUploadOutcome({ ...uploading, state: 'finalizing' }, { kind: 'quarantined' }, now, () => 0.5))
      .toEqual({
        state: 'quarantined', attempts: 2, nextAttemptAt: null, lastError: null,
        resumeState: null, attemptStartedAt: null,
      });
  });

  it('clamps injected randomness before applying bounded jitter', () => {
    expect(nextUploadOutcome(uploading, { kind: 'network' }, now, () => 99).nextAttemptAt)
      .toBe('2026-08-27T00:00:03.000Z');
    expect(nextUploadOutcome(uploading, { kind: 'network' }, now, () => -99).nextAttemptAt)
      .toBe('2026-08-27T00:00:01.000Z');
  });

  it.each([-2, 0, 1.5, 6])('fails closed for an invalid claimed attempt count %s', (attempts) => {
    expect(nextUploadOutcome({ ...uploading, attempts }, { kind: 'network' }, now, () => 0.5)).toEqual({
      state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'invalid_upload_attempt',
      resumeState: null, attemptStartedAt: null,
    });
  });

  it.each(['upload_pending', 'waiting', 'quarantined'] as const)('rejects %s as an active outcome phase', (state) => {
    expect(nextUploadOutcome({ ...uploading, state }, { kind: 'network' }, now, () => 0.5).lastError)
      .toBe('invalid_upload_attempt');
  });

  it('rejects an active snapshot without a durable lease timestamp', () => {
    expect(nextUploadOutcome(
      { ...uploading, attemptStartedAt: null }, { kind: 'network' }, now, () => 0.5,
    ).lastError).toBe('invalid_upload_attempt');
  });
});
