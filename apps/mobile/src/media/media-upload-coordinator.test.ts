import type { ValidatedUploadCapability } from '../api/media';
import type { MediaTransportFailure } from '../api/media-transport';
import type { StoredDraft } from '../offline/draft-policy';
import {
  claimMediaUploadAttemptWithDependencies,
  type MediaUploadCasDependencies,
  type MediaUploadClaim,
} from '../offline/draft-store.native';
import {
  runMediaUploadAttempt,
  type MediaUploadCoordinatorDependencies,
} from './media-upload-coordinator';

const receipt = {
  sanitizedSha256: 'a'.repeat(64),
  recipeVersion: 'jpeg-srgb-2048-q88.v1' as const,
  detectorVersions: {
    cats: 'unavailable' as const, people: 'unavailable' as const, plates: 'unavailable' as const,
  },
  width: 100,
  height: 100,
  byteLength: 4,
  confirmedAtLocal: '2026-08-27T00:00:00.000Z',
};

describe('crash-safe media upload coordinator', () => {
  it('persists uploading before effects, finalizing before finalize, and quarantined before cleanup', async () => {
    const run = uploadHarness();
    await expect(run.claimAndRun()).resolves.toBe('quarantined');
    expect(run.events).toEqual([
      'persist:uploading:1', 'decrypt', 'reserve', 'put', 'persist:finalizing:1',
      'finalize', 'persist:quarantined:1', 'delete_ciphertext', 'cleanup_row',
    ]);
  });

  it('reuses immutable identities when reserve committed but its response was lost', async () => {
    const run = uploadHarness({
      reserve: ['network', 'success'],
      finalize: ['missing', 'missing', 'success'],
    });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.reserveInputs).toHaveLength(2);
    expect(run.reserveInputs[1]).toEqual(run.reserveInputs[0]);
    expect(run.events.filter((event) => event === 'put')).toHaveLength(1);
  });

  it('probes finalize before decrypting or repeating PUT after a lost PUT response', async () => {
    const run = uploadHarness({ put: ['network', 'success'], finalize: ['success'] });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    run.events.length = 0;
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.events.slice(0, 3)).toEqual(['persist:uploading:2', 'persist:finalizing:2', 'finalize']);
    expect(run.events).not.toContain('decrypt');
    expect(run.events).not.toContain('put');
  });

  it('resumes finalizing without decrypting after finalize committed but its response was lost', async () => {
    const run = uploadHarness({ finalize: ['network', 'success'] });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    expect(run.current?.uploadJob).toMatchObject({ state: 'waiting', resumeState: 'finalizing', attempts: 1 });
    run.events.length = 0;
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.events.slice(0, 2)).toEqual(['persist:finalizing:2', 'finalize']);
    expect(run.events).not.toContain('decrypt');
  });

  it('renews and probes a finalizing upload again before deciding to reupload', async () => {
    const run = uploadHarness({ finalize: ['network', 'missing', 'success'] });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    run.events.length = 0;
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.events).toEqual([
      'persist:finalizing:2', 'finalize', 'reserve', 'finalize',
      'persist:quarantined:2', 'delete_ciphertext', 'cleanup_row',
    ]);
  });

  it('rereads and reuploads only after two authenticated missing-object results', async () => {
    const run = uploadHarness({ finalize: ['network', 'missing', 'missing', 'success'] });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    run.events.length = 0;
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.events).toEqual([
      'persist:finalizing:2', 'finalize', 'reserve', 'finalize', 'decrypt', 'put', 'finalize',
      'persist:quarantined:2', 'delete_ciphertext', 'cleanup_row',
    ]);
  });

  it('treats PUT conflict as potentially committed and converges when finalize succeeds', async () => {
    const run = uploadHarness({ put: ['conflict'], finalize: ['success'] });
    await expect(run.claimAndRun()).resolves.toBe('quarantined');
    expect(run.events).toContain('persist:finalizing:1');
  });

  it('stops after PUT conflict plus a fresh-reservation finalize conflict', async () => {
    const run = uploadHarness({ put: ['conflict'], finalize: ['missing'] });
    await expect(run.claimAndRun()).resolves.toBe('needs_user');
    expect(run.events.filter((event) => event === 'reserve')).toHaveLength(1);
    expect(run.current?.uploadJob).toMatchObject({ state: 'needs_user', lastError: 'upload_error' });
  });

  it.each([
    ['network', transportFailure('finalize', 'network', null, 'network_error')],
    ['http_408', transportFailure('finalize', 'http', 408, 'media_transport_failed')],
    ['http_429', transportFailure('finalize', 'http', 429, 'media_transport_failed')],
    ['http_503', transportFailure('finalize', 'http', 503, 'service_unavailable')],
  ] as const)('persists bounded %s waiting state in the current phase', async (lastError, failure) => {
    const run = uploadHarness({ recoveringFinalizing: true, finalize: [failure] });
    await expect(run.runCurrentClaim()).resolves.toBe('waiting');
    expect(run.current?.uploadJob).toMatchObject({
      state: 'waiting', attempts: 2, resumeState: 'finalizing', lastError,
    });
  });

  it.each(['local_media_key_missing', 'version_mismatch', 'local_media_corrupt', 'hostile secret token=abc'])(
    'makes no network call and stores only an allow-listed failure for %s',
    async (error) => {
      const run = uploadHarness({ artifactError: error });
      await expect(run.claimAndRun()).resolves.toBe('needs_user');
      expect(run.events).not.toContain('reserve');
      expect(run.events).not.toContain('put');
      expect(run.events).not.toContain('finalize');
      expect(run.accessTokenRequests()).toBe(0);
      expect(run.current?.uploadJob?.lastError).toMatch(/^(local_media_corrupt|version_mismatch|upload_error)$/);
      expect(JSON.stringify(run.current)).not.toContain('token=abc');
    },
  );

  it('rejects callback-level hash mismatch before requesting a token or starting transport', async () => {
    const run = uploadHarness({ artifactHash: 'b'.repeat(64) });
    await expect(run.claimAndRun()).resolves.toBe('needs_user');
    expect(run.accessTokenRequests()).toBe(0);
    expect(run.events).not.toContain('reserve');
    expect(run.events).not.toContain('put');
    expect(run.events).not.toContain('finalize');
    expect(run.current?.uploadJob?.lastError).toBe('local_media_corrupt');
  });

  it('never retransmits when ciphertext or row cleanup crashes after quarantined persistence', async () => {
    const run = uploadHarness({ deleteFailures: 1, cleanupFailures: 1 });
    const claim = await run.claim();
    await expect(runMediaUploadAttempt(claim!, run.dependencies)).rejects.toThrow('terminal_cleanup_failed');
    expect(run.current?.uploadJob?.state).toBe('quarantined');
    const networkEffects = () => run.events.filter((event) => ['reserve', 'put', 'finalize', 'decrypt'].includes(event));
    const before = networkEffects();
    await expect(runMediaUploadAttempt(claim!, run.dependencies)).rejects.toThrow('terminal_cleanup_failed');
    await expect(runMediaUploadAttempt(claim!, run.dependencies)).resolves.toBe('quarantined');
    expect(networkEffects()).toEqual(before);
  });

  it.each(['uploading', 'finalizing'] as const)(
    'recovers an expired fifth %s claim after an uncertain remote commit without retransmission',
    async (state) => {
      const run = uploadHarness({ fifthActiveState: state, finalize: ['success'] });
      const claim = await run.claim('2026-08-27T00:01:00.000Z');
      expect(claim).toMatchObject({ recoveryOnly: true, uploadJob: { attempts: 5 } });
      await expect(runMediaUploadAttempt(claim!, run.dependencies)).resolves.toBe('quarantined');
      expect(run.events).not.toContain('decrypt');
      expect(run.events).not.toContain('put');
      expect(run.events).not.toContain('reserve');
    },
  );

  it('durably stops an expired fifth claim after renewal still proves the object missing', async () => {
    const run = uploadHarness({ fifthActiveState: 'finalizing', finalize: ['missing', 'missing'] });
    const claim = await run.claim('2026-08-27T00:01:00.000Z');
    await expect(runMediaUploadAttempt(claim!, run.dependencies)).resolves.toBe('needs_user');
    expect(run.current?.uploadJob).toMatchObject({
      state: 'needs_user', attempts: 5, lastError: 'upload_error',
    });
    expect(run.events.filter((event) => event === 'reserve')).toHaveLength(1);
    expect(run.events).not.toContain('decrypt');
    expect(run.events).not.toContain('put');
  });

  it('uses per-draft single-flight only as a second concurrency barrier', async () => {
    const run = uploadHarness();
    const claim = await run.claim();
    const [left, right] = await Promise.all([
      runMediaUploadAttempt(claim!, run.dependencies),
      runMediaUploadAttempt(claim!, run.dependencies),
    ]);
    expect([left, right]).toEqual(['quarantined', 'quarantined']);
    expect(run.events.filter((event) => event === 'put')).toHaveLength(1);
  });
});

