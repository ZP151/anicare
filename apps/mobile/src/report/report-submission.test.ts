import {
  persistReportDraftBeforeReview,
  nextReportDraftIdAfterSubmission,
  nextReportFormAfterSubmission,
  ReportDraftPersistenceError,
  reportSubmissionFailureStatus,
  reportSubmissionStatus,
  submitReportWithMedia,
  type ReportSubmissionDependencies,
  type SubmitReportWithMediaInput,
} from './report-submission';

const receipt = {
  sanitizedSha256: 'a'.repeat(64),
  recipeVersion: 'jpeg-srgb-2048-q88.v1' as const,
  detectorVersions: { cats: 'unavailable' as const, people: 'unavailable' as const, plates: 'unavailable' as const },
  width: 100,
  height: 100,
  byteLength: 100,
  confirmedAtLocal: '2026-08-27T00:00:00.000Z',
};

const response = {
  sightingId: '12345678-1234-1234-1234-123456789abc',
  visibility: 'hidden' as const,
  visibleAt: null,
  requestId: '87654321-1234-1234-1234-123456789abc',
};

function submission(overrides: Partial<SubmitReportWithMediaInput> = {}): SubmitReportWithMediaInput {
  return {
    draftId: 'draft-12345678',
    notes: 'tabby',
    risk: 'normal',
    traits: {},
    location: null,
    occurredAt: new Date('2026-08-27T00:00:00.000Z'),
    ...overrides,
  };
}

function mediaDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-12345678', notes: 'tabby', risk: 'normal' as const,
    mediaId: 'media-12345678',
    ownerSubject: 'owner-12345678',
    encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
    encryptionVersion: 'aes-256-gcm.v1' as const,
    receipt,
    revision: 0,
    uploadJob: {
      state: 'upload_pending' as const, attempts: 0, nextAttemptAt: null, lastError: null,
      resumeState: null, attemptStartedAt: null,
    },
    ...overrides,
  };
}

function harness(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  let current: any = overrides.current ?? mediaDraft();
  const dependencies: ReportSubmissionDependencies = {
    saveDraft: jest.fn(async (draft: any) => {
      calls.push(`save:${draft.notes}:${draft.risk}`);
      current = current ? { ...current, ...draft } : draft;
      return current;
    }),
    getDraft: jest.fn(async () => current),
    recoverSighting: jest.fn(async () => ({ kind: 'not_found' as const })),
    currentOwnerSubject: jest.fn(async () => 'owner-12345678'),
    createSighting: jest.fn(async () => response),
    attachSighting: jest.fn(async (_draftId: string, sightingId: string, ownerSubject: string) => {
      calls.push(`attach:${sightingId}`);
      current = { ...current, sightingId, ownerSubject };
      return true;
    }),
    uploadMedia: jest.fn(async (draftId: string) => {
      calls.push(`upload:${draftId}`);
      return 'quarantined' as const;
    }),
    deleteDraft: jest.fn(async () => { calls.push('delete'); current = null; }),
    ...overrides,
  };
  return { calls, dependencies, current: () => current };
}

