import {
  commitReviewedDraft,
  decideLocalMediaRecovery,
  recoverPendingReviewedDrafts,
  recoverReviewedDraft,
  resumeReviewedDraftCommit,
  type ReviewedMediaJournal,
} from './reviewed-draft';

const receipt = {
  sanitizedSha256: 'a'.repeat(64),
  recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
  width: 10,
  height: 10,
  byteLength: 10,
  confirmedAtLocal: '2026-08-27T00:00:00.000Z',
};
const review = {
  status: 'reviewed' as const,
  rendered: {
    uri: 'file:///cache/animalhelper-reviewed-12345678.jpg',
    sha256: receipt.sanitizedSha256,
    mimeType: 'image/jpeg' as const,
    width: receipt.width,
    height: receipt.height,
    byteLength: receipt.byteLength,
    recipeVersion: receipt.recipeVersion,
    detectorVersions: receipt.detectorVersions,
  },
  masks: [],
  receipt,
};
const journal: ReviewedMediaJournal = {
  draftId: 'draft-12345678',
  mediaId: 'media-12345678',
  encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
  encryptionVersion: 'aes-256-gcm.v1',
  receipt,
};

function dependencies(options: {
  artifact?: 'absent' | 'valid' | 'corrupt' | 'retryable_unavailable';
  fail?: 'prepare' | 'commit' | 'finalize';
} = {}) {
  let artifact = options.artifact ?? 'absent';
  const events: string[] = [];
  const cleaned: readonly string[][] = [];
  return {
    events,
    cleaned,
    dependencies: {
      createCommitId: () => 'commit-12345678',
      prepareJournal: async (value: ReviewedMediaJournal) => {
        events.push(`prepare:${value.encryptedReviewedRef}`);
        if (options.fail === 'prepare') throw new Error('database_locked');
      },
      inspectArtifact: async () => {
        events.push(`inspect:${artifact}`);
        return artifact;
      },
      commitMedia: async (input: { intendedEncryptedRef: string }) => {
        events.push(`commit:${input.intendedEncryptedRef}`);
        if (options.fail === 'commit') throw new Error('disk_full');
        artifact = 'valid';
      },
      finalizeJournal: async () => {
        events.push('finalize');
        if (options.fail === 'finalize') throw new Error('database_locked');
      },
      markNeedsUser: async (_value: ReviewedMediaJournal, error: string) => { events.push(`needs_user:${error}`); },
      cleanupCaches: async (uris: readonly string[]) => {
        (cleaned as string[][]).push([...uris]);
        events.push('cleanup');
      },
    },
  };
}

describe('durable reviewed-media two-phase commit', () => {
  it('prepares the durable journal before ciphertext commit and cleans plaintext only after DB finalization', async () => {
    const run = dependencies();
    await expect(commitReviewedDraft({
      draftId: journal.draftId,
      mediaId: journal.mediaId,
      review,
      processorCacheUris: [review.rendered.uri],
    }, run.dependencies)).resolves.toEqual({ status: 'saved', journal });
    expect(run.events).toEqual([
      `prepare:${journal.encryptedReviewedRef}`,
      'inspect:absent',
      `commit:${journal.encryptedReviewedRef}`,
      'inspect:valid',
      'finalize',
      'cleanup',
    ]);
  });

  it('does not encrypt when durable journal preparation fails', async () => {
    const run = dependencies({ fail: 'prepare' });
    await expect(commitReviewedDraft({
      draftId: journal.draftId, mediaId: journal.mediaId, review, processorCacheUris: [],
    }, run.dependencies)).rejects.toThrow('database_locked');
    expect(run.events).toEqual([`prepare:${journal.encryptedReviewedRef}`]);
  });

  it('leaves a durable local_persisting journal and plaintext retry material after ciphertext commit failure', async () => {
    const run = dependencies({ fail: 'commit' });
    await expect(commitReviewedDraft({
      draftId: journal.draftId, mediaId: journal.mediaId, review, processorCacheUris: [],
    }, run.dependencies)).resolves.toEqual({ status: 'local_persisting', journal });
    expect(run.events).toEqual([
      `prepare:${journal.encryptedReviewedRef}`, 'inspect:absent', `commit:${journal.encryptedReviewedRef}`,
    ]);
  });

  it('leaves the journal recoverable and does not clean plaintext when final DB update fails', async () => {
    const run = dependencies({ fail: 'finalize' });
    await expect(commitReviewedDraft({
      draftId: journal.draftId, mediaId: journal.mediaId, review, processorCacheUris: [],
    }, run.dependencies)).resolves.toEqual({ status: 'local_persisting', journal });
    expect(run.events).toEqual([
      `prepare:${journal.encryptedReviewedRef}`, 'inspect:absent', `commit:${journal.encryptedReviewedRef}`,
      'inspect:valid', 'finalize',
    ]);
  });

  it('always cleans the confirmed rendered cache after durable finalization even when the caller omitted it', async () => {
    const run = dependencies();
    await commitReviewedDraft({
      draftId: journal.draftId, mediaId: journal.mediaId, review, processorCacheUris: [],
    }, run.dependencies);
    expect(run.cleaned).toEqual([[review.rendered.uri]]);
  });
});

