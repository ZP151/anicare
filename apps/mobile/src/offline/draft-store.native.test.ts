import {
  deleteOfflineDraftWithDependencies,
  deserializeDraftRows,
  DRAFT_LIST_SQL,
  DRAFT_SAVE_SQL,
  ENCRYPTION_VERSION_BACKFILL_SQL,
  LEGACY_REVIEWED_PATH_CLEAR_SQL,
  LEGACY_URI_CLEAR_SQL,
  MEDIA_JOURNAL_SAVE_SQL,
  MEDIA_UPLOAD_CAS_SQL,
  MEDIA_VERSION_MISMATCH_SQL,
  claimMediaUploadAttemptWithDependencies,
  saveReviewedMediaJournalWithDependencies,
  transitionClaimedMediaUploadWithDependencies,
  type MediaUploadCasDependencies,
} from './draft-store.native';
import { selectReviewedMediaSweepTargets } from '../media/media-reference';
import { recoverPendingReviewedDrafts } from '../media/reviewed-draft';
import { UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION } from './draft-policy';

describe('native draft storage privacy boundary', () => {
  it('never writes or reads photo_uri and clears legacy values', () => {
    expect(DRAFT_SAVE_SQL).not.toContain('photo_uri');
    expect(DRAFT_LIST_SQL).not.toContain('photo_uri');
    expect(LEGACY_URI_CLEAR_SQL).toBe('UPDATE sighting_drafts SET photo_uri = NULL;');
  });

  it('clears the legacy absolute reviewed-media path during schema migration', () => {
    expect(LEGACY_REVIEWED_PATH_CLEAR_SQL).toBe('UPDATE sighting_drafts SET reviewed_media_path = NULL;');
  });

  it('stores only the opaque reviewed reference, receipt, stable IDs and bounded retry fields', () => {
    for (const field of [
      'reviewed_media_ref', 'encryption_version', 'review_receipt_json', 'media_id', 'sighting_id',
      'upload_state', 'upload_attempts', 'next_attempt_at', 'last_error', 'upload_resume_state',
      'upload_attempt_started_at',
    ]) {
      expect(DRAFT_SAVE_SQL).toContain(field);
      expect(DRAFT_LIST_SQL).toContain(field);
    }
    for (const forbidden of ['reviewed_media_path', 'source_uri', 'canonical_uri', 'latitude', 'longitude', 'access_token']) {
      expect(DRAFT_SAVE_SQL).not.toContain(forbidden);
      expect(DRAFT_LIST_SQL).not.toContain(forbidden);
    }
  });

  it('backfills pre-version AHM1 journal rows before exact version sanitization', () => {
    expect(ENCRYPTION_VERSION_BACKFILL_SQL).toContain("encryption_version = 'aes-256-gcm.v1'");
    expect(ENCRYPTION_VERSION_BACKFILL_SQL).toContain('reviewed_media_ref IS NOT NULL');
    expect(ENCRYPTION_VERSION_BACKFILL_SQL).toContain('encryption_version IS NULL');
  });

  it('updates only the complete media journal snapshot and never overwrites report or later upload fields', () => {
    for (const field of ['media_id', 'reviewed_media_ref', 'encryption_version', 'review_receipt_json', 'upload_state', 'upload_attempts', 'next_attempt_at', 'last_error']) {
      expect(MEDIA_JOURNAL_SAVE_SQL).toContain(field);
    }
    for (const preserved of ['notes', 'risk', 'sighting_id', 'upload_resume_state', 'upload_attempt_started_at', 'revision']) {
      expect(MEDIA_JOURNAL_SAVE_SQL).not.toContain(preserved);
    }
  });

  it('exposes a previous owned reference only after the replacement snapshot commits durably', async () => {
    const events: string[] = [];
    const previous = 'reviewed-media/media-87654321.commit-87654321.agcm';
    const journal = {
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryptionVersion: 'aes-256-gcm.v1' as const,
      receipt: {
        sanitizedSha256: 'a'.repeat(64),
        recipeVersion: 'jpeg-srgb-2048-q88.v1' as const,
        detectorVersions: { cats: 'unavailable' as const, people: 'unavailable' as const, plates: 'unavailable' as const },
        width: 100,
        height: 100,
        byteLength: 100,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
    };
    const result = await saveReviewedMediaJournalWithDependencies(journal, 'local_persisting', null, {
      commitMediaSnapshot: async (snapshot) => {
        events.push(`commit:${snapshot.mediaId}:${snapshot.uploadJob.state}`);
        return previous;
      },
    });
    events.push(`cleanup:${result}`);
    expect(result).toBe(previous);
    expect(events).toEqual([
      'commit:media-12345678:local_persisting',
      `cleanup:${previous}`,
    ]);
  });

  it('does not expose the previous reference when the new journal snapshot fails to commit', async () => {
    const journal = {
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryptionVersion: 'aes-256-gcm.v1' as const,
      receipt: {
        sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1' as const,
        detectorVersions: { cats: 'unavailable' as const, people: 'unavailable' as const, plates: 'unavailable' as const },
        width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
    };
    await expect(saveReviewedMediaJournalWithDependencies(journal, 'upload_pending', null, {
      commitMediaSnapshot: async () => { throw new Error('database_locked'); },
    })).rejects.toThrow('database_locked');
  });

  it('replaces the complete retry snapshot for media updates so stale errors and delays can clear', () => {
    expect(DRAFT_SAVE_SQL).toContain(
      'next_attempt_at = CASE WHEN excluded.media_id IS NOT NULL AND',
    );
    expect(DRAFT_SAVE_SQL).toContain(
      'last_error = CASE WHEN excluded.media_id IS NOT NULL AND',
    );
    expect(DRAFT_SAVE_SQL).toContain(
      'upload_resume_state = CASE WHEN excluded.media_id IS NOT NULL AND',
    );
    expect(DRAFT_SAVE_SQL).toContain(
      'upload_attempt_started_at = CASE WHEN excluded.media_id IS NOT NULL AND',
    );
    expect(DRAFT_SAVE_SQL).toContain('revision = sighting_drafts.revision + 1');
  });

  it('never replaces immutable media identities or lets a generic save overwrite an active CAS state', () => {
    for (const field of ['media_id', 'sighting_id', 'reviewed_media_ref', 'encryption_version', 'review_receipt_json']) {
      expect(DRAFT_SAVE_SQL).toContain(`${field} = COALESCE(sighting_drafts.${field}, excluded.${field})`);
    }
    expect(DRAFT_SAVE_SQL).toContain("sighting_drafts.upload_state = 'local_persisting'");
    expect(DRAFT_SAVE_SQL).toContain('excluded.media_id = sighting_drafts.media_id');
    expect(DRAFT_SAVE_SQL).not.toContain(
      'upload_state = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.upload_state',
    );
  });

  it('uses a narrow revision-and-source-state compare-and-swap update', () => {
    expect(MEDIA_UPLOAD_CAS_SQL).toContain('WHERE id = ? AND revision = ? AND upload_state = ?');
    expect(MEDIA_UPLOAD_CAS_SQL).toContain('revision = revision + 1');
    expect(MEDIA_UPLOAD_CAS_SQL).toContain("upload_state IN ('upload_pending', 'uploading', 'finalizing', 'waiting')");
    expect(MEDIA_UPLOAD_CAS_SQL).not.toContain('review_receipt_json =');
  });

  it('clears the whole lease snapshot and advances revision for version failure', () => {
    expect(MEDIA_VERSION_MISMATCH_SQL).toContain('upload_resume_state = NULL');
    expect(MEDIA_VERSION_MISMATCH_SQL).toContain('upload_attempt_started_at = NULL');
    expect(MEDIA_VERSION_MISMATCH_SQL).toContain('revision = revision + 1');
  });

  it('contains a corrupt receipt row instead of rejecting the entire draft list', () => {
    const validReceipt = JSON.stringify({
      sanitizedSha256: 'a'.repeat(64),
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 100,
      height: 100,
      byteLength: 100,
      confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    });
    const drafts = deserializeDraftRows([
      {
        id: 'draft-12345678', notes: 'valid', risk: 'normal', media_id: 'media-12345678', sighting_id: null,
        reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm', encryption_version: 'aes-256-gcm.v1', review_receipt_json: validReceipt,
        upload_state: 'upload_pending', upload_attempts: 0, next_attempt_at: null, last_error: null,
        upload_resume_state: null, upload_attempt_started_at: null, revision: 0,
      },
      {
        id: 'draft-87654321', notes: 'corrupt receipt', risk: 'sensitive', media_id: 'media-87654321', sighting_id: null,
        reviewed_media_ref: 'reviewed-media/media-87654321.commit-87654321.agcm', encryption_version: 'aes-256-gcm.v1', review_receipt_json: '{broken',
        upload_state: 'local_persisting', upload_attempts: 0, next_attempt_at: null, last_error: null,
        upload_resume_state: null, upload_attempt_started_at: null, revision: 0,
      },
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].encryptedReviewedRef).toBe('reviewed-media/media-12345678.commit-12345678.agcm');
    expect(drafts[0].encryptionVersion).toBe('aes-256-gcm.v1');
    expect(drafts[1]).toEqual(expect.objectContaining({
      id: 'draft-87654321', notes: 'corrupt receipt', risk: 'sensitive',
      mediaId: 'media-87654321',
      encryptedReviewedRef: 'reviewed-media/media-87654321.commit-87654321.agcm',
      mediaFailure: 'local_media_corrupt',
      uploadJob: expect.objectContaining({ state: 'needs_user', lastError: 'local_media_corrupt' }),
    }));
    expect(selectReviewedMediaSweepTargets(
      drafts.map((draft) => draft.encryptedReviewedRef).filter((value): value is string => !!value),
    ))
      .toEqual([]);
  });

  it.each([null, 'aes-256-gcm.v2'])('keeps a persisted %s version row recoverable as needs_user/version_mismatch', async (encryptionVersion) => {
    const receipt = JSON.stringify({
      sanitizedSha256: 'a'.repeat(64),
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 100,
      height: 100,
      byteLength: 100,
      confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    });
    const drafts = deserializeDraftRows([{
      id: 'draft-12345678', notes: 'preserved', risk: 'sensitive', media_id: 'media-12345678',
      sighting_id: 'sighting-12345678', reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryption_version: encryptionVersion, review_receipt_json: receipt,
      upload_state: 'upload_pending', upload_attempts: 2, next_attempt_at: null, last_error: null,
      upload_resume_state: null, upload_attempt_started_at: null, revision: 2,
    }]);
    expect(drafts).toEqual([expect.objectContaining({
      id: 'draft-12345678',
      notes: 'preserved',
      risk: 'sensitive',
      mediaId: 'media-12345678',
      sightingId: 'sighting-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryptionVersion: UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION,
      mediaFailure: 'version_mismatch',
      uploadJob: expect.objectContaining({ state: 'needs_user', lastError: 'version_mismatch' }),
    })]);

    const events: string[] = [];
    await recoverPendingReviewedDrafts(drafts, {
      cleanupStaleProcessorCaches: async () => undefined,
      inspectArtifact: async () => { events.push('inspect'); return 'valid'; },
      finalizeJournal: async () => { events.push('finalize'); },
      markNeedsUser: async (_journal, error) => { events.push(`needs_user:${error}`); },
      sweepArtifacts: async () => undefined,
    });
    expect(events).toEqual([]);
  });

  it.each([
    ['reviewed-media/media-12345678.commit-12345678.agcm', ['reviewed-media/media-12345678.commit-12345678.agcm']],
    ['file:///attacker/reviewed-media/media-12345678.commit-12345678.agcm', []],
    ['reviewed-media/../media-12345678.commit-12345678.agcm', []],
  ] as const)('deletes only an anchored owned ciphertext after deleting its draft: %s', async (reference, expectedDeleted) => {
    const events: string[] = [];
    await deleteOfflineDraftWithDependencies('draft-12345678', {
      loadReviewedReference: async () => reference,
      deleteRow: async () => { events.push('row'); },
      deleteOwnedReference: async (value) => { events.push(value); },
    });
    expect(events).toEqual(['row', ...expectedDeleted]);
  });

  it('claims exactly one concurrent runner and increments before returning the claim', async () => {
    const store = mediaUploadCasStore();
    const [left, right] = await Promise.all([
      claimMediaUploadAttemptWithDependencies(
        'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, store.dependencies,
      ),
      claimMediaUploadAttemptWithDependencies(
        'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, store.dependencies,
      ),
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    expect(left ?? right).toMatchObject({
      draftId: 'draft-12345678', revision: 1, recovering: false,
      uploadJob: { state: 'uploading', attempts: 1, attemptStartedAt: '2026-08-27T00:00:00.000Z' },
    });
  });

  it('blocks a fresh lease, reclaims an expired lease, and refuses attempt six', async () => {
    const store = mediaUploadCasStore();
    const first = await claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, store.dependencies,
    );
    expect(first).not.toBeNull();
    await expect(claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:00:30.000Z'), 60_000, store.dependencies,
    )).resolves.toBeNull();
    const reclaimed = await claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:01:01.000Z'), 60_000, store.dependencies,
    );
    expect(reclaimed).toMatchObject({ revision: 2, recovering: true, uploadJob: { attempts: 2 } });
    store.current = {
      ...store.current!, revision: 8,
      uploadJob: {
        ...store.current!.uploadJob!, state: 'waiting', attempts: 5,
        nextAttemptAt: '2026-08-27T00:02:00.000Z', resumeState: 'uploading', attemptStartedAt: null,
      },
    };
    await expect(claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:03:00.000Z'), 60_000, store.dependencies,
    )).resolves.toBeNull();
  });

  it('rejects stale revisions from moving finalizing or quarantined backward', async () => {
    const store = mediaUploadCasStore();
    const claim = await claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, store.dependencies,
    );
    expect(claim).not.toBeNull();
    const finalizing = {
      ...claim!.uploadJob, state: 'finalizing' as const, resumeState: null, nextAttemptAt: null, lastError: null,
    };
    await expect(transitionClaimedMediaUploadWithDependencies(
      claim!.draftId, claim!.revision, finalizing, store.dependencies,
    )).resolves.toBe(true);
    await expect(transitionClaimedMediaUploadWithDependencies(
      claim!.draftId,
      claim!.revision,
      {
        ...claim!.uploadJob, state: 'waiting', resumeState: 'uploading', attemptStartedAt: null,
        nextAttemptAt: '2026-08-27T00:01:00.000Z', lastError: 'network',
      },
      store.dependencies,
    )).resolves.toBe(false);
    await expect(transitionClaimedMediaUploadWithDependencies(
      claim!.draftId,
      claim!.revision + 1,
      { ...finalizing, state: 'quarantined', attemptStartedAt: null },
      store.dependencies,
    )).resolves.toBe(true);
    await expect(transitionClaimedMediaUploadWithDependencies(
      claim!.draftId, claim!.revision + 1, finalizing, store.dependencies,
    )).resolves.toBe(false);
  });

  it('rejects a transition whose hostile error would be normalized before persistence', async () => {
    const store = mediaUploadCasStore();
    const claim = await claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, store.dependencies,
    );
    await expect(transitionClaimedMediaUploadWithDependencies(
      claim!.draftId,
      claim!.revision,
      {
        ...claim!.uploadJob, state: 'needs_user', nextAttemptAt: null,
        lastError: 'token=secret-path', resumeState: null, attemptStartedAt: null,
      },
      store.dependencies,
    )).resolves.toBe(false);
    expect(store.current?.uploadJob?.state).toBe('uploading');
  });
});

function mediaUploadCasStore() {
  const receipt = {
    sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1' as const,
    detectorVersions: {
      cats: 'unavailable' as const, people: 'unavailable' as const, plates: 'unavailable' as const,
    },
    width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
  };
  const store: {
    current: import('./draft-policy').StoredDraft | null;
    dependencies: MediaUploadCasDependencies;
  } = {
    current: {
      id: 'draft-12345678', notes: 'tabby', risk: 'normal', mediaId: 'media-12345678',
      sightingId: 'sighting-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryptionVersion: 'aes-256-gcm.v1', receipt, revision: 0,
      uploadJob: {
        state: 'upload_pending', attempts: 0, nextAttemptAt: null, lastError: null,
        resumeState: null, attemptStartedAt: null,
      },
    },
    dependencies: undefined as never,
  };
  store.dependencies = {
    getOfflineDraft: async () => store.current,
    compareAndSwapUploadJob: async (_id, expectedRevision, expectedState, next) => {
      if (!store.current || store.current.revision !== expectedRevision ||
          store.current.uploadJob?.state !== expectedState) return false;
      store.current = { ...store.current, revision: expectedRevision + 1, uploadJob: next };
      return true;
    },
  };
  return store;
}