describe('stateful remote fault convergence', () => {
  it('converges when reservation commits before its response is lost', async () => {
    const run = statefulRemoteHarness({ loseResponseOnce: 'reserve' });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    expect(run.remote).toMatchObject({ reservationGeneration: 1, reservationActive: true, object: 'missing' });
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.remote).toMatchObject({ reservationGeneration: 1, object: 'valid', finalized: true });
    expect(run.remote.calls).toMatchObject({ reserve: 2, put: 1, finalize: 3 });
    expect(new Set(run.remote.reserveIdentities).size).toBe(1);
  });

  it('converges without a second PUT when object creation commits before response loss', async () => {
    const run = statefulRemoteHarness({ loseResponseOnce: 'put' });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    expect(run.remote.object).toBe('valid');
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.remote.finalized).toBe(true);
    expect(run.remote.calls.put).toBe(1);
  });

  it('converges when finalization commits before its response is lost', async () => {
    const run = statefulRemoteHarness({ loseResponseOnce: 'finalize' });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    expect(run.remote.finalized).toBe(true);
    const effects = { reserve: run.remote.calls.reserve, put: run.remote.calls.put };
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.remote.calls).toMatchObject(effects);
  });

  it('renews an expired reservation and finalizes an existing object without PUT', async () => {
    const run = statefulRemoteHarness({ failFinalizeBeforeCommitOnce: true });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    expect(run.remote).toMatchObject({ reservationGeneration: 1, object: 'valid', finalized: false });
    run.remote.expired = true;
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.remote).toMatchObject({ reservationGeneration: 2, object: 'valid', finalized: true });
    expect(run.remote.calls.put).toBe(1);
  });

  it('rereads and reuploads after cleanup deletes the previously committed object', async () => {
    const run = statefulRemoteHarness({ failFinalizeBeforeCommitOnce: true });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    expect(run.remote.object).toBe('valid');
    run.remote.object = 'missing';
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.remote).toMatchObject({ object: 'valid', finalized: true });
    expect(run.remote.calls.put).toBe(2);
    expect(run.remote.calls.finalize).toBe(4);
  });

  it('stops on a corrupt existing object instead of reserving or PUTting forever', async () => {
    const run = statefulRemoteHarness({ initialObject: 'corrupt' });
    await expect(run.claimAndRun()).resolves.toBe('needs_user');
    expect(run.remote).toMatchObject({ object: 'corrupt', finalized: false });
    expect(run.remote.calls).toEqual({ reserve: 1, put: 1, finalize: 1 });
    expect(run.current?.uploadJob).toMatchObject({ state: 'needs_user', lastError: 'upload_error' });
  });
});

