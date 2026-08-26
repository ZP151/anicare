import { nextUploadAttempt, type UploadJob } from './upload-job';

const now = new Date('2026-08-27T00:00:00.000Z');
const job: UploadJob = {
  state: 'uploading',
  attempts: 1,
  nextAttemptAt: null,
  lastError: null,
};

describe('private media upload retry policy', () => {
  it.each([
    [{ kind: 'network' } as const, 'network'],
    [{ kind: 'http', status: 408 } as const, 'http_408'],
    [{ kind: 'http', status: 429 } as const, 'http_429'],
    [{ kind: 'http', status: 503 } as const, 'http_503'],
  ])('schedules bounded retry for %j', (result, expectedError) => {
    expect(nextUploadAttempt(job, result, now, () => 0.5)).toEqual({
      state: 'waiting',
      attempts: 2,
      nextAttemptAt: '2026-08-27T00:00:02.000Z',
      lastError: expectedError,
    });
  });

  it.each([
    { kind: 'http', status: 400 } as const,
    { kind: 'http', status: 403 } as const,
    { kind: 'hash_mismatch' } as const,
    { kind: 'metadata_mismatch' } as const,
    { kind: 'version_mismatch' } as const,
  ])('requires user action for non-retryable outcome %j', (result) => {
    expect(nextUploadAttempt(job, result, now, () => 0.5)).toMatchObject({
      state: 'needs_user',
      attempts: 2,
      nextAttemptAt: null,
    });
  });

  it('caps retry attempts and does not schedule another upload', () => {
    expect(nextUploadAttempt({ ...job, attempts: 4 }, { kind: 'network' }, now, () => 0.5)).toEqual({
      state: 'needs_user',
      attempts: 5,
      nextAttemptAt: null,
      lastError: 'retry_limit_reached',
    });
  });

  it('clamps injected randomness before applying bounded jitter', () => {
    const veryLate = nextUploadAttempt(job, { kind: 'network' }, now, () => 99);
    const veryEarly = nextUploadAttempt(job, { kind: 'network' }, now, () => -99);

    expect(veryLate.nextAttemptAt).toBe('2026-08-27T00:00:03.000Z');
    expect(veryEarly.nextAttemptAt).toBe('2026-08-27T00:00:01.000Z');
  });

  it('uses neutral deterministic jitter when injected randomness is non-finite', () => {
    expect(nextUploadAttempt(job, { kind: 'network' }, now, () => Number.NaN).nextAttemptAt)
      .toBe('2026-08-27T00:00:02.000Z');
  });

  it.each([-2, 1.5, 6])('fails closed for invalid current attempt count %s', (attempts) => {
    expect(nextUploadAttempt({ ...job, attempts }, { kind: 'network' }, now, () => 0.5)).toEqual({
      state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'invalid_upload_attempt',
    });
  });

  it('fails closed for an invalid current state or clock', () => {
    expect(nextUploadAttempt({ ...job, state: 'hostile' as UploadJob['state'] }, { kind: 'network' }, now, () => 0.5).lastError)
      .toBe('invalid_upload_attempt');
    expect(nextUploadAttempt(job, { kind: 'network' }, new Date(Number.NaN), () => 0.5).lastError)
      .toBe('invalid_upload_attempt');
  });

  it.each([
    { kind: 'network' } as const,
    { kind: 'complete' } as const,
    { kind: 'quarantined' } as const,
  ])('rejects local_persisting as a transport attempt state for %j', (result) => {
    expect(nextUploadAttempt({ ...job, state: 'local_persisting' }, result, now, () => 0.5)).toEqual({
      state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'invalid_upload_attempt',
    });
  });

  it.each([600, Number.POSITIVE_INFINITY, 503.5, 99])('fails closed for invalid HTTP status %s', (status) => {
    expect(nextUploadAttempt(job, { kind: 'http', status }, now, () => 0.5)).toEqual({
      state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'invalid_upload_attempt',
    });
  });
});
