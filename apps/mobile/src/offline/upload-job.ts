export type UploadResumeState = 'uploading' | 'finalizing';
export type UploadJobState =
  | 'local_persisting'
  | 'upload_pending'
  | UploadResumeState
  | 'waiting'
  | 'needs_user'
  | 'quarantined'
  | 'complete';

export type UploadJob = Readonly<{
  state: UploadJobState;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  /** Absent only on pre-migration in-memory fixtures; sanitized/persisted snapshots always write null or a phase. */
  resumeState?: UploadResumeState | null;
  /** Absent only on pre-migration in-memory fixtures; active claims always carry this timestamp. */
  attemptStartedAt?: string | null;
}>;

export type UploadAttemptResult =
  | Readonly<{ kind: 'network' }>
  | Readonly<{ kind: 'http'; status: number }>
  | Readonly<{
      kind: 'authentication_required' | 'local_media_unavailable' | 'local_media_missing' |
        'local_media_key_missing' | 'hash_mismatch' | 'metadata_mismatch' | 'version_mismatch' |
        'local_media_corrupt' | 'upload_error';
    }>
  | Readonly<{ kind: 'quarantined' }>;

const activeStates = new Set<UploadJobState>(['uploading', 'finalizing']);
const resultKinds = new Set<UploadAttemptResult['kind']>([
  'network', 'http', 'hash_mismatch', 'metadata_mismatch', 'version_mismatch',
  'authentication_required', 'local_media_unavailable', 'local_media_missing',
  'local_media_key_missing', 'local_media_corrupt', 'upload_error', 'quarantined',
]);

function invalidAttempt(): UploadJob {
  return {
    state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'invalid_upload_attempt',
    resumeState: null, attemptStartedAt: null,
  };
}

export function nextUploadOutcome(
  job: UploadJob,
  result: UploadAttemptResult,
  now: Date,
  random: () => number,
): UploadJob {
  if (!job || !activeStates.has(job.state) || !Number.isInteger(job.attempts) ||
      job.attempts < 1 || job.attempts > 5 || !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      typeof job.attemptStartedAt !== 'string' || !Number.isFinite(Date.parse(job.attemptStartedAt)) ||
      job.resumeState !== null || job.nextAttemptAt !== null ||
      !result || !resultKinds.has(result.kind) ||
      (result.kind === 'http' && (!Number.isInteger(result.status) || result.status < 100 || result.status > 599))) {
    return invalidAttempt();
  }

  if (result.kind === 'quarantined') {
    if (job.state !== 'finalizing') return invalidAttempt();
    return {
      state: 'quarantined', attempts: job.attempts, nextAttemptAt: null, lastError: null,
      resumeState: null, attemptStartedAt: null,
    };
  }

  const retryable = result.kind === 'network' || result.kind === 'authentication_required' ||
    result.kind === 'local_media_unavailable' ||
    (result.kind === 'http' && (result.status === 408 || result.status === 429 ||
      (result.status >= 500 && result.status <= 599)));
  if (!retryable) {
    const lastError = result.kind === 'http' ? `http_${result.status}` : result.kind;
    return {
      state: 'needs_user', attempts: job.attempts, nextAttemptAt: null, lastError: lastError.slice(0, 64),
      resumeState: null, attemptStartedAt: null,
    };
  }
  if (job.attempts >= 5) {
    return {
      state: 'needs_user', attempts: job.attempts, nextAttemptAt: null, lastError: 'retry_limit_reached',
      resumeState: null, attemptStartedAt: null,
    };
  }

  const randomValue = random();
  const boundedRandom = Number.isFinite(randomValue) ? Math.min(1, Math.max(0, randomValue)) : 0.5;
  const baseDelayMs = Math.min(60_000, 1_000 * 2 ** (job.attempts - 1));
  const nextAttemptAt = new Date(
    now.getTime() + Math.round(baseDelayMs * (0.5 + boundedRandom)),
  ).toISOString();
  return {
    state: 'waiting', attempts: job.attempts, nextAttemptAt,
    lastError: result.kind === 'http' ? `http_${result.status}` : result.kind,
    resumeState: job.state as UploadResumeState,
    attemptStartedAt: null,
  };
}
