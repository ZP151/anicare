import {
  ATTACH_SIGHTING_TO_DRAFT_SQL,
  CLEAR_PENDING_MEDIA_CLEANUP_SQL,
  PENDING_MEDIA_CLEANUP_LIST_SQL,
  QUARANTINED_MEDIA_CLEANUP_SQL,
  attachSightingToDraftWithDependencies,
  cleanupQuarantinedMediaWithDependencies,
  cleanupPendingReviewedMediaReferencesWithDependencies,
  deleteOfflineDraftWithDependencies,
  deserializeDraftRows,
  DRAFT_LIST_SQL,
  DRAFT_SAVE_SQL,
  ENCRYPTION_VERSION_BACKFILL_SQL,
  ensureDraftTransportSchemaWithDependencies,
  getPendingReviewedMediaVersionMismatch,
  LEGACY_REVIEWED_PATH_CLEAR_SQL,
  LEGACY_URI_CLEAR_SQL,
  MEDIA_JOURNAL_SAVE_SQL,
  MEDIA_UPLOAD_CAS_SQL,
  MEDIA_VERSION_MISMATCH_SQL,
  claimMediaUploadAttemptWithDependencies,
  saveReviewedMediaJournalWithDependencies,
  selectPendingCleanupForReplacement,
  transitionClaimedMediaUploadWithDependencies,
  type MediaUploadCasDependencies,
} from './draft-store.native';
import { selectReviewedMediaSweepTargets } from '../media/media-reference';
import { recoverPendingReviewedDrafts } from '../media/reviewed-draft';
import { UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION } from './draft-policy';

