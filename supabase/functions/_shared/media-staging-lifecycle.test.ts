import { describe, expect, it } from 'vitest';

import {
  UPLOAD_CREDENTIAL_VALIDITY_MS,
  canonicalizeTimestamp,
  cleanupAction,
  deriveConservativeUploadCredentialUsableUntil,
  extendCredentialUsableUntilWatermark,
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