type ScriptedFailure = 'success' | 'network' | 'missing' | 'conflict' | MediaTransportFailure;

function uploadHarness(options: Readonly<{
  reserve?: readonly ScriptedFailure[];
  put?: readonly ScriptedFailure[];
  finalize?: readonly ScriptedFailure[];
  artifactError?: string;
  artifactHash?: string;
  deleteFailures?: number;
  cleanupFailures?: number;
  recoveringFinalizing?: boolean;
  fifthActiveState?: 'uploading' | 'finalizing';
}> = {}) {
  const events: string[] = [];
  const reserveInputs: unknown[] = [];
  const reserve = [...(options.reserve ?? ['success'])];
  const put = [...(options.put ?? ['success'])];
  const finalize = [...(options.finalize ?? ['success'])];
  let deleteFailures = options.deleteFailures ?? 0;
  let cleanupFailures = options.cleanupFailures ?? 0;
  const run: {
    current: StoredDraft | null;
    dependencies: MediaUploadCoordinatorDependencies;
    cas: MediaUploadCasDependencies;
    events: string[];
    reserveInputs: unknown[];
    accessTokenRequests(): number;
    claim(now?: string): Promise<MediaUploadClaim | null>;
    claimAndRun(now?: string): Promise<string>;
    runCurrentClaim(): Promise<string>;
  } = {
    current: options.fifthActiveState
      ? activeDraft(options.fifthActiveState, 5, 12)
      : options.recoveringFinalizing ? activeDraft('finalizing', 2, 5) : pendingDraft(),
    dependencies: undefined as never,
    cas: undefined as never,
    events,
    reserveInputs,
    accessTokenRequests: () => tokenRequests,
    claim: async () => null,
    claimAndRun: async () => '',
    runCurrentClaim: async () => '',
  };
  run.cas = {
    getOfflineDraft: async () => run.current,
    compareAndSwapUploadJob: async (_id, expectedRevision, expectedState, next) => {
      if (!run.current || run.current.revision !== expectedRevision || run.current.uploadJob?.state !== expectedState) return false;
      events.push(`persist:${next.state}:${next.attempts}`);
      run.current = { ...run.current, revision: expectedRevision + 1, uploadJob: next };
      return true;
    },
  };
  let tokenRequests = 0;
  run.dependencies = {
    getOfflineDraft: run.cas.getOfflineDraft,
    transitionClaimedMediaUpload: async (id, revision, next) => {
      const current = run.current;
      if (!current || current.id !== id || current.revision !== revision || !current.uploadJob) return false;
      return run.cas.compareAndSwapUploadJob(id, revision, current.uploadJob.state, next);
    },
    getAccessToken: async () => { tokenRequests += 1; return 'access-secret'; },
    withDecryptedReviewedJpeg: async (_input, consume) => {
      events.push('decrypt');
      if (options.artifactError) throw new Error(options.artifactError);
      return consume({
        bytes: new Uint8Array([1, 2, 3, 4]),
        sha256: options.artifactHash ?? receipt.sanitizedSha256,
        byteLength: 4,
      });
    },
    reserveMediaUpload: async (input) => {
      events.push('reserve');
      reserveInputs.push({ sightingId: input.sightingId, mediaId: input.mediaId, receipt: input.receipt });
      scripted(reserve.shift() ?? 'success', 'reserve');
      return capability();
    },
    putReservedMedia: async () => {
      events.push('put');
      scripted(put.shift() ?? 'success', 'upload');
    },
    finalizeMediaUpload: async () => {
      events.push('finalize');
      scripted(finalize.shift() ?? 'success', 'finalize');
      return { mediaAssetId: '12345678-1234-1234-1234-123456789abc', status: 'quarantined' as const };
    },
    deleteReviewedMediaReference: async () => {
      events.push('delete_ciphertext');
      if (deleteFailures-- > 0) throw new Error('disk path secret');
    },
    cleanupQuarantinedMedia: async () => {
      events.push('cleanup_row');
      if (cleanupFailures-- > 0) throw new Error('database path secret');
      if (run.current) {
        run.current = {
          id: run.current.id, notes: run.current.notes, risk: run.current.risk,
          revision: (run.current.revision ?? 0) + 1,
        };
      }
    },
    now: () => new Date('2026-08-27T00:00:00.000Z'),
    random: () => 0.5,
  };
  run.claim = async (now = '2026-08-27T00:00:00.000Z') =>
    claimMediaUploadAttemptWithDependencies(run.current!.id, new Date(now), 10_000, run.cas);
  run.claimAndRun = async (now) => {
    const claim = await run.claim(now);
    if (!claim) throw new Error('claim_failed');
    return runMediaUploadAttempt(claim, run.dependencies);
  };
  run.runCurrentClaim = async () => {
    const current = run.current!;
    const claim: MediaUploadClaim = {
      draftId: current.id,
      mediaId: current.mediaId!,
      sightingId: current.sightingId!,
      encryptedReviewedRef: current.encryptedReviewedRef!,
      encryptionVersion: 'aes-256-gcm.v1',
      receipt: current.receipt!,
      uploadJob: current.uploadJob as MediaUploadClaim['uploadJob'],
      revision: current.revision!,
      recovering: true,
      recoveryOnly: false,
    };
    return runMediaUploadAttempt(claim, run.dependencies);
  };
  return run;
}