describe('native draft storage privacy boundary', () => {
  it('attaches a recovered sighting through a narrow immutable update', async () => {
    let current = { id: 'draft-12345678', notes: 'tabby', risk: 'normal' as const };
    const updates: Array<[string, string]> = [];

    await expect(attachSightingToDraftWithDependencies(
      'draft-12345678',
      '12345678-1234-1234-1234-123456789abc',
      'owner-12345678',
      {
        getOfflineDraft: async () => current,
        attachSightingId: async (id, sightingId) => {
          updates.push([id, sightingId]);
          current = { ...current, sightingId, ownerSubject: 'owner-12345678' } as typeof current;
          return true;
        },
      },
    )).resolves.toBe(true);

    expect(updates).toEqual([['draft-12345678', '12345678-1234-1234-1234-123456789abc']]);
    expect(ATTACH_SIGHTING_TO_DRAFT_SQL).toContain('sighting_id = ?');
    expect(ATTACH_SIGHTING_TO_DRAFT_SQL).not.toContain('notes =');
    expect(ATTACH_SIGHTING_TO_DRAFT_SQL).not.toContain('reviewed_media_ref =');
  });

  it('allows only the matching immutable sighting id to replay after a lost response', async () => {
    const current = {
      id: 'draft-12345678', notes: 'tabby', risk: 'normal' as const,
      sightingId: '12345678-1234-1234-1234-123456789abc',
      ownerSubject: 'owner-12345678',
    };
    const attachSightingId = jest.fn(async () => true);

    await expect(attachSightingToDraftWithDependencies(
      current.id, current.sightingId, 'owner-12345678', { getOfflineDraft: async () => current, attachSightingId },
    )).resolves.toBe(true);
    await expect(attachSightingToDraftWithDependencies(
      current.id, '87654321-1234-1234-1234-123456789abc', 'owner-12345678', { getOfflineDraft: async () => current, attachSightingId },
    )).resolves.toBe(false);
    expect(attachSightingId).not.toHaveBeenCalled();
  });

  it('binds an attached sighting to one immutable authenticated owner', async () => {
    const current = {
      id: 'draft-12345678', notes: 'tabby', risk: 'normal' as const,
      sightingId: '12345678-1234-1234-1234-123456789abc', ownerSubject: 'owner-12345678',
    };
    const attachSightingId = jest.fn(async () => true);
    await expect(attachSightingToDraftWithDependencies(
      current.id, current.sightingId, current.ownerSubject, { getOfflineDraft: async () => current, attachSightingId },
    )).resolves.toBe(true);
    await expect(attachSightingToDraftWithDependencies(
      current.id, current.sightingId, 'owner-87654321', { getOfflineDraft: async () => current, attachSightingId },
    )).resolves.toBe(false);
    expect(attachSightingId).not.toHaveBeenCalled();
  });

  it('never lets B attach a first sighting to media already owned by A', async () => {
    const current = {
      id: 'draft-12345678', notes: '', risk: 'normal' as const, mediaId: 'media-12345678',
      ownerSubject: 'owner-12345678', encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
    };
    const attachSightingId = jest.fn(async () => true);
    await expect(attachSightingToDraftWithDependencies(
      current.id, '12345678-1234-1234-1234-123456789abc', 'owner-87654321',
      { getOfflineDraft: async () => current, attachSightingId },
    )).resolves.toBe(false);
    expect(attachSightingId).not.toHaveBeenCalled();
    expect(ATTACH_SIGHTING_TO_DRAFT_SQL).toContain('owner_subject = ? OR');
  });

  it('removes a media row only after the coordinator has durably persisted quarantine', async () => {
    const deleted = jest.fn(async () => true);
    await expect(cleanupQuarantinedMediaWithDependencies('draft-12345678', 4, {
      deleteQuarantinedMedia: deleted,
    })).resolves.toBeUndefined();
    await expect(cleanupQuarantinedMediaWithDependencies('draft-12345678', 4, {
      deleteQuarantinedMedia: async () => false,
    })).rejects.toThrow('quarantined_media_cleanup_conflict');
    expect(deleted).toHaveBeenCalledWith('draft-12345678', 4);
    expect(QUARANTINED_MEDIA_CLEANUP_SQL).toContain("upload_state = 'quarantined'");
    expect(QUARANTINED_MEDIA_CLEANUP_SQL).toContain('revision = ?');
  });

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

  it('executes migration/backfill invariants against an injected state model', async () => {
    const events: string[] = [];
    const columns = new Set([
      'id', 'notes', 'risk', 'reviewed_media_ref', 'encryption_version', 'updated_at', 'reviewed_media_path',
    ]);
    const row = {
      reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryption_version: null as string | null,
      reviewed_media_path: 'file:///legacy/private/path.agcm' as string | null,
      revision: undefined as number | undefined,
      owner_subject: 'owner-12345678',
      pending_media_cleanup_ref: undefined as string | null | undefined,
    };
    await ensureDraftTransportSchemaWithDependencies({
      listColumns: async () => [...columns],
      addColumn: async (name, _type) => {
        events.push(`add:${name}`);
        columns.add(name);
        if (name === 'revision') row.revision = 0;
        if (name === 'pending_media_cleanup_ref') row.pending_media_cleanup_ref = null;
      },
      backfillEncryptionVersion: async () => {
        events.push('backfill');
        if (row.reviewed_media_ref && row.encryption_version === null) row.encryption_version = 'aes-256-gcm.v1';
      },
      clearLegacyReviewedPath: async () => { events.push('clear-legacy-path'); row.reviewed_media_path = null; },
    });
    expect(columns.has('upload_resume_state')).toBe(true);
    expect(columns.has('upload_attempt_started_at')).toBe(true);
    expect(columns.has('revision')).toBe(true);
    expect(columns.has('pending_media_cleanup_ref')).toBe(true);
    expect(row).toEqual({
      reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryption_version: 'aes-256-gcm.v1',
      reviewed_media_path: null,
      revision: 0,
      owner_subject: 'owner-12345678',
      pending_media_cleanup_ref: null,
    });
    expect(events.at(-2)).toBe('backfill');
    expect(events.at(-1)).toBe('clear-legacy-path');
  });

  it('deserializes a valid legacy AHM1 row as v1 after the migration backfill', () => {
    const row = {
      id: 'draft-12345678', notes: 'legacy', risk: 'normal' as const,
      media_id: 'media-12345678', sighting_id: 'sighting-12345678', owner_subject: 'owner-12345678',
      reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryption_version: null as string | null,
      review_receipt_json: JSON.stringify({
        sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      }),
      upload_state: 'upload_pending', upload_attempts: 0, next_attempt_at: null,
      last_error: null, upload_resume_state: null, upload_attempt_started_at: null, revision: 0,
    };
    if (row.reviewed_media_ref && row.encryption_version === null) {
      row.encryption_version = 'aes-256-gcm.v1';
    }

    const [draft] = deserializeDraftRows([row]);

    expect(draft.encryptionVersion).toBe('aes-256-gcm.v1');
    expect(draft.mediaFailure).toBeUndefined();
    expect(getPendingReviewedMediaVersionMismatch(draft)).toBeUndefined();
  });

  it('atomically writes a complete journal/lease snapshot and advances revision', () => {
    for (const field of [
      'media_id', 'reviewed_media_ref', 'encryption_version', 'review_receipt_json',
      'upload_state', 'upload_attempts', 'next_attempt_at', 'last_error',
      'upload_resume_state', 'upload_attempt_started_at', 'revision = revision + 1',
      'pending_media_cleanup_ref',
    ]) {
      expect(MEDIA_JOURNAL_SAVE_SQL).toContain(field);
    }
    for (const preserved of ['notes', 'risk']) {
      expect(MEDIA_JOURNAL_SAVE_SQL).not.toContain(preserved);
    }
    expect(MEDIA_JOURNAL_SAVE_SQL).not.toContain('sighting_id =');
    expect(MEDIA_JOURNAL_SAVE_SQL).toContain('owner_subject = COALESCE(owner_subject, ?)');
    expect(MEDIA_JOURNAL_SAVE_SQL).toContain('owner_subject = ? OR');
    expect(MEDIA_JOURNAL_SAVE_SQL).toContain("upload_state = 'local_persisting'");
    expect(MEDIA_JOURNAL_SAVE_SQL).toContain('media_id IS NULL');
    expect(MEDIA_JOURNAL_SAVE_SQL).toContain('media_id = ?');
    expect(MEDIA_JOURNAL_SAVE_SQL).toContain('sighting_id IS NULL');
    expect(MEDIA_JOURNAL_SAVE_SQL).toContain('upload_attempts = 0');
    expect(MEDIA_JOURNAL_SAVE_SQL).toContain("upload_state IN ('local_persisting', 'upload_pending', 'needs_user')");
    expect(MEDIA_JOURNAL_SAVE_SQL).not.toContain("upload_state IN ('uploading', 'finalizing', 'waiting')");
  });

  it('cleans a prior owned reference only after its replacement commits durably', async () => {
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
    await saveReviewedMediaJournalWithDependencies(journal, 'local_persisting', null, 'owner-12345678', {
      commitMediaSnapshot: async (snapshot) => {
        events.push(`commit:${snapshot.mediaId}:${snapshot.uploadJob.state}`);
      },
      cleanupPendingMedia: async (draftId) => {
        events.push(`cleanup:${draftId}:${previous}`);
      },
    });
    expect(events).toEqual([
      'commit:media-12345678:local_persisting',
      `cleanup:draft-12345678:${previous}`,
    ]);
  });

  it('binds the authenticated owner in the first durable media journal snapshot', async () => {
    let storedOwner: string | undefined;
    await saveReviewedMediaJournalWithDependencies(reviewedJournal(), 'local_persisting', null, 'owner-12345678', {
      commitMediaSnapshot: async (snapshot: { ownerSubject: string }) => { storedOwner = snapshot.ownerSubject; },
      cleanupPendingMedia: async () => undefined,
    } as never);
    expect(storedOwner).toBe('owner-12345678');
  });

  it('fails truthfully before creating an ownerless media journal while signed out', async () => {
    const commitMediaSnapshot = jest.fn(async () => undefined);
    await expect(saveReviewedMediaJournalWithDependencies(reviewedJournal(), 'local_persisting', null, '', {
      commitMediaSnapshot,
      cleanupPendingMedia: async () => undefined,
    } as never)).rejects.toThrow('authentication_required');
    expect(commitMediaSnapshot).not.toHaveBeenCalled();
  });

  it('treats replay of the same immutable journal snapshot as idempotent', async () => {
    const reference = 'reviewed-media/media-12345678.commit-12345678.agcm';
    await saveReviewedMediaJournalWithDependencies({
      draftId: 'draft-12345678', mediaId: 'media-12345678', encryptedReviewedRef: reference,
      encryptionVersion: 'aes-256-gcm.v1',
      receipt: {
        sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
    }, 'local_persisting', null, 'owner-12345678', {
      commitMediaSnapshot: async () => undefined,
      cleanupPendingMedia: async () => undefined,
    });
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
    await expect(saveReviewedMediaJournalWithDependencies(journal, 'upload_pending', null, 'owner-12345678', {
      commitMediaSnapshot: async () => { throw new Error('database_locked'); },
      cleanupPendingMedia: async () => { throw new Error('must_not_run'); },
    })).rejects.toThrow('database_locked');
  });

  it('does not report a durable journal failure when post-commit cleanup must retry at startup', async () => {
    const events: string[] = [];
    await expect(saveReviewedMediaJournalWithDependencies(reviewedJournal(), 'upload_pending', null, 'owner-12345678', {
      commitMediaSnapshot: async () => { events.push('commit'); },
      cleanupPendingMedia: async () => { events.push('cleanup'); throw new Error('crash_before_delete'); },
    })).resolves.toBeUndefined();
    expect(events).toEqual(['commit', 'cleanup']);
  });

  it('rejects a second replacement until the prior pending cleanup is cleared', () => {
    const active = 'reviewed-media/media-12345678.commit-12345678.agcm';
    const pending = 'reviewed-media/media-87654321.commit-87654321.agcm';
    expect(selectPendingCleanupForReplacement(active, pending, active)).toBe(pending);
    expect(() => selectPendingCleanupForReplacement(
      active, pending, 'reviewed-media/media-abcdefgh.commit-abcdefgh.agcm',
    )).toThrow('pending_media_cleanup_conflict');
    expect(selectPendingCleanupForReplacement(pending, null, active)).toBe(pending);
  });

  it('retries cleanup across delete and CAS-clear crash boundaries', async () => {
    const pending = 'reviewed-media/media-87654321.commit-87654321.agcm';
    const job = {
      draftId: 'draft-12345678',
      activeReference: 'reviewed-media/media-12345678.commit-12345678.agcm',
      pendingReference: pending,
      revision: 7,
    };
    const deleted: string[] = [];
    await expect(cleanupPendingReviewedMediaReferencesWithDependencies({
      listPendingCleanup: async () => [job],
      deleteOwnedReference: async () => { throw new Error('crash_before_delete'); },
      clearPendingCleanup: async () => true,
    })).rejects.toThrow('crash_before_delete');

    await expect(cleanupPendingReviewedMediaReferencesWithDependencies({
      listPendingCleanup: async () => [job],
      deleteOwnedReference: async (reference) => { deleted.push(reference); },
      clearPendingCleanup: async () => false,
    })).rejects.toThrow('pending_media_cleanup_conflict');
    await expect(cleanupPendingReviewedMediaReferencesWithDependencies({
      listPendingCleanup: async () => [{ ...job, revision: 8 }],
      deleteOwnedReference: async (reference) => { deleted.push(reference); },
      clearPendingCleanup: async () => true,
    })).resolves.toBeUndefined();
    expect(deleted).toEqual([pending, pending]);
    expect(CLEAR_PENDING_MEDIA_CLEANUP_SQL).toContain('revision = ?');
    expect(CLEAR_PENDING_MEDIA_CLEANUP_SQL).toContain('reviewed_media_ref = ?');
    expect(CLEAR_PENDING_MEDIA_CLEANUP_SQL).toContain('pending_media_cleanup_ref = ?');
  });

  it.each([
    'file:///attacker/media.agcm',
    'reviewed-media/../media-12345678.commit-12345678.agcm',
    'reviewed-media/symlink.agcm',
  ])('never deletes an unowned pending cleanup reference: %s', async (pendingReference) => {
    const deleteOwnedReference = jest.fn(async () => undefined);
    await expect(cleanupPendingReviewedMediaReferencesWithDependencies({
      listPendingCleanup: async () => [{
        draftId: 'draft-12345678',
        activeReference: 'reviewed-media/media-12345678.commit-12345678.agcm',
        pendingReference,
        revision: 1,
      }],
      deleteOwnedReference,
      clearPendingCleanup: async () => true,
    })).rejects.toThrow('invalid_pending_media_cleanup');
    expect(deleteOwnedReference).not.toHaveBeenCalled();
  });

  it('selects only durable pending final references and never source capabilities', () => {
    expect(PENDING_MEDIA_CLEANUP_LIST_SQL).toContain('pending_media_cleanup_ref IS NOT NULL');
    for (const forbidden of ['source_uri', 'photo_uri', 'access_token', 'canonical_uri']) {
      expect(PENDING_MEDIA_CLEANUP_LIST_SQL).not.toContain(forbidden);
    }
    expect(DRAFT_LIST_SQL).toContain('pending_media_cleanup_ref');
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

  it('will not claim a media row while its durable replacement-cleanup outbox remains', async () => {
    const current = {
      id: 'draft-12345678', notes: '', risk: 'normal' as const,
      mediaId: 'media-12345678', sightingId: 'sighting-12345678', ownerSubject: 'owner-12345678', revision: 4,
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm', encryptionVersion: 'aes-256-gcm.v1' as const,
      receipt: reviewedJournal().receipt,
      uploadJob: { state: 'upload_pending' as const, attempts: 0, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: null },
      pendingMediaCleanupRef: 'reviewed-media/media-87654321.commit-87654321.agcm',
    };
    const compareAndSwapUploadJob = jest.fn(async () => true);
    await expect(claimMediaUploadAttemptWithDependencies(
      current.id, new Date('2026-08-27T00:00:00.000Z'), 60_000, 'owner-12345678',
      { getOfflineDraft: async () => current, compareAndSwapUploadJob },
    )).resolves.toBeNull();
    expect(compareAndSwapUploadJob).not.toHaveBeenCalled();
  });

  it('clears the whole lease snapshot and advances revision for version failure', () => {
    expect(MEDIA_VERSION_MISMATCH_SQL).toContain('upload_resume_state = NULL');
    expect(MEDIA_VERSION_MISMATCH_SQL).toContain('upload_attempt_started_at = NULL');
    expect(MEDIA_VERSION_MISMATCH_SQL).toContain('revision = revision + 1');
    expect(MEDIA_VERSION_MISMATCH_SQL).toContain('revision = ? AND upload_state = ?');
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

  it('fails closed for a legacy media row with no immutable owner subject', () => {
    const receipt = JSON.stringify({
      sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    });
    const [draft] = deserializeDraftRows([{
      id: 'draft-12345678', notes: 'legacy', risk: 'normal', media_id: 'media-12345678',
      sighting_id: 'sighting-12345678', owner_subject: null,
      reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryption_version: 'aes-256-gcm.v1', review_receipt_json: receipt,
      upload_state: 'upload_pending', upload_attempts: 0, next_attempt_at: null, last_error: null,
      upload_resume_state: null, upload_attempt_started_at: null, revision: 2,
    }]);
    expect(draft).toEqual(expect.objectContaining({
      mediaFailure: 'auth_ownership',
      uploadJob: expect.objectContaining({ state: 'needs_user', lastError: 'auth_ownership' }),
    }));
  });

  it('round-trips an attached sighting-only native row as a text-only draft', () => {
    const drafts = deserializeDraftRows([{
      id: 'draft-12345678', notes: 'saved text', risk: 'sensitive', media_id: null,
      sighting_id: '12345678-1234-1234-1234-123456789abc', reviewed_media_ref: null,
      encryption_version: null, review_receipt_json: null, upload_state: null,
      upload_attempts: null, next_attempt_at: null, last_error: null,
      upload_resume_state: null, upload_attempt_started_at: null, revision: 4,
    }]);

    expect(drafts).toEqual([{
      id: 'draft-12345678', notes: 'saved text', risk: 'sensitive',
      sightingId: '12345678-1234-1234-1234-123456789abc', revision: 4,
    }]);
  });

  it.each([
    ['sighting_id', 'bad'],
    ['upload_state', 'upload_pending'],
    ['upload_attempts', 0],
    ['next_attempt_at', '2026-08-27T00:00:10.000Z'],
    ['last_error', 'network'],
    ['upload_resume_state', 'uploading'],
    ['upload_attempt_started_at', '2026-08-27T00:00:00.000Z'],
  ] as const)('classifies residual %s workflow state as explicit media corruption', (field, value) => {
    const row = {
      id: 'draft-12345678', notes: 'residual', risk: 'normal' as const,
      media_id: null, sighting_id: null, reviewed_media_ref: null, encryption_version: null,
      review_receipt_json: null, upload_state: null, upload_attempts: null,
      next_attempt_at: null, last_error: null, upload_resume_state: null,
      upload_attempt_started_at: null, revision: 3,
      [field]: value,
    };
    expect(deserializeDraftRows([row])).toEqual([expect.objectContaining({
      id: 'draft-12345678', revision: 3, mediaFailure: 'local_media_corrupt',
      uploadJob: expect.objectContaining({ state: 'needs_user', lastError: 'local_media_corrupt' }),
    })]);
  });

  it('fails closed when an attached sighting row also retains upload workflow residue', () => {
    const drafts = deserializeDraftRows([{
      id: 'draft-12345678', notes: 'residual', risk: 'normal', media_id: null,
      sighting_id: '12345678-1234-1234-1234-123456789abc', reviewed_media_ref: null,
      encryption_version: null, review_receipt_json: null, upload_state: 'upload_pending',
      upload_attempts: 0, next_attempt_at: null, last_error: null,
      upload_resume_state: null, upload_attempt_started_at: null, revision: 3,
    }]);

    expect(drafts).toEqual([expect.objectContaining({
      sightingId: '12345678-1234-1234-1234-123456789abc',
      mediaFailure: 'local_media_corrupt',
      uploadJob: expect.objectContaining({ state: 'needs_user', lastError: 'local_media_corrupt' }),
    })]);
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
      sighting_id: 'sighting-12345678', owner_subject: 'owner-12345678', reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
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
    expect(getPendingReviewedMediaVersionMismatch(drafts[0])).toEqual({
      expectedRevision: 2,
      expectedState: 'upload_pending',
    });
    expect(JSON.stringify(drafts[0])).not.toContain('aes-256-gcm.v2');

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

  it('does not request another durable version marker for an already-marked row', () => {
    const receipt = JSON.stringify({
      sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    });
    const [draft] = deserializeDraftRows([{
      id: 'draft-12345678', notes: 'marked', risk: 'normal', media_id: 'media-12345678',
      sighting_id: 'sighting-12345678', owner_subject: 'owner-12345678',
      reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryption_version: 'aes-256-gcm.v2', review_receipt_json: receipt,
      upload_state: 'needs_user', upload_attempts: 2, next_attempt_at: null,
      last_error: 'version_mismatch', upload_resume_state: null,
      upload_attempt_started_at: null, revision: 3,
    }]);

    expect(getPendingReviewedMediaVersionMismatch(draft)).toBeUndefined();
  });

  it('repairs residual lease fields even when a version mismatch state/error was already written', () => {
    const receipt = JSON.stringify({
      sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    });
    const [draft] = deserializeDraftRows([{
      id: 'draft-12345678', notes: 'residual', risk: 'normal', media_id: 'media-12345678',
      sighting_id: 'sighting-12345678', owner_subject: 'owner-12345678',
      reviewed_media_ref: 'reviewed-media/media-12345678.commit-12345678.agcm',
      encryption_version: 'aes-256-gcm.v2', review_receipt_json: receipt,
      upload_state: 'needs_user', upload_attempts: 2, next_attempt_at: '2026-08-27T00:01:00.000Z',
      last_error: 'version_mismatch', upload_resume_state: 'uploading',
      upload_attempt_started_at: null, revision: 5,
    }]);

    expect(getPendingReviewedMediaVersionMismatch(draft)).toEqual({
      expectedRevision: 5,
      expectedState: 'needs_user',
    });
  });

  it.each([
    ['reviewed-media/media-12345678.commit-12345678.agcm', 'reviewed-media/media-87654321.commit-87654321.agcm', [
      'reviewed-media/media-12345678.commit-12345678.agcm',
      'reviewed-media/media-87654321.commit-87654321.agcm',
    ]],
    ['file:///attacker/reviewed-media/media-12345678.commit-12345678.agcm', 'reviewed-media/symlink.agcm', []],
  ] as const)('deletes only anchored active and outbox ciphertext after deleting its draft: %s', async (reference, pending, expectedDeleted) => {
    const events: string[] = [];
    await deleteOfflineDraftWithDependencies('draft-12345678', {
      loadReviewedReferences: async () => ({ active: reference, pending }),
      deleteRow: async () => { events.push('row'); },
      deleteOwnedReference: async (value) => { events.push(value); },
    });
    expect(events).toEqual(['row', ...expectedDeleted]);
  });

  it('claims exactly one concurrent runner and increments before returning the claim', async () => {
    const store = mediaUploadCasStore();
    const [left, right] = await Promise.all([
      claimMediaUploadAttemptWithDependencies(
        'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, 'owner-12345678', store.dependencies,
      ),
      claimMediaUploadAttemptWithDependencies(
        'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, 'owner-12345678', store.dependencies,
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
      'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, 'owner-12345678', store.dependencies,
    );
    expect(first).not.toBeNull();
    await expect(claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:00:30.000Z'), 60_000, 'owner-12345678', store.dependencies,
    )).resolves.toBeNull();
    const reclaimed = await claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:01:01.000Z'), 60_000, 'owner-12345678', store.dependencies,
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
      'draft-12345678', new Date('2026-08-27T00:03:00.000Z'), 60_000, 'owner-12345678', store.dependencies,
    )).resolves.toBeNull();
  });

  it('renews an expired fifth active claim without consuming attempt six', async () => {
    const store = mediaUploadCasStore();
    store.current = {
      ...store.current!, revision: 12,
      uploadJob: {
        state: 'finalizing', attempts: 5, nextAttemptAt: null, lastError: null,
        resumeState: null, attemptStartedAt: '2026-08-27T00:00:00.000Z',
      },
    };
    const recovery = await claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:02:00.000Z'), 60_000, 'owner-12345678', store.dependencies,
    );
    expect(recovery).toMatchObject({
      revision: 13, recovering: true, recoveryOnly: true,
      uploadJob: { state: 'finalizing', attempts: 5, attemptStartedAt: '2026-08-27T00:02:00.000Z' },
    });
    expect(store.current?.uploadJob?.attempts).toBe(5);
  });

  it('rejects stale revisions from moving finalizing or quarantined backward', async () => {
    const store = mediaUploadCasStore();
    const claim = await claimMediaUploadAttemptWithDependencies(
      'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, 'owner-12345678', store.dependencies,
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
      'draft-12345678', new Date('2026-08-27T00:00:00.000Z'), 60_000, 'owner-12345678', store.dependencies,
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

function reviewedJournal() {
  return {
    draftId: 'draft-12345678', mediaId: 'media-12345678',
    encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
    encryptionVersion: 'aes-256-gcm.v1' as const,
    receipt: {
      sanitizedSha256: 'a'.repeat(64), recipeVersion: 'jpeg-srgb-2048-q88.v1' as const,
      detectorVersions: { cats: 'unavailable' as const, people: 'unavailable' as const, plates: 'unavailable' as const },
      width: 100, height: 100, byteLength: 100, confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    },
  };
}

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
      ownerSubject: 'owner-12345678',
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
