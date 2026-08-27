export const LEGACY_MEDIA_BUCKETS = ['public-media', 'private-evidence'] as const;

type LegacyMediaBucket = typeof LEGACY_MEDIA_BUCKETS[number];
type CompletionResult = 'removed' | 'missing' | 'retry';

export type LegacyMediaDeletionJob = Readonly<{
  job_id: string;
  media_id: string;
  storage_bucket: string;
  storage_path: string;
  expected_owner_id: string;
  cleanup_claim_id: string;
}>;

type SafeLegacyMediaDeletionJob = Omit<LegacyMediaDeletionJob, 'storage_bucket'> & Readonly<{
  storage_bucket: LegacyMediaBucket;
}>;

type StorageRemovalError = Readonly<{
  statusCode?: string | number;
  status?: string | number;
  message?: string;
}>;

export type LegacyCleanupDependencies = Readonly<{
  remove(bucket: LegacyMediaBucket, paths: string[]): Promise<Readonly<{ error: StorageRemovalError | null }>>;
  complete(args: Readonly<{
    p_job_id: string;
    p_media_id: string;
    p_storage_bucket: LegacyMediaBucket;
    p_storage_path: string;
    p_cleanup_claim_id: string;
    p_result: CompletionResult;
  }>): Promise<Readonly<{ error: unknown | null }>>;
}>;

function isLegacyBucket(value: string): value is LegacyMediaBucket {
  return (LEGACY_MEDIA_BUCKETS as readonly string[]).includes(value);
}

/** A legacy target is trusted only when it remains inside its erased owner's prefix. */
export function isSafeLegacyStoragePath(expectedOwnerId: string, value: string): boolean {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedOwnerId) ||
      Array.from(value).length < 1 || Array.from(value).length > 512 ||
      value.includes('\\') || value.includes('\u0000')) return false;
  const segments = value.split('/');
  return segments.length >= 2 && segments[0] === expectedOwnerId &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function isSafeLegacyMediaDeletionJob(value: unknown): value is SafeLegacyMediaDeletionJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const job = value as Partial<LegacyMediaDeletionJob>;
  return typeof job.job_id === 'string' && typeof job.media_id === 'string' &&
    typeof job.storage_bucket === 'string' && typeof job.storage_path === 'string' &&
    typeof job.expected_owner_id === 'string' &&
    typeof job.cleanup_claim_id === 'string' && isLegacyBucket(job.storage_bucket) &&
    isSafeLegacyStoragePath(job.expected_owner_id, job.storage_path);
}

function completionResult(error: StorageRemovalError | null): CompletionResult {
  if (error === null) return 'removed';
  const status = String(error.statusCode ?? error.status ?? '');
  return status === '404' ? 'missing' : 'retry';
}

export async function processLegacyMediaDeletionJobs(
  candidates: readonly unknown[],
  dependencies: LegacyCleanupDependencies,
): Promise<Readonly<{ processed: number; removed: number }>> {
  let processed = 0;
  let removed = 0;
  for (const candidate of candidates) {
    if (!isSafeLegacyMediaDeletionJob(candidate)) continue;
    const result = completionResult((await dependencies.remove(candidate.storage_bucket, [candidate.storage_path])).error);
    const completion = await dependencies.complete({
      p_job_id: candidate.job_id,
      p_media_id: candidate.media_id,
      p_storage_bucket: candidate.storage_bucket,
      p_storage_path: candidate.storage_path,
      p_cleanup_claim_id: candidate.cleanup_claim_id,
      p_result: result,
    });
    if (completion.error !== null) continue;
    processed += 1;
    if (result !== 'retry') removed += 1;
  }
  return { processed, removed };
}