describe('process-restart recovery', () => {
  it('reuses the durable immutable reference for a same-session retry without preparing a second journal', async () => {
    const run = dependencies();
    await expect(resumeReviewedDraftCommit(journal, {
      review,
      processorCacheUris: [review.rendered.uri],
    }, run.dependencies)).resolves.toEqual({ status: 'saved', journal });
    expect(run.events).toEqual([
      'inspect:absent',
      `commit:${journal.encryptedReviewedRef}`,
      'inspect:valid',
      'finalize',
      'cleanup',
    ]);
  });

  it('does not mark a same-session journal corrupt when inspection is temporarily unavailable', async () => {
    const run = dependencies({ artifact: 'retryable_unavailable' });
    await expect(resumeReviewedDraftCommit(journal, {
      review,
      processorCacheUris: [review.rendered.uri],
    }, run.dependencies)).resolves.toEqual({ status: 'local_persisting', journal });
    expect(run.events).toEqual(['inspect:retryable_unavailable']);
  });

  it.each([
    ['valid', 'finalize', { status: 'saved', journal }],
    ['absent', 'needs_user:local_media_missing', { status: 'needs_user', journal }],
    ['corrupt', 'needs_user:local_media_corrupt', { status: 'needs_user', journal }],
  ] as const)('recovers a pending row with %s immutable artifact', async (artifact, expectedEvent, expected) => {
    const run = dependencies({ artifact });
    await expect(recoverReviewedDraft(journal, run.dependencies)).resolves.toEqual(expected);
    expect(run.events).toEqual([`inspect:${artifact}`, expectedEvent]);
    expect(run.events.some((event) => event.startsWith('commit:'))).toBe(false);
  });

  it('leaves a pending row unchanged when native key or crypto capability is temporarily unavailable', async () => {
    const run = dependencies({ artifact: 'retryable_unavailable' });
    await expect(recoverReviewedDraft(journal, run.dependencies)).resolves.toEqual({ status: 'local_persisting', journal });
    expect(run.events).toEqual(['inspect:retryable_unavailable']);
  });

  it('marks an unknown journal encryption version needs_user without inspecting it as v1', async () => {
    const run = dependencies({ artifact: 'valid' });
    const unknownVersion = { ...journal, encryptionVersion: 'aes-256-gcm.v2' } as never;
    await expect(recoverReviewedDraft(unknownVersion, run.dependencies))
      .resolves.toEqual({ status: 'needs_user', journal: unknownVersion });
    expect(run.events).toEqual(['needs_user:version_mismatch']);
  });

  it('cleans stale processor caches, recovers pending rows, and sweeps temp artifacts without final references', async () => {
    const completeRef = 'reviewed-media/media-87654321.commit-87654321.agcm';
    const events: string[] = [];
    await recoverPendingReviewedDrafts([
      {
        id: journal.draftId, notes: '', risk: 'normal', mediaId: journal.mediaId,
        encryptedReviewedRef: journal.encryptedReviewedRef, encryptionVersion: 'aes-256-gcm.v1', receipt,
        uploadJob: { state: 'local_persisting', attempts: 0, nextAttemptAt: null, lastError: null },
      },
      {
        id: 'draft-87654321', notes: '', risk: 'normal', mediaId: 'media-87654321',
        encryptedReviewedRef: completeRef, encryptionVersion: 'aes-256-gcm.v1', receipt,
        uploadJob: { state: 'upload_pending', attempts: 0, nextAttemptAt: null, lastError: null },
      },
    ], {
      cleanupStaleProcessorCaches: async () => { events.push('cache_cleanup'); },
      inspectArtifact: async () => { events.push('inspect'); return 'valid'; },
      finalizeJournal: async () => { events.push('finalize'); },
      markNeedsUser: async () => { events.push('needs_user'); },
      sweepArtifacts: async () => { events.push('sweep_temps'); },
    });
    expect(events).toEqual([
      'cache_cleanup',
      'inspect',
      'finalize',
      'sweep_temps',
    ]);
  });

  it('selects fail-closed recovery without treating existence as validity', () => {
    expect(decideLocalMediaRecovery('local_persisting', 'valid')).toBe('finalize');
    expect(decideLocalMediaRecovery('local_persisting', 'absent')).toBe('needs_reselection');
    expect(decideLocalMediaRecovery('local_persisting', 'corrupt')).toBe('needs_user_corrupt');
    expect(decideLocalMediaRecovery('local_persisting', 'retryable_unavailable')).toBe('retry_later');
    expect(decideLocalMediaRecovery('local_persisting', 'version_mismatch')).toBe('needs_user_version');
    expect(decideLocalMediaRecovery('upload_pending', 'valid')).toBe('none');
  });
});
