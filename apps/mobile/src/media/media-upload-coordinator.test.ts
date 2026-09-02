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
  it.each(['uploading', 'finalizing'] as const)('settles an exact %s A claim when live ownership changed to B', async (state) => {
    const run = uploadHarness({ ownerSubject: 'owner-87654321', fifthActiveState: undefined });
    run.current = { ...run.current!, uploadJob: { ...run.current!.uploadJob!, state, attempts: 1, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: '2026-08-27T00:00:00.000Z' } };
    await expect(run.runCurrentClaim()).resolves.toBe('waiting');
    expect(run.current?.uploadJob).toMatchObject({ state: 'waiting', resumeState: state, attempts: 1 });
    expect(run.events).not.toContain('decrypt');
    expect(run.accessTokenRequests()).toBe(0);
  });

  it('does not mutate a stale claim when live ownership changed to B', async () => {
    const run = uploadHarness({ ownerSubject: 'owner-87654321' });
    const claim = await run.claim();
    run.current = { ...run.current!, revision: run.current!.revision! + 1 };
    const before = run.current;
    await expect(runMediaUploadAttempt(claim!, run.dependencies)).resolves.toBe('stale');
    expect(run.current).toBe(before);
    expect(run.events).not.toContain('decrypt');
    expect(run.accessTokenRequests()).toBe(0);
  });
  it('persists uploading before effects, finalizing before finalize, and quarantined before cleanup', async () => {
    const run = uploadHarness();
    await expect(run.claimAndRun()).resolves.toBe('quarantined');
    expect(run.events).toEqual([
      'persist:uploading:1', 'decrypt', 'reserve', 'put', 'persist:finalizing:1',
      'finalize', 'persist:quarantined:1', 'delete_ciphertext', 'cleanup_row',
    ]);
  });

  it.each(['decrypt', 'reserve', 'put', 'finalize'] as const)(
    'stops an A upload when auth changes to B before %s',
    async (boundary) => {
      const run = uploadHarness();
      let owner = 'owner-12345678';
      const base = run.dependencies;
      let ownerReads = 0;
      run.dependencies = {
        ...base,
        getOwnerSubject: async () => {
          ownerReads += 1;
          if (boundary === 'decrypt' && ownerReads >= 2) owner = 'owner-bbbbbbbb';
          return owner;
        },
        withDecryptedReviewedJpeg: async (input, consume) => base.withDecryptedReviewedJpeg(input, async (artifact) => {
          if (boundary === 'reserve') owner = 'owner-bbbbbbbb';
          return consume(artifact);
        }),
        reserveMediaUpload: async (input) => {
          const capability = await base.reserveMediaUpload(input);
          if (boundary === 'put') owner = 'owner-bbbbbbbb';
          return capability;
        },
        putReservedMedia: async (input) => {
          await base.putReservedMedia(input);
          if (boundary === 'finalize') owner = 'owner-bbbbbbbb';
        },
      };
      await expect(run.claimAndRun()).resolves.toBe('waiting');
      const index = run.events.indexOf(boundary);
      expect(index === -1 || run.events.slice(index + 1)).not.toContain(
        boundary === 'decrypt' ? 'reserve' : boundary === 'reserve' ? 'put' : boundary === 'put' ? 'finalize' : 'delete_ciphertext',
      );
    },
  );

  it('records finalizing before settling a cancellation that arrives after PUT succeeds', async () => {
    const run = uploadHarness();
    const cancellation = new AbortController();
    const transition = run.dependencies.transitionClaimedMediaUpload;
    run.dependencies = {
      ...run.dependencies,
      cancellationSignal: cancellation.signal,
      transitionClaimedMediaUpload: async (id, revision, next) => {
        if (next.state === 'finalizing') cancellation.abort();
        return transition(id, revision, next);
      },
    };

    await expect(run.claimAndRun()).resolves.toBe('waiting');
    expect(run.events).toEqual(['persist:uploading:1', 'decrypt', 'reserve', 'put', 'persist:finalizing:1', 'persist:waiting:1']);
    expect(run.current?.uploadJob).toMatchObject({ state: 'waiting', resumeState: 'finalizing', attempts: 1 });
  });

  it('settles an externally cancelled never-settling PUT without accepting its late completion', async () => {
    const run = uploadHarness({ stallStage: 'put' });
    const cancellation = new AbortController();
    run.dependencies = { ...run.dependencies, cancellationSignal: cancellation.signal };
    const pending = run.claimAndRun();
    for (let index = 0; index < 20 && !run.events.includes('put'); index += 1) await Promise.resolve();
    cancellation.abort();
    await expect(pending).resolves.toBe('waiting');
    expect(run.current?.uploadJob).toMatchObject({ state: 'waiting', resumeState: 'uploading' });
    expect(run.plaintextExits()).toBe(1);
    expect(run.deadlines.activeCount()).toBe(0);
    const effects = [...run.events];
    run.releaseStall();
    await Promise.resolve();
    expect(run.events).toEqual(effects);
  });

  it('turns an already claimed fifth attempt cancelled before effects into retry-limit needs-user', async () => {
    const run = uploadHarness({ pendingAttempts: 4 });
    const cancellation = new AbortController();
    const claim = await run.claim();
    cancellation.abort();
    run.dependencies = { ...run.dependencies, cancellationSignal: cancellation.signal };
    await expect(runMediaUploadAttempt(claim!, run.dependencies)).resolves.toBe('needs_user');
    expect(run.current?.uploadJob).toMatchObject({ state: 'needs_user', attempts: 5, lastError: 'retry_limit_reached' });
    expect(run.events).not.toContain('decrypt');
    expect(run.events).not.toContain('reserve');
    expect(run.events).not.toContain('put');
    expect(run.events).not.toContain('finalize');
  });

  it('does not delete terminal media when cancellation occurs during its owner lookup', async () => {
    const run = uploadHarness();
    const claim = await run.claim();
    const controller = new AbortController();
    const owner = deferred<string | null>();
    run.current = { ...run.current!, uploadJob: { state: 'quarantined', attempts: 1, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: null } };
    run.dependencies = { ...run.dependencies, cancellationSignal: controller.signal, getOwnerSubject: jest.fn()
      .mockResolvedValueOnce('owner-12345678').mockImplementationOnce(async () => owner.promise) };
    const quarantinedClaim = { ...claim!, revision: run.current.revision!, uploadJob: run.current.uploadJob! } as MediaUploadClaim;
    const pending = runMediaUploadAttempt(quarantinedClaim, run.dependencies);
    await Promise.resolve(); controller.abort(); owner.resolve('owner-12345678');
    await expect(pending).rejects.toThrow('terminal_cleanup_failed');
    expect(run.events).not.toContain('delete_ciphertext');
    expect(run.events).not.toContain('cleanup_row');
    expect(run.current?.uploadJob?.state).toBe('quarantined');
  });

  it('retains the terminal row when cancellation follows ciphertext deletion', async () => {
    const run = uploadHarness();
    const claim = await run.claim();
    const controller = new AbortController();
    run.current = { ...run.current!, uploadJob: { state: 'quarantined', attempts: 1, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: null } };
    run.dependencies = { ...run.dependencies, cancellationSignal: controller.signal, deleteReviewedMediaReference: async () => { run.events.push('delete_ciphertext'); controller.abort(); } };
    const quarantinedClaim = { ...claim!, revision: run.current.revision!, uploadJob: run.current.uploadJob! } as MediaUploadClaim;
    await expect(runMediaUploadAttempt(quarantinedClaim, run.dependencies)).rejects.toThrow('terminal_cleanup_failed');
    expect(run.events).toContain('delete_ciphertext');
    expect(run.events).not.toContain('cleanup_row');
    expect(run.current?.uploadJob?.state).toBe('quarantined');
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

  it('treats an exact upload HTTP 400 storage failure as potentially committed and converges when finalize succeeds', async () => {
    const run = uploadHarness({
      put: [transportFailure('upload', 'http', 400, 'storage_upload_failed')],
      finalize: ['success'],
    });
    await expect(run.claimAndRun()).resolves.toBe('quarantined');
    expect(run.events).toContain('persist:finalizing:1');
  });

  it('keeps an exact upload HTTP 409 storage failure compatible with finalize convergence', async () => {
    const run = uploadHarness({
      put: [transportFailure('upload', 'http', 409, 'storage_upload_failed')],
      finalize: ['success'],
    });
    await expect(run.claimAndRun()).resolves.toBe('quarantined');
    expect(run.events).toContain('persist:finalizing:1');
  });

  it.each([
    ['401 status', transportFailure('upload', 'http', 401, 'storage_upload_failed')],
    ['403 status', transportFailure('upload', 'http', 403, 'storage_upload_failed')],
    ['408 status', transportFailure('upload', 'http', 408, 'storage_upload_failed')],
    ['429 status', transportFailure('upload', 'http', 429, 'storage_upload_failed')],
    ['500 status', transportFailure('upload', 'http', 500, 'storage_upload_failed')],
    ['wrong code', transportFailure('upload', 'http', 400, 'media_transport_failed')],
    ['reserve stage', transportFailure('reserve', 'http', 400, 'storage_upload_failed')],
    ['finalize stage', transportFailure('finalize', 'http', 400, 'storage_upload_failed')],
    ['network kind', transportFailure('upload', 'network', null, 'storage_upload_failed')],
    ['invalid-response kind', transportFailure('upload', 'invalid_response', null, 'storage_upload_failed')],
  ] as const)('fails closed for a possible-commit lookalike with %s', async (_name, failure) => {
    const run = uploadHarness({ put: [failure], finalize: ['success'] });
    await expect(run.claimAndRun()).resolves.not.toBe('quarantined');
    expect(run.events).not.toContain('persist:finalizing:1');
    expect(run.events).not.toContain('finalize');
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

  it('returns a token loss after claim to waiting in the same phase', async () => {
    const run = uploadHarness({ tokenError: 'authentication_required' });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    expect(run.current?.uploadJob).toMatchObject({
      state: 'waiting', attempts: 1, resumeState: 'uploading', lastError: 'authentication_required',
    });
    expect(run.events).toContain('decrypt');
    expect(run.events).not.toContain('reserve');
    expect(run.events).not.toContain('put');
  });

  it.each(['local_media_unavailable', 'secure_media_processing_unavailable'])(
    'returns transient local prerequisite %s to waiting without transport',
    async (artifactError) => {
      const run = uploadHarness({ artifactError });
      await expect(run.claimAndRun()).resolves.toBe('waiting');
      expect(run.current?.uploadJob).toMatchObject({
        state: 'waiting', attempts: 1, resumeState: 'uploading', lastError: 'local_media_unavailable',
      });
      expect(run.accessTokenRequests()).toBe(0);
      expect(run.events).not.toContain('reserve');
    },
  );

  it('converges after a transient local prerequisite becomes available', async () => {
    const run = uploadHarness({
      artifactErrors: ['local_media_unavailable', null],
      finalize: ['missing', 'missing', 'success'],
    });
    await expect(run.claimAndRun()).resolves.toBe('waiting');
    await expect(run.claimAndRun('2026-08-27T00:01:00.000Z')).resolves.toBe('quarantined');
    expect(run.events.filter((event) => event === 'put')).toHaveLength(1);
  });

  it('maps an authenticated 401 after claim to retryable authentication_required', async () => {
    const run = uploadHarness({
      recoveringFinalizing: true,
      finalize: [transportFailure('finalize', 'http', 401, 'authentication_required')],
    });
    await expect(run.runCurrentClaim()).resolves.toBe('waiting');
    expect(run.current?.uploadJob).toMatchObject({
      state: 'waiting', attempts: 2, resumeState: 'finalizing', lastError: 'authentication_required',
    });
  });

  it.each(['token', 'finalize'] as const)('maps an explicit %s abort after claim to retryable network', async (stage) => {
    const aborted = Object.assign(new Error('cancelled without secrets'), { name: 'AbortError' });
    const run = stage === 'token'
      ? uploadHarness({ tokenFailure: aborted })
      : uploadHarness({ recoveringFinalizing: true, finalize: [aborted] });
    await expect(stage === 'token' ? run.claimAndRun() : run.runCurrentClaim()).resolves.toBe('waiting');
    expect(run.current?.uploadJob).toMatchObject({
      state: 'waiting', resumeState: stage === 'token' ? 'uploading' : 'finalizing', lastError: 'network',
    });
    expect(JSON.stringify(run.current)).not.toContain('cancelled without secrets');
  });

  it('does not schedule attempt six when transient local availability fails on claim five', async () => {
    const run = uploadHarness({ pendingAttempts: 4, artifactError: 'local_media_unavailable' });
    await expect(run.claimAndRun()).resolves.toBe('needs_user');
    expect(run.current?.uploadJob).toMatchObject({
      state: 'needs_user', attempts: 5, lastError: 'retry_limit_reached',
    });
  });

  it.each([
    ['local_media_key_missing', 'local_media_key_missing'],
    ['local_media_missing', 'local_media_missing'],
    ['version_mismatch', 'version_mismatch'],
    ['local_media_corrupt', 'local_media_corrupt'],
    ['hostile secret token=abc', 'upload_error'],
  ] as const)(
    'makes no network call and stores only bounded terminal %s',
    async (error, lastError) => {
      const run = uploadHarness({ artifactError: error });
      await expect(run.claimAndRun()).resolves.toBe('needs_user');
      expect(run.events).not.toContain('reserve');
      expect(run.events).not.toContain('put');
      expect(run.events).not.toContain('finalize');
      expect(run.accessTokenRequests()).toBe(0);
      expect(run.current?.uploadJob?.lastError).toBe(lastError);
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

  it.each(['token', 'reserve', 'put'] as const)(
    'bounds a never-settling %s while plaintext is scoped and ignores its late completion',
    async (stallStage) => {
      const run = uploadHarness({ stallStage });
      const pending = run.claimAndRun();
      await run.deadlines.waitForActive();
      expect(run.deadlines.activeCount()).toBe(1);
      run.deadlines.fire();
      await expect(pending).resolves.toBe('waiting');
      expect(run.plaintextExits()).toBe(1);
      expect(run.deadlines.activeCount()).toBe(0);
      expect(run.current?.uploadJob).toMatchObject({
        state: 'waiting', attempts: 1, resumeState: 'uploading', lastError: 'network',
      });
      expect(run.events.filter((event) => event === 'persist:waiting:1')).toHaveLength(1);
      const beforeLateCompletion = [...run.events];
      if (stallStage === 'token') run.rejectStall(new Error('late token secret=never-store'));
      else run.releaseStall();
      await Promise.resolve();
      await Promise.resolve();
      expect(run.events).toEqual(beforeLateCompletion);
      expect(JSON.stringify(run.current)).not.toContain('late token secret');
    },
  );

  it('bounds a never-settling recovery token before finalizing without opening plaintext', async () => {
    const run = uploadHarness({ recoveringFinalizing: true, stallStage: 'token' });
    const pending = run.runCurrentClaim();
    await run.deadlines.waitForActive();
    run.deadlines.fire();
    await expect(pending).resolves.toBe('waiting');
    expect(run.current?.uploadJob).toMatchObject({
      state: 'waiting', attempts: 2, resumeState: 'finalizing', lastError: 'network',
    });
    expect(run.plaintextExits()).toBe(0);
    expect(run.events).not.toContain('decrypt');
    const beforeLateCompletion = [...run.events];
    run.releaseStall();
    await Promise.resolve();
    await Promise.resolve();
    expect(run.events).toEqual(beforeLateCompletion);
  });

  it('clears the plaintext deadline without aborting after successful completion', async () => {
    const run = uploadHarness();
    await expect(run.claimAndRun()).resolves.toBe('quarantined');
    expect(run.deadlines.activeCount()).toBe(0);
    expect(run.deadlines.controllers).toHaveLength(1);
    expect(run.deadlines.controllers[0].signal.aborted).toBe(false);
    expect(run.plaintextExits()).toBe(1);
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

type ScriptedFailure = 'success' | 'network' | 'missing' | 'conflict' | MediaTransportFailure | Error;

function uploadHarness(options: Readonly<{
  reserve?: readonly ScriptedFailure[];
  put?: readonly ScriptedFailure[];
  finalize?: readonly ScriptedFailure[];
  artifactError?: string;
  artifactErrors?: readonly (string | null)[];
  artifactHash?: string;
  tokenError?: string;
  tokenFailure?: unknown;
  deleteFailures?: number;
  cleanupFailures?: number;
  recoveringFinalizing?: boolean;
  fifthActiveState?: 'uploading' | 'finalizing';
  ownerSubject?: string | null;
  pendingAttempts?: number;
  stallStage?: 'token' | 'reserve' | 'put';
}> = {}) {
  const events: string[] = [];
  const reserveInputs: unknown[] = [];
  const reserve = [...(options.reserve ?? ['success'])];
  const put = [...(options.put ?? ['success'])];
  const finalize = [...(options.finalize ?? ['success'])];
  const artifactErrors = [...(options.artifactErrors ?? [])];
  let deleteFailures = options.deleteFailures ?? 0;
  let cleanupFailures = options.cleanupFailures ?? 0;
  let plaintextExits = 0;
  const stall = deferred<void>();
  const deadlines = manualDeadlines();
  const run: {
    current: StoredDraft | null;
    dependencies: MediaUploadCoordinatorDependencies;
    cas: MediaUploadCasDependencies;
    events: string[];
    reserveInputs: unknown[];
    accessTokenRequests(): number;
    plaintextExits(): number;
    deadlines: ReturnType<typeof manualDeadlines>;
    releaseStall(): void;
    rejectStall(error: unknown): void;
    claim(now?: string): Promise<MediaUploadClaim | null>;
    claimAndRun(now?: string): Promise<string>;
    runCurrentClaim(): Promise<string>;
  } = {
    current: options.fifthActiveState
      ? activeDraft(options.fifthActiveState, 5, 12)
      : options.recoveringFinalizing ? activeDraft('finalizing', 2, 5) : pendingDraft(options.pendingAttempts),
    dependencies: undefined as never,
    cas: undefined as never,
    events,
    reserveInputs,
    accessTokenRequests: () => tokenRequests,
    plaintextExits: () => plaintextExits,
    deadlines,
    releaseStall: () => stall.resolve(),
    rejectStall: (error) => stall.reject(error),
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
    getOwnerSubject: async () => options.ownerSubject ?? 'owner-12345678',
    getAccessToken: async (signal: AbortSignal) => {
      tokenRequests += 1;
      if (options.tokenFailure) throw options.tokenFailure;
      if (options.tokenError) throw new Error(options.tokenError);
      if (options.stallStage === 'token') await abortableStall(stall.promise, signal);
      return 'access-secret';
    },
    withDecryptedReviewedJpeg: async (_input, consume) => {
      events.push('decrypt');
      const artifactError = artifactErrors.length > 0 ? artifactErrors.shift() : options.artifactError;
      if (artifactError) throw new Error(artifactError);
      const bytes = new Uint8Array([1, 2, 3, 4]);
      try {
        return await consume({
          bytes,
          sha256: options.artifactHash ?? receipt.sanitizedSha256,
          byteLength: 4,
        });
      } finally {
        bytes.fill(0);
        plaintextExits += 1;
      }
    },
    reserveMediaUpload: async (input) => {
      events.push('reserve');
      if (options.stallStage === 'reserve') await abortableStall(stall.promise, input.signal!);
      reserveInputs.push({ sightingId: input.sightingId, mediaId: input.mediaId, receipt: input.receipt });
      scripted(reserve.shift() ?? 'success', 'reserve');
      return capability();
    },
    putReservedMedia: async (input) => {
      events.push('put');
      if (options.stallStage === 'put') await abortableStall(stall.promise, input.signal!);
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
    drainPendingCleanup: async () => undefined,
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
    plaintextDeadlineMs: 90_000,
    createAbortController: () => deadlines.createAbortController(),
    setDeadlineTimer: (callback, delayMs) => deadlines.set(callback, delayMs),
    clearDeadlineTimer: (handle) => deadlines.clear(handle),
  };
  run.claim = async (now = '2026-08-27T00:00:00.000Z') =>
    claimMediaUploadAttemptWithDependencies(run.current!.id, new Date(now), 10_000, 'owner-12345678', run.cas);
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
      ownerSubject: current.ownerSubject!,
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function abortableStall<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // Deliberately ignore abort like a broken native/provider promise; the coordinator race must still settle.
    const onAbort = () => undefined;
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

function manualDeadlines() {
  type Handle = { callback: () => void; active: boolean };
  const handles: Handle[] = [];
  const controllers: AbortController[] = [];
  return {
    controllers,
    createAbortController() {
      const controller = new AbortController();
      controllers.push(controller);
      return controller;
    },
    set(callback: () => void, _delayMs: number): Handle {
      const handle = { callback, active: true };
      handles.push(handle);
      return handle;
    },
    clear(handle: unknown) {
      (handle as Handle).active = false;
    },
    activeCount: () => handles.filter(({ active }) => active).length,
    fire() {
      for (const handle of handles) {
        if (!handle.active) continue;
        handle.active = false;
        handle.callback();
      }
    },
    async waitForActive() {
      for (let index = 0; index < 20; index += 1) {
        if (handles.some(({ active }) => active)) return;
        await Promise.resolve();
      }
      throw new Error('deadline_timer_not_started');
    },
  };
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

function pendingDraft(attempts = 0): StoredDraft {
  return {
    id: 'draft-12345678', notes: 'tabby', risk: 'normal', mediaId: 'media-12345678',
    sightingId: 'sighting-12345678',
    ownerSubject: 'owner-12345678',
    encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
    encryptionVersion: 'aes-256-gcm.v1', receipt, revision: 0,
    uploadJob: {
      state: 'upload_pending', attempts, nextAttemptAt: null, lastError: null,
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