function statefulRemoteHarness(options: Readonly<{
  loseResponseOnce?: 'reserve' | 'put' | 'finalize';
  failFinalizeBeforeCommitOnce?: boolean;
  initialObject?: 'missing' | 'valid' | 'corrupt';
}> = {}) {
  const run = uploadHarness();
  let lostResponse = false;
  let failedFinalizeBeforeCommit = false;
  const remote = {
    reservationGeneration: 0,
    reservationActive: false,
    expired: false,
    object: options.initialObject ?? 'missing' as 'missing' | 'valid' | 'corrupt',
    finalized: false,
    calls: { reserve: 0, put: 0, finalize: 0 },
    reserveIdentities: [] as string[],
  };
  run.dependencies = {
    ...run.dependencies,
    reserveMediaUpload: async (input) => {
      remote.calls.reserve += 1;
      remote.reserveIdentities.push(JSON.stringify({
        sightingId: input.sightingId,
        mediaId: input.mediaId,
        sha256: input.receipt.sanitizedSha256,
        byteLength: input.receipt.byteLength,
      }));
      if (!remote.reservationActive || remote.expired) {
        remote.reservationGeneration += 1;
        remote.reservationActive = true;
        remote.expired = false;
      }
      if (options.loseResponseOnce === 'reserve' && !lostResponse) {
        lostResponse = true;
        throw transportFailure('reserve', 'network', null, 'network_error');
      }
      return {
        jobId: `job-${String(remote.reservationGeneration).padStart(8, '0')}`,
        path: `jobs/job-${String(remote.reservationGeneration).padStart(8, '0')}.jpg`,
        token: `upload-token-${remote.reservationGeneration}`,
        usableUntil: '2026-08-27T01:00:00.000Z',
      };
    },
    putReservedMedia: async () => {
      remote.calls.put += 1;
      if (remote.object !== 'missing') {
        throw transportFailure('upload', 'http', 409, 'storage_upload_failed');
      }
      remote.object = 'valid';
      if (options.loseResponseOnce === 'put' && !lostResponse) {
        lostResponse = true;
        throw transportFailure('upload', 'network', null, 'network_error');
      }
    },
    finalizeMediaUpload: async () => {
      remote.calls.finalize += 1;
      if (remote.finalized) {
        return { mediaAssetId: '12345678-1234-1234-1234-123456789abc', status: 'quarantined' as const };
      }
      if (options.failFinalizeBeforeCommitOnce && !failedFinalizeBeforeCommit) {
        failedFinalizeBeforeCommit = true;
        throw transportFailure('finalize', 'network', null, 'network_error');
      }
      if (!remote.reservationActive || remote.expired || remote.object !== 'valid') {
        throw transportFailure('finalize', 'http', 409, 'media_finalization_conflict');
      }
      remote.finalized = true;
      if (options.loseResponseOnce === 'finalize' && !lostResponse) {
        lostResponse = true;
        throw transportFailure('finalize', 'network', null, 'network_error');
      }
      return { mediaAssetId: '12345678-1234-1234-1234-123456789abc', status: 'quarantined' as const };
    },
  };
  return Object.assign(run, { remote });
}

