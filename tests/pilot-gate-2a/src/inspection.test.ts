import { describe, expect, it } from 'vitest';

import {
  combineMediaConcurrencyDatabaseInspection,
  combineMediaLifecycleDatabaseInspection,
  isMediaConcurrencyInspectionInput,
  isMediaLifecycleTimeControlInput,
  type MediaConcurrencyInspectionInput,
  type MediaLifecycleTimeControlInput,
} from './inspection.js';

const JOB_ID = '10000000-0000-4000-8000-000000000001';
const OWNER_ID = '10000000-0000-4000-8000-000000000002';
const MEDIA_ID = '10000000-0000-4000-8000-000000000003';
const SIGHTING_ID = '10000000-0000-4000-8000-000000000004';
const ASSET_ID = '10000000-0000-4000-8000-000000000005';

function candidate(value: unknown): MediaLifecycleTimeControlInput {
  return value as MediaLifecycleTimeControlInput;
}

function concurrencyCandidate(value: unknown): MediaConcurrencyInspectionInput {
  return value as MediaConcurrencyInspectionInput;
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

describe('media concurrency database inspection', () => {
  it('requires an expected asset UUID or an explicit assetless projection', () => {
    const base = { jobId: JOB_ID, ownerId: OWNER_ID, sightingId: SIGHTING_ID, mediaId: MEDIA_ID };

    expect([
      isMediaConcurrencyInspectionInput(concurrencyCandidate({ ...base, expectedMediaAssetId: ASSET_ID })),
      isMediaConcurrencyInspectionInput(concurrencyCandidate({ ...base, expectedMediaAssetId: null })),
      isMediaConcurrencyInspectionInput(concurrencyCandidate({ ...base })),
      isMediaConcurrencyInspectionInput(concurrencyCandidate({ ...base, expectedMediaAssetId: 'not-a-uuid' })),
      isMediaConcurrencyInspectionInput(concurrencyCandidate({ ...base, expectedMediaAssetId: ASSET_ID, sql: 'select 1' })),
    ]).toEqual([true, true, false, false, false]);
  });

  it('projects one canonical owner job and one tombstoned linked asset without exposing identifiers', () => {
    expect(combineMediaConcurrencyDatabaseInspection({
      job_count_for_media_id: 1,
      matching_owner_job_count: 1,
      distinct_owner_count: 1,
      distinct_object_path_count: 1,
      canonical_object_path_count: 1,
      target_job_status: 'deletion_pending',
      cleanup_claimed: false,
    }, {
      asset_count_for_media_id: 1,
      matching_owner_sighting_asset_count: 1,
      matching_job_asset_count: 1,
      matching_expected_asset_count: 1,
      active_quarantined_asset_count: 0,
      tombstoned_asset_count: 1,
    })).toEqual({
      jobCountForMediaId: 1,
      matchingOwnerJobCount: 1,
      distinctOwnerCount: 1,
      distinctObjectPathCount: 1,
      canonicalObjectPathCount: 1,
      assetCountForMediaId: 1,
      matchingOwnerSightingAssetCount: 1,
      matchingJobAssetCount: 1,
      matchingExpectedAssetCount: 1,
      activeQuarantinedAssetCount: 0,
      tombstonedAssetCount: 1,
      jobStatus: 'deletion_pending',
      cleanupClaimed: false,
    });
  });

  it('rejects count projections that cannot describe the selected media state', () => {
    expect(combineMediaConcurrencyDatabaseInspection({
      job_count_for_media_id: 1,
      matching_owner_job_count: 2,
      distinct_owner_count: 1,
      distinct_object_path_count: 1,
      canonical_object_path_count: 1,
      target_job_status: 'reserved',
      cleanup_claimed: false,
    }, {
      asset_count_for_media_id: 0,
      matching_owner_sighting_asset_count: 0,
      matching_job_asset_count: 0,
      matching_expected_asset_count: 0,
      active_quarantined_asset_count: 0,
      tombstoned_asset_count: 0,
    })).toBeNull();
  });

  it('rejects an expected asset count that exceeds the job-linked asset count', () => {
    expect(combineMediaConcurrencyDatabaseInspection({
      job_count_for_media_id: 1,
      matching_owner_job_count: 1,
      distinct_owner_count: 1,
      distinct_object_path_count: 1,
      canonical_object_path_count: 1,
      target_job_status: 'finalized',
      cleanup_claimed: false,
    }, {
      asset_count_for_media_id: 2,
      matching_owner_sighting_asset_count: 2,
      matching_job_asset_count: 1,
      matching_expected_asset_count: 2,
      active_quarantined_asset_count: 2,
      tombstoned_asset_count: 0,
    })).toBeNull();
  });
});
