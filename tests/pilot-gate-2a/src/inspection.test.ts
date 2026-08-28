import { describe, expect, it } from 'vitest';

import {
  combineMediaLifecycleDatabaseInspection,
  isMediaLifecycleTimeControlInput,
  type MediaLifecycleTimeControlInput,
} from './inspection.js';

const JOB_ID = '10000000-0000-4000-8000-000000000001';
const OWNER_ID = '10000000-0000-4000-8000-000000000002';
const MEDIA_ID = '10000000-0000-4000-8000-000000000003';

function candidate(value: unknown): MediaLifecycleTimeControlInput {
  return value as MediaLifecycleTimeControlInput;
}

describe('media lifecycle time control input', () => {
  it('accepts only named timestamp operations bound to three UUIDs', () => {
    const base = { jobId: JOB_ID, ownerId: OWNER_ID, mediaId: MEDIA_ID };
    const tableName = ['private', 'media_upload_jobs'].join('.');
    const arbitraryStatement = ['select', '1'].join(' ');

    expect([
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation' })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'schedule_cleanup_now' })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: tableName })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: arbitraryStatement })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', table: tableName })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', sql: arbitraryStatement })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', jobId: 'not-a-uuid' })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', ownerId: 'not-a-uuid' })),
      isMediaLifecycleTimeControlInput(candidate({ ...base, operation: 'expire_reservation', mediaId: 'not-a-uuid' })),
    ]).toEqual([true, true, false, false, false, false, false, false, false]);
  });
});

describe('media lifecycle database inspection', () => {
  it('keeps the owner-media asset count independent from the job asset link', () => {
    expect(combineMediaLifecycleDatabaseInspection({
      job_count: 1,
      job_status: 'deletion_pending',
      reservation_expired: false,
      upload_credential_watermark_in_future: true,
      cleanup_scheduled_in_future: true,
      cleanup_claimed: false,
    }, {
      asset_count: 1,
      asset_tombstoned: true,
    })).toEqual({
      jobCount: 1,
      assetCount: 1,
      jobStatus: 'deletion_pending',
      reservationExpired: false,
      uploadCredentialWatermarkInFuture: true,
      cleanupScheduledInFuture: true,
      cleanupClaimed: false,
      assetTombstoned: true,
    });
  });
});