function pendingDraft(): StoredDraft {
  return {
    id: 'draft-12345678', notes: 'tabby', risk: 'normal', mediaId: 'media-12345678',
    sightingId: 'sighting-12345678',
    encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
    encryptionVersion: 'aes-256-gcm.v1', receipt, revision: 0,
    uploadJob: {
      state: 'upload_pending', attempts: 0, nextAttemptAt: null, lastError: null,
      resumeState: null, attemptStartedAt: null,
    },
  };
}

function activeDraft(state: 'uploading' | 'finalizing', attempts: number, revision: number): StoredDraft {
  return {
    ...pendingDraft(), revision,
    uploadJob: {
      state, attempts, nextAttemptAt: null, lastError: null, resumeState: null,
      attemptStartedAt: '2026-08-27T00:00:00.000Z',
    },
  };
}

function capability(): ValidatedUploadCapability {
  return {
    jobId: 'job-12345678', path: 'jobs/job-12345678.jpg', token: 'upload-secret',
    usableUntil: '2026-08-27T01:00:00.000Z',
  };
}

function scripted(value: ScriptedFailure, stage: MediaTransportFailure['stage']): void {
  if (value === 'success') return;
  if (typeof value === 'object') throw value;
  if (value === 'network') throw transportFailure(stage, 'network', null, 'network_error');
  if (value === 'missing') throw transportFailure('finalize', 'http', 409, 'media_finalization_conflict');
  throw transportFailure('upload', 'http', 409, 'storage_upload_failed');
}

function transportFailure(
  stage: MediaTransportFailure['stage'],
  kind: MediaTransportFailure['kind'],
  status: number | null,
  code: MediaTransportFailure['code'],
): MediaTransportFailure {
  return { stage, kind, status, code };
}
