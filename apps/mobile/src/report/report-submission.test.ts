import {
  persistReportDraftBeforeReview,
  submitReportWithMedia,
  type ReportSubmissionDependencies,
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

function mediaDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-12345678', notes: 'tabby', risk: 'normal' as const,
    mediaId: 'media-12345678',
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
    createSighting: jest.fn(async () => response),
    attachSighting: jest.fn(async (_draftId: string, sightingId: string) => {
      calls.push(`attach:${sightingId}`);
      current = { ...current, sightingId };
      return true;
    }),
    uploadMedia: jest.fn(async () => 'quarantined' as const),
    deleteDraft: jest.fn(async () => { calls.push('delete'); current = null; }),
    ...overrides,
  };
  return { calls, dependencies, current: () => current };
}

describe('report submission lifecycle', () => {
  it('persists the visible notes and risk before entering private media review', async () => {
    const calls: string[] = [];
    await persistReportDraftBeforeReview({ draftId: 'draft-12345678', notes: 'ear tip', risk: 'critical' }, {
      saveDraft: async (draft) => { calls.push(`save:${draft.notes}:${draft.risk}`); },
    });

    expect(calls).toEqual(['save:ear tip:critical']);
  });

  it('recovers a lost creation response by the stable draft id before creating again', async () => {
    const run = harness();
    jest.mocked(run.dependencies.createSighting)
      .mockRejectedValueOnce(new Error('response_lost'));

    await expect(submitReportWithMedia({
      draftId: 'draft-12345678', notes: 'tabby', risk: 'normal',
      coordinates: { latitude: 1.3, longitude: 103.8 }, occurredAt: new Date('2026-08-27T00:00:00.000Z'),
    }, run.dependencies)).rejects.toThrow('response_lost');

    jest.mocked(run.dependencies.recoverSighting).mockResolvedValueOnce(response);
    await expect(submitReportWithMedia({
      draftId: 'draft-12345678', notes: 'tabby', risk: 'normal', coordinates: null,
      occurredAt: new Date('2026-08-27T00:00:00.000Z'),
    }, run.dependencies)).resolves.toMatchObject({ state: 'quarantined', sightingId: response.sightingId });

    expect(run.dependencies.recoverSighting).toHaveBeenCalledWith('draft-12345678');
    expect(run.dependencies.createSighting).toHaveBeenCalledTimes(1);
    expect(run.calls).toContain(`attach:${response.sightingId}`);
    expect(run.dependencies.uploadMedia).toHaveBeenCalledWith('draft-12345678');
  });

  it('uses an already durable sighting without retaining or requiring coordinates on retry', async () => {
    const run = harness({ current: mediaDraft({ sightingId: response.sightingId }) });

    await expect(submitReportWithMedia({
      draftId: 'draft-12345678', notes: 'tabby', risk: 'normal', coordinates: null,
      occurredAt: new Date('2026-08-27T00:00:00.000Z'),
    }, run.dependencies)).resolves.toMatchObject({ state: 'quarantined', sightingId: response.sightingId });

    expect(run.dependencies.recoverSighting).not.toHaveBeenCalled();
    expect(run.dependencies.createSighting).not.toHaveBeenCalled();
    expect(run.dependencies.attachSighting).not.toHaveBeenCalled();
  });

  it('does not invent a visibility claim for an already attached sighting', async () => {
    const run = harness({ current: mediaDraft({ sightingId: response.sightingId }) });

    await expect(submitReportWithMedia({
      draftId: 'draft-12345678', notes: 'tabby', risk: 'normal', coordinates: null,
      occurredAt: new Date('2026-08-27T00:00:00.000Z'),
    }, run.dependencies)).resolves.toMatchObject({ sightingId: response.sightingId, visibility: null });
  });

  it('deletes a text-only draft only after a successful sighting submission', async () => {
    const run = harness({ current: { id: 'draft-12345678', notes: 'tabby', risk: 'normal' } });

    await expect(submitReportWithMedia({
      draftId: 'draft-12345678', notes: 'tabby', risk: 'normal',
      coordinates: { latitude: 1.3, longitude: 103.8 }, occurredAt: new Date('2026-08-27T00:00:00.000Z'),
    }, run.dependencies)).resolves.toMatchObject({ state: 'submitted_text_only', sightingId: response.sightingId });

    expect(run.calls).toEqual([
      'save:tabby:normal',
      `attach:${response.sightingId}`,
      'delete',
    ]);
  });

  it.each([
    ['waiting', mediaDraft({ uploadJob: { state: 'waiting', attempts: 1, nextAttemptAt: '2026-08-27T00:01:00.000Z', lastError: 'network', resumeState: 'uploading', attemptStartedAt: null } })],
    ['needs_user', mediaDraft({ uploadJob: { state: 'needs_user', attempts: 1, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })],
    ['needs_user', mediaDraft({ mediaFailure: 'local_media_corrupt', uploadJob: { state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })],
  ] as const)('keeps %s media drafts durable instead of treating them as text-only', async (state, current) => {
    const run = harness({ current: { ...current, sightingId: response.sightingId }, uploadMedia: jest.fn(async () => state) });

    await expect(submitReportWithMedia({
      draftId: 'draft-12345678', notes: 'tabby', risk: 'normal', coordinates: null,
      occurredAt: new Date('2026-08-27T00:00:00.000Z'),
    }, run.dependencies)).resolves.toMatchObject({ state });

    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
    expect(run.current()).not.toBeNull();
  });

  it('does not claim local or remote success from a reserve/PUT phase', async () => {
    const run = harness({ current: mediaDraft({ sightingId: response.sightingId }), uploadMedia: jest.fn(async () => 'finalizing') });

    await expect(submitReportWithMedia({
      draftId: 'draft-12345678', notes: 'tabby', risk: 'normal', coordinates: null,
      occurredAt: new Date('2026-08-27T00:00:00.000Z'),
    }, run.dependencies)).resolves.toMatchObject({ state: 'finalizing' });

    expect(run.dependencies.deleteDraft).not.toHaveBeenCalled();
  });
});
