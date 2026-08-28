import { describe, expect, it } from 'vitest';

import {
  UPLOAD_CREDENTIAL_VALIDITY_MS,
  canonicalizeTimestamp,
  cleanupAction,
  deriveConservativeUploadCredentialUsableUntil,
  extendCredentialUsableUntilWatermark,
  rewriteVerifiedSignedUploadUrl,
  selectFairCleanupJobs,
  type CleanupCandidate,
} from './media-staging-lifecycle.js';

const now = new Date('2026-08-27T00:00:00.000Z');

function candidate(overrides: Partial<CleanupCandidate> = {}): CleanupCandidate {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'reserved',
    reservationExpiresAt: new Date('2026-08-26T23:50:00.000Z'),
    uploadCredentialUsableUntil: new Date('2026-08-27T02:00:00.000Z'),
    nextCleanupAt: new Date('2026-08-26T23:50:00.000Z'),
    cleanupClaimedAt: null,
    mediaDeletedAt: null,
    ...overrides,
  };
}

describe('media staging lifecycle', () => {
  it('reports a conservative credential usable-until from immediately before a delayed token mint', () => {
    const mintStartedAt = new Date('2026-08-27T00:00:00.000Z');
    const actualMintedAt = new Date('2026-08-27T00:00:30.000Z');
    const usableUntil = deriveConservativeUploadCredentialUsableUntil(mintStartedAt);
    expect(usableUntil).toEqual(new Date(mintStartedAt.getTime() + UPLOAD_CREDENTIAL_VALIDITY_MS));
    expect(usableUntil.getTime()).toBeLessThan(actualMintedAt.getTime() + UPLOAD_CREDENTIAL_VALIDITY_MS);
  });

  it('canonicalizes a PostgREST microsecond offset timestamp for the Edge response boundary', () => {
    expect(canonicalizeTimestamp('2026-08-27T12:34:56.123456+00:00'))
      .toBe('2026-08-27T12:34:56.123Z');
    expect(canonicalizeTimestamp('2026-08-27T12:34:56.1234567+00:00')).toBeNull();
  });

  it('rewrites only a verified internal Storage upload URL to the configured public origin', () => {
    const jobId = '11111111-2222-4333-8444-555555555555';
    const objectPath = `jobs/${jobId}.jpg`;
    const token = 'synthetic-upload-capability%scope';
    const internalSupabaseUrl = 'http://kong:8000';
    const allowedOrigin = 'http://127.0.0.1:54321';
    const expectedPath = `/storage/v1/object/upload/sign/media-staging/${objectPath}`;
    const rewritten = rewriteVerifiedSignedUploadUrl({
      internalSupabaseUrl,
      allowedOrigin,
      objectPath,
      signedUrl: `${internalSupabaseUrl}${expectedPath}?token=${encodeURIComponent(token)}`,
      token,
    });

    expect(rewritten !== null).toBe(true);
    if (rewritten === null) return;
    const parsed = new URL(rewritten);
    expect(parsed.origin).toBe(allowedOrigin);
    expect(parsed.pathname).toBe(expectedPath);
    expect(parsed.searchParams.size).toBe(1);
    expect(parsed.searchParams.get('token') === token).toBe(true);
    expect(rewritten === `${allowedOrigin}${expectedPath}?token=${encodeURIComponent(token)}`).toBe(true);
  });

  it.each([
    ['untrusted source origin', 'http://untrusted.invalid:8000/storage/v1/object/upload/sign/media-staging/jobs/11111111-2222-4333-8444-555555555555.jpg?token=synthetic-upload-capability_123'],
    ['wrong object path', 'http://kong:8000/storage/v1/object/upload/sign/media-staging/jobs/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg?token=synthetic-upload-capability_123'],
    ['additional query parameter', 'http://kong:8000/storage/v1/object/upload/sign/media-staging/jobs/11111111-2222-4333-8444-555555555555.jpg?token=synthetic-upload-capability_123&download=true'],
    ['different capability', 'http://kong:8000/storage/v1/object/upload/sign/media-staging/jobs/11111111-2222-4333-8444-555555555555.jpg?token=different-capability'],
    ['fragment', 'http://kong:8000/storage/v1/object/upload/sign/media-staging/jobs/11111111-2222-4333-8444-555555555555.jpg?token=synthetic-upload-capability_123#fragment'],
    ['relative URL', '/storage/v1/object/upload/sign/media-staging/jobs/11111111-2222-4333-8444-555555555555.jpg?token=synthetic-upload-capability_123'],
  ])('rejects a signed upload URL with %s', (_case, signedUrl) => {
    expect(rewriteVerifiedSignedUploadUrl({
      internalSupabaseUrl: 'http://kong:8000',
      allowedOrigin: 'http://127.0.0.1:54321',
      objectPath: 'jobs/11111111-2222-4333-8444-555555555555.jpg',
      signedUrl,
      token: 'synthetic-upload-capability_123',
    })).toBeNull();
  });

  it.each([
    ['internal path', 'http://kong:8000/rest/v1', 'http://127.0.0.1:54321'],
    ['internal credentials', 'http://user@kong:8000', 'http://127.0.0.1:54321'],
    ['public trailing slash', 'http://kong:8000', 'http://127.0.0.1:54321/'],
    ['public query', 'http://kong:8000', 'http://127.0.0.1:54321?source=internal'],
    ['unsupported public protocol', 'http://kong:8000', 'ftp://127.0.0.1:54321'],
  ])('rejects a non-canonical %s origin', (_case, internalSupabaseUrl, allowedOrigin) => {
    const objectPath = 'jobs/11111111-2222-4333-8444-555555555555.jpg';
    const token = 'synthetic-upload-capability_123';
    expect(rewriteVerifiedSignedUploadUrl({
      internalSupabaseUrl,
      allowedOrigin,
      objectPath,
      signedUrl: `http://kong:8000/storage/v1/object/upload/sign/media-staging/${objectPath}?token=${token}`,
      token,
    })).toBeNull();
  });

  it.each([
    ['non-canonical object path', 'jobs/../outside.jpg', 'synthetic-upload-capability_123'],
    ['empty capability', 'jobs/11111111-2222-4333-8444-555555555555.jpg', ''],
    ['control character in capability', 'jobs/11111111-2222-4333-8444-555555555555.jpg', 'synthetic\ncapability'],
  ])('rejects a %s even when the signed URL otherwise agrees', (_case, objectPath, token) => {
    expect(rewriteVerifiedSignedUploadUrl({
      internalSupabaseUrl: 'http://kong:8000',
      allowedOrigin: 'http://127.0.0.1:54321',
      objectPath,
      signedUrl: `http://kong:8000/storage/v1/object/upload/sign/media-staging/${objectPath}?token=${encodeURIComponent(token)}`,
      token,
    })).toBeNull();
  });

  it('returns each overlapping mint its own conservative bound while the cleanup watermark only grows', () => {
    const delayedOlderRequestBound = deriveConservativeUploadCredentialUsableUntil(new Date('2026-08-27T00:00:00.000Z'));
    const newerRequestBound = deriveConservativeUploadCredentialUsableUntil(new Date('2026-08-27T00:00:30.000Z'));

    const afterNewerRequest = extendCredentialUsableUntilWatermark(null, newerRequestBound);
    const afterDelayedOlderRequest = extendCredentialUsableUntilWatermark(afterNewerRequest, delayedOlderRequestBound);

    expect(delayedOlderRequestBound.toISOString()).toBe('2026-08-27T02:00:00.000Z');
    expect(newerRequestBound.toISOString()).toBe('2026-08-27T02:00:30.000Z');
    expect(afterDelayedOlderRequest).toEqual(newerRequestBound);
  });

  it('keeps a finalized deleted object while a non-upsert upload token could replay, then purges it', () => {
    const deleting = candidate({
      status: 'deletion_pending',
      mediaDeletedAt: new Date('2026-08-26T23:59:00.000Z'),
    });
    expect(cleanupAction(deleting, now)).toBe('defer_delete');
    expect(cleanupAction(deleting, new Date('2026-08-27T02:05:00.000Z'))).toBe('remove_and_purge');
  });

  it('retains active finalized bookkeeping after credential expiry so later logical deletion has a cleanup record', () => {
    const active = candidate({ status: 'finalized', mediaDeletedAt: null });
    expect(cleanupAction(active, now)).toBe('none');
    expect(cleanupAction(active, new Date('2026-08-27T02:05:00.000Z'))).toBe('none');
  });

  it('retries unfinalized cleanup while a token can replay, then terminally purges the job', () => {
    const unfinalized = candidate();
    expect(cleanupAction(unfinalized, now)).toBe('remove_and_retry');
    expect(cleanupAction(unfinalized, new Date('2026-08-27T02:05:00.000Z'))).toBe('remove_and_purge');
  });

  it('claims due rows in next-cleanup order, including newer rows, without letting an old leased row starve them', () => {
    const oldLeased = candidate({
      id: '00000000-0000-4000-8000-000000000001',
      nextCleanupAt: new Date('2026-08-26T20:00:00.000Z'),
      cleanupClaimedAt: now,
    });
    const newerDue = candidate({
      id: '00000000-0000-4000-8000-000000000002',
      nextCleanupAt: new Date('2026-08-26T23:59:00.000Z'),
    });
    const oldestDue = candidate({
      id: '00000000-0000-4000-8000-000000000003',
      nextCleanupAt: new Date('2026-08-26T21:00:00.000Z'),
    });
    expect(selectFairCleanupJobs([newerDue, oldLeased, oldestDue], now, 2).map(({ id }) => id))
      .toEqual([oldestDue.id, newerDue.id]);
  });
});
