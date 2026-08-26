import { describe, expect, it } from 'vitest';

import {
  UPLOAD_CREDENTIAL_VALIDITY_MS,
  cleanupAction,
  deriveUploadCredentialExpiry,
  selectFairCleanupJobs,
  type CleanupCandidate,
} from './media-staging-lifecycle.js';

const now = new Date('2026-08-27T00:00:00.000Z');

function candidate(overrides: Partial<CleanupCandidate> = {}): CleanupCandidate {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'reserved',
    reservationExpiresAt: new Date('2026-08-26T23:50:00.000Z'),
    uploadCredentialExpiresAt: new Date('2026-08-27T02:00:00.000Z'),
    nextCleanupAt: new Date('2026-08-26T23:50:00.000Z'),
    cleanupClaimedAt: null,
    mediaDeletedAt: null,
    ...overrides,
  };
}

describe('media staging lifecycle', () => {
  it('models the platform signed-upload lifetime separately from a ten-minute reservation', () => {
    expect(deriveUploadCredentialExpiry(now)).toEqual(new Date(now.getTime() + UPLOAD_CREDENTIAL_VALIDITY_MS));
  });

  it('keeps a finalized deleted object while a non-upsert upload token could replay, then purges it', () => {
    const deleting = candidate({
      status: 'deletion_pending',
      mediaDeletedAt: new Date('2026-08-26T23:59:00.000Z'),
    });
    expect(cleanupAction(deleting, now)).toBe('defer_delete');
    expect(cleanupAction(deleting, new Date('2026-08-27T02:05:00.000Z'))).toBe('remove_and_purge');
  });

  it('purges active finalized bookkeeping only after credential expiry while retaining its quarantined object', () => {
    const active = candidate({ status: 'finalized', mediaDeletedAt: null });
    expect(cleanupAction(active, now)).toBe('none');
    expect(cleanupAction(active, new Date('2026-08-27T02:05:00.000Z'))).toBe('purge_bookkeeping');
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
