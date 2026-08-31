import { describe, expect, it, vi } from 'vitest';

import {
  processLegacyMediaDeletionJobs,
  type LegacyMediaDeletionJob,
} from './legacy-media-cleanup.js';

const baseJob: LegacyMediaDeletionJob = {
  job_id: '00000000-0000-4000-8000-000000000801',
  media_id: '00000000-0000-4000-8000-000000000802',
  storage_bucket: 'public-media',
  expected_owner_id: '00000000-0000-4000-8000-000000000801',
  storage_path: '00000000-0000-4000-8000-000000000801/My photo 猫.jpg',
  cleanup_claim_id: '00000000-0000-4000-8000-000000000803',
};

describe('legacy media deletion scheduler', () => {
  it.each(['public-media', 'private-evidence'] as const)(
    'removes an allowlisted %s object and completes its outbox row',
    async (storage_bucket) => {
      const remove = vi.fn().mockResolvedValue({ error: null });
      const complete = vi.fn().mockResolvedValue({ error: null });

      await expect(processLegacyMediaDeletionJobs([{ ...baseJob, storage_bucket }], { remove, complete }))
        .resolves.toEqual({ processed: 1, removed: 1 });
      expect(remove).toHaveBeenCalledWith(storage_bucket, [baseJob.storage_path]);
      expect(complete).toHaveBeenCalledWith({
        p_job_id: baseJob.job_id,
        p_media_id: baseJob.media_id,
        p_storage_bucket: storage_bucket,
        p_storage_path: baseJob.storage_path,
        p_cleanup_claim_id: baseJob.cleanup_claim_id,
        p_result: 'removed',
      });
    },
  );

  it('treats a missing Storage object as successful idempotent completion', async () => {
    const remove = vi.fn().mockResolvedValue({ error: { statusCode: '404', message: 'Object not found' } });
    const complete = vi.fn().mockResolvedValue({ error: null });

    await expect(processLegacyMediaDeletionJobs([baseJob], { remove, complete }))
      .resolves.toEqual({ processed: 1, removed: 1 });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ p_result: 'missing' }));
  });

  it('records a transient Storage failure for retry without reporting removal', async () => {
    const remove = vi.fn().mockResolvedValue({ error: { statusCode: '503', message: 'temporary outage' } });
    const complete = vi.fn().mockResolvedValue({ error: null });

    await expect(processLegacyMediaDeletionJobs([baseJob], { remove, complete }))
      .resolves.toEqual({ processed: 1, removed: 0 });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ p_result: 'retry' }));
  });

  it('does not mistake an untyped not-found message for a successful deletion', async () => {
    const remove = vi.fn().mockResolvedValue({ error: { message: 'Object not found while retrying gateway request' } });
    const complete = vi.fn().mockResolvedValue({ error: null });

    await expect(processLegacyMediaDeletionJobs([baseJob], { remove, complete }))
      .resolves.toEqual({ processed: 1, removed: 0 });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ p_result: 'retry' }));
  });

  it.each([
    { ...baseJob, storage_bucket: 'media-staging' },
    { ...baseJob, storage_path: '00000000-0000-4000-8000-000000000899/other-owner.jpg' },
    { ...baseJob, storage_path: '00000000-0000-4000-8000-000000000801/../other-owner.jpg' },
    { ...baseJob, storage_path: '00000000-0000-4000-8000-000000000801//double-slash.jpg' },
    { ...baseJob, storage_path: '00000000-0000-4000-8000-000000000801\\backslash.jpg' },
  ])('rejects an unsafe outbox target before any Storage call', async (unsafeJob) => {
    const remove = vi.fn();
    const complete = vi.fn();

    await expect(processLegacyMediaDeletionJobs([unsafeJob], { remove, complete }))
      .resolves.toEqual({ processed: 0, removed: 0 });
    expect(remove).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
});