describe('report submission lifecycle', () => {
  it('rotates to a distinct draft identity only after terminal submission outcomes', () => {
    expect(nextReportDraftIdAfterSubmission('draft-12345678', {
      sightingId: response.sightingId, visibility: 'hidden', state: 'submitted_text_only',
    }, 'draft-87654321')).toBe('draft-87654321');
    expect(nextReportDraftIdAfterSubmission('draft-12345678', {
      sightingId: response.sightingId, visibility: 'hidden', state: 'quarantined',
    }, 'draft-87654321')).toBe('draft-87654321');
    for (const state of ['upload_pending', 'uploading', 'finalizing', 'waiting', 'needs_user', 'recovery_miss'] as const) {
      expect(nextReportDraftIdAfterSubmission('draft-12345678', {
        sightingId: response.sightingId, visibility: null, state,
      }, 'draft-87654321')).toBe('draft-12345678');
    }
  });

  it('keeps the terminal safety confirmation visible while preparing the next fresh report', () => {
    const terminal = nextReportFormAfterSubmission('draft-12345678', {
      sightingId: response.sightingId, visibility: 'hidden', state: 'quarantined',
    }, 'draft-87654321');
    expect(terminal).toEqual({ draftId: 'draft-87654321', resetForm: true, keepConfirmation: true });
    const queued = nextReportFormAfterSubmission('draft-12345678', {
      sightingId: response.sightingId, visibility: null, state: 'upload_pending',
    }, 'draft-87654321');
    expect(queued).toEqual({ draftId: 'draft-12345678', resetForm: false, keepConfirmation: false });
  });

  it('keeps consecutive terminal reports on distinct dedupe and sighting identities', async () => {
    const sightingIds = ['12345678-1234-1234-1234-123456789abc', '87654321-1234-1234-1234-123456789abc'];
    const created: string[] = [];
    const submit = async (draftId: string, sightingId: string) => {
      const run = harness({
        current: { id: draftId, notes: 'tabby', risk: 'normal' },
        createSighting: jest.fn(async (input) => {
          created.push(input.clientDedupeKey);
          return { ...response, sightingId };
        }),
      });
      const result = await submitReportWithMedia(submission({
        draftId, location: { kind: 'device_once', latitude: 1.3, longitude: 103.8 },
      }), run.dependencies);
      return { result, calls: run.calls };
    };
    const first = await submit('draft-12345678', sightingIds[0]!);
    const second = await submit('draft-87654321', sightingIds[1]!);

    expect(created).toEqual(['draft-12345678', 'draft-87654321']);
    expect(first.result.sightingId).toBe(sightingIds[0]);
    expect(second.result.sightingId).toBe(sightingIds[1]);
    expect(second.calls).not.toContain(`attach:${sightingIds[0]}`);
  });
  it('persists the visible notes and risk before entering private media review', async () => {
    const calls: string[] = [];
    await persistReportDraftBeforeReview({ draftId: 'draft-12345678', notes: 'ear tip', risk: 'critical' }, {
      saveDraft: async (draft) => { calls.push(`save:${draft.notes}:${draft.risk}`); },
    });

    expect(calls).toEqual(['save:ear tip:critical']);
  });

  it('does not claim a durable recovery path when the initial draft save fails', async () => {
    const run = harness({ saveDraft: jest.fn(async () => { throw new Error('database_locked'); }) });

    await expect(submitReportWithMedia(submission({
      location: { kind: 'device_once', latitude: 1.3, longitude: 103.8 },
    }), run.dependencies)).rejects.toBeInstanceOf(ReportDraftPersistenceError);

    expect(run.dependencies.recoverSighting).not.toHaveBeenCalled();
    expect(run.dependencies.createSighting).not.toHaveBeenCalled();
    expect(run.dependencies.attachSighting).not.toHaveBeenCalled();
    expect(run.dependencies.uploadMedia).not.toHaveBeenCalled();
    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
    expect(reportSubmissionFailureStatus(new ReportDraftPersistenceError())).toBe(
      'Submission could not safely start. Review the report and try again.',
    );
  });

  it('uses neutral visibility copy until the server explicitly reports a public state', () => {
    expect(reportSubmissionStatus({
      sightingId: response.sightingId, visibility: null, state: 'submitted_text_only',
    })).toBe('Submitted. Visibility is being confirmed; it is not public availability.');
    expect(reportSubmissionStatus({
      sightingId: response.sightingId, visibility: 'hidden', state: 'submitted_text_only',
    })).toBe('Submitted for private safety review.');
    expect(reportSubmissionStatus({
      sightingId: response.sightingId, visibility: 'public', state: 'submitted_text_only',
    })).toBe('Submitted. The public update will appear after its safety delay.');
  });

  it('recovers a lost creation response by the stable draft id before creating again', async () => {
    const run = harness();
    jest.mocked(run.dependencies.createSighting)
      .mockRejectedValueOnce(new Error('response_lost'));

    await expect(submitReportWithMedia(submission({
      location: { kind: 'device_once', latitude: 1.3, longitude: 103.8 },
    }), run.dependencies)).rejects.toThrow('response_lost');

    jest.mocked(run.dependencies.recoverSighting).mockResolvedValueOnce(response);
    await expect(submitReportWithMedia(submission(), run.dependencies))
      .resolves.toMatchObject({ state: 'quarantined', sightingId: response.sightingId });

    expect(run.dependencies.recoverSighting).toHaveBeenCalledWith('draft-12345678');
    expect(run.dependencies.createSighting).toHaveBeenCalledTimes(1);
    expect(run.calls).toEqual([
      'save:tabby:normal',
      'save:tabby:normal',
      `attach:${response.sightingId}`,
      'upload:draft-12345678',
    ]);
  });

  it('uses an already durable sighting without retaining or requiring coordinates on retry', async () => {
    const run = harness({ current: mediaDraft({ sightingId: response.sightingId }) });

    await expect(submitReportWithMedia(submission(), run.dependencies))
      .resolves.toMatchObject({ state: 'quarantined', sightingId: response.sightingId });

    expect(run.dependencies.recoverSighting).not.toHaveBeenCalled();
    expect(run.dependencies.createSighting).not.toHaveBeenCalled();
    expect(run.dependencies.attachSighting).not.toHaveBeenCalled();
  });

  it('does not invent a visibility claim for an already attached sighting', async () => {
    const run = harness({ current: mediaDraft({ sightingId: response.sightingId }) });

    await expect(submitReportWithMedia(submission(), run.dependencies))
      .resolves.toMatchObject({ sightingId: response.sightingId, visibility: null });
  });

  it('deletes a text-only draft only after a successful sighting submission', async () => {
    const run = harness({ current: { id: 'draft-12345678', notes: 'tabby', risk: 'normal' } });

    await expect(submitReportWithMedia(submission({
      location: { kind: 'device_once', latitude: 1.3, longitude: 103.8 },
    }), run.dependencies)).resolves.toMatchObject({ state: 'submitted_text_only', sightingId: response.sightingId });

    expect(run.calls).toEqual([
      'save:tabby:normal',
      `attach:${response.sightingId}`,
      'delete',
    ]);
  });

  it('keeps a bound text draft and returns its committed receipt when cleanup rejects', async () => {
    const run = harness({ current: { id: 'draft-12345678', notes: 'tabby', risk: 'normal' } });
    jest.mocked(run.dependencies.deleteDraft).mockImplementation(async () => {
      run.calls.push('delete_attempt');
      throw new Error('cleanup_unavailable');
    });

    await expect(submitReportWithMedia(submission({
      location: { kind: 'device_once', latitude: 1.3521, longitude: 103.8198 },
    }), run.dependencies)).resolves.toEqual({
      sightingId: response.sightingId,
      visibility: 'hidden',
      state: 'cleanup_pending',
      receipt: {
        sightingId: response.sightingId,
        visibility: 'hidden',
        mediaState: 'cleanup_pending',
      },
    });
    expect(run.calls).toEqual(['save:tabby:normal', `attach:${response.sightingId}`, 'delete_attempt']);
    expect(run.current()).toMatchObject({ sightingId: response.sightingId, ownerSubject: 'owner-12345678' });
  });

  it('returns the persisted pending state when upload rejects after attachment', async () => {
    const run = harness();
    jest.mocked(run.dependencies.uploadMedia).mockImplementation(async () => {
      run.calls.push('upload_attempt');
      throw new Error('media_runtime_failed');
    });

    await expect(submitReportWithMedia(submission({
      location: { kind: 'manual_area', publicCellId: '89652636d87ffff' },
    }), run.dependencies)).resolves.toEqual({
      sightingId: response.sightingId,
      visibility: 'hidden',
      state: 'upload_pending',
      receipt: {
        sightingId: response.sightingId,
        visibility: 'hidden',
        mediaState: 'upload_pending',
      },
    });
    expect(run.calls).toEqual(['save:tabby:normal', `attach:${response.sightingId}`, 'upload_attempt']);
    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
    expect(run.current()).toMatchObject({ sightingId: response.sightingId, ownerSubject: 'owner-12345678' });
  });

  it('returns needs-user only when the retained draft records a media failure after upload rejects', async () => {
    const run = harness({ current: mediaDraft({ mediaFailure: 'local_media_corrupt' }) });
    jest.mocked(run.dependencies.uploadMedia).mockRejectedValue(new Error('media_runtime_failed'));

    await expect(submitReportWithMedia(submission({
      location: { kind: 'manual_area', publicCellId: '89652636d87ffff' },
    }), run.dependencies)).resolves.toEqual({
      sightingId: response.sightingId,
      visibility: 'hidden',
      state: 'needs_user',
      receipt: {
        sightingId: response.sightingId,
        visibility: 'hidden',
        mediaState: 'needs_user',
      },
    });
    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
    expect(run.current()).toMatchObject({
      sightingId: response.sightingId,
      ownerSubject: 'owner-12345678',
      mediaFailure: 'local_media_corrupt',
    });
  });

  it.each([
    ['rejects', async () => { throw new Error('draft_read_failed'); }],
    ['returns null', async () => null],
  ])('returns neutral unavailable when the post-upload durable reread %s', async (_condition, failedRead) => {
    const run = harness();
    let reads = 0;
    jest.mocked(run.dependencies.getDraft).mockImplementation(async () => {
      reads += 1;
      return reads === 3 ? failedRead() : run.current();
    });
    jest.mocked(run.dependencies.uploadMedia).mockRejectedValue(new Error('media_runtime_failed'));

    await expect(submitReportWithMedia(submission({
      location: { kind: 'device_once', latitude: 1.3521, longitude: 103.8198 },
    }), run.dependencies)).resolves.toEqual({
      sightingId: response.sightingId,
      visibility: 'hidden',
      state: 'unavailable',
      receipt: {
        sightingId: response.sightingId,
        visibility: 'hidden',
        mediaState: 'unavailable',
      },
    });
    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['device-once', { kind: 'device_once' as const, latitude: 1.3521, longitude: 103.8198 }],
    ['manual-area', { kind: 'manual_area' as const, publicCellId: '89652636d87ffff' }],
  ])('passes the exact %s location union and bounded traits only to sighting creation', async (_mode, location) => {
    const run = harness({ current: { id: 'draft-12345678', notes: 'tabby', risk: 'normal' } });

    await expect(submitReportWithMedia(submission({
      location,
      traits: { coat: ['tabby'], markings: ['white-paws'], condition: 'appears_well' },
    }), run.dependencies)).resolves.toMatchObject({ state: 'submitted_text_only' });

    expect(run.dependencies.createSighting).toHaveBeenCalledWith({
      location,
      occurredAt: new Date('2026-08-27T00:00:00.000Z'),
      risk: 'normal',
      notes: 'tabby',
      traits: { coat: ['tabby'], markings: ['white-paws'], condition: 'appears_well' },
      clientDedupeKey: 'draft-12345678',
    });
    expect(run.dependencies.saveDraft).toHaveBeenCalledWith({ id: 'draft-12345678', notes: 'tabby', risk: 'normal' });
  });

  it('returns a recovery miss after recovery and never invents a location for creation', async () => {
    const run = harness({ current: { id: 'draft-12345678', notes: 'tabby', risk: 'normal' } });

    await expect(submitReportWithMedia(submission(), run.dependencies)).resolves.toEqual({
      sightingId: null,
      visibility: null,
      state: 'recovery_miss',
      receipt: null,
    });

    expect(run.dependencies.recoverSighting).toHaveBeenCalledWith('draft-12345678');
    expect(run.dependencies.createSighting).not.toHaveBeenCalled();
    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
  });

  it('returns a receipt-capable result when committed text leaves media pending', async () => {
    const run = harness({ uploadMedia: jest.fn(async () => 'upload_pending' as const) });

    await expect(submitReportWithMedia(submission({
      location: { kind: 'manual_area', publicCellId: '89652636d87ffff' },
    }), run.dependencies)).resolves.toEqual({
      sightingId: response.sightingId,
      visibility: 'hidden',
      state: 'upload_pending',
      receipt: {
        sightingId: response.sightingId,
        visibility: 'hidden',
        mediaState: 'upload_pending',
      },
    });
    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['authentication ownership', harness({ current: mediaDraft({ ownerSubject: 'different-owner-12345678' }) }), 'auth_ownership'],
    ['sighting attachment', harness({ attachSighting: jest.fn(async () => false) }), 'sighting_attachment_conflict'],
  ])('preserves local recovery state when %s rejects the submission', async (_name, run, error) => {
    await expect(submitReportWithMedia(submission({
      location: { kind: 'device_once', latitude: 1.3521, longitude: 103.8198 },
    }), run.dependencies)).rejects.toThrow(error);

    expect(run.current()).not.toBeNull();
    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['waiting', mediaDraft({ uploadJob: { state: 'waiting', attempts: 1, nextAttemptAt: '2026-08-27T00:01:00.000Z', lastError: 'network', resumeState: 'uploading', attemptStartedAt: null } })],
    ['needs_user', mediaDraft({ uploadJob: { state: 'needs_user', attempts: 1, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })],
    ['needs_user', mediaDraft({ mediaFailure: 'local_media_corrupt', uploadJob: { state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })],
  ] as const)('keeps %s media drafts durable instead of treating them as text-only', async (state, current) => {
    const run = harness({ current: { ...current, sightingId: response.sightingId }, uploadMedia: jest.fn(async () => state) });

    await expect(submitReportWithMedia(submission(), run.dependencies)).resolves.toMatchObject({ state });

    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
    expect(run.current()).not.toBeNull();
  });

  it('does not claim local or remote success from a reserve/PUT phase', async () => {
    const run = harness({ current: mediaDraft({ sightingId: response.sightingId }), uploadMedia: jest.fn(async () => 'finalizing') });

    await expect(submitReportWithMedia(submission(), run.dependencies)).resolves.toMatchObject({ state: 'finalizing' });

    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
  });
});
