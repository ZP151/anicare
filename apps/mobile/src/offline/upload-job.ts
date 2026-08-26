export type UploadJobState = 'upload_pending' | 'uploading' | 'waiting' | 'needs_user' | 'quarantined' | 'complete';

export type UploadJob = Readonly<{
  state: UploadJobState;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
}>;

export type UploadAttemptResult =
  | Readonly<{ kind: 'network' }>
  | Readonly<{ kind: 'http'; status: number }>
  | Readonly<{ kind: 'hash_mismatch' | 'metadata_mismatch' | 'version_mismatch' }>
  | Readonly<{ kind: 'quarantined' | 'complete' }>;

const uploadStates = new Set<UploadJobState>([
  'upload_pending', 'uploading', 'waiting', 'needs_user', 'quarantined', 'complete',
]);

function invalidAttempt(): UploadJob {
  return { state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'invalid_upload_attempt' };
}

export function nextUploadAttempt(
  job: UploadJob,
  result: UploadAttemptResult,
  now: Date,
  random: () => number,
): UploadJob {
  if (!job || !uploadStates.has(job.state) || !Number.isInteger(job.attempts) || job.attempts < 0 || job.attempts > 5 ||
      !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !result || !['network', 'http', 'hash_mismatch', 'metadata_mismatch', 'version_mismatch', 'quarantined', 'complete'].includes(result.kind) ||
      (result.kind === 'http' && (!Number.isInteger(result.status) || result.status < 100 || result.status > 599))) {
    return invalidAttempt();
  }
  const attempts = Math.min(job.attempts + 1, 5);

  if (result.kind === 'complete' || result.kind === 'quarantined') {
    return { state: result.kind, attempts, nextAttemptAt: null, lastError: null };
  }

  const retryable = result.kind === 'network' ||
    (result.kind === 'http' && (result.status === 408 || result.status === 429 ||
      (result.status >= 500 && result.status <= 599)));

  if (!retryable) {
    const error = result.kind === 'http' ? `http_${result.status}` : result.kind;
    return { state: 'needs_user', attempts, nextAttemptAt: null, lastError: error.slice(0, 64) };
  }

  if (attempts >= 5) {
    return { state: 'needs_user', attempts, nextAttemptAt: null, lastError: 'retry_limit_reached' };
  }

  const randomValue = random();
  const boundedRandom = Number.isFinite(randomValue) ? Math.min(1, Math.max(0, randomValue)) : 0.5;
  const baseDelayMs = Math.min(60_000, 1_000 * 2 ** job.attempts);
  const jitterMultiplier = 0.5 + boundedRandom;
  const nextAttemptAt = new Date(now.getTime() + Math.round(baseDelayMs * jitterMultiplier)).toISOString();
  const lastError = result.kind === 'http' ? `http_${result.status}` : result.kind;
  return { state: 'waiting', attempts, nextAttemptAt, lastError };
}
