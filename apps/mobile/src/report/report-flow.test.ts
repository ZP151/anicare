import type { MyReportSummary } from '../api/my-reports';
import type { StoredDraft } from '../offline/draft-policy';
import {
  earliestIncompleteStep,
  mergeReportRecovery,
  reportTraits,
  validateReportForSubmission,
} from './report-flow';

const payload = {
  version: 1 as const,
  step: 'review' as const,
  occurredAt: '2026-08-31T08:00:00.000Z',
  coat: ['tabby'] as const,
  markings: ['white-paws'] as const,
  condition: 'needs_attention' as const,
  manualPublicCellId: '89652636d87ffff',
  updatedAt: '2026-08-31T08:01:00.000Z',
};

function draft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return { id: 'draft-12345678', notes: 'Under the shelter', risk: 'normal', report: payload, ...overrides };
}

const remote: MyReportSummary = {
  sightingId: '00000000-0000-4000-8000-000000000411',
  occurredAt: '2026-08-31T09:00:00.000Z',
  createdAt: '2026-08-31T09:01:00.000Z',
  reportState: 'private_review',
  mediaState: 'quarantined',
  identityState: 'pending_review',
};

describe('report workflow controller', () => {
  it('reopens a saved review only when its persisted prerequisites remain valid', () => {
    expect(earliestIncompleteStep(draft())).toBe('review');
    expect(earliestIncompleteStep(draft({ report: { ...payload, condition: null } }))).toBe('details');
    expect(earliestIncompleteStep(draft({ report: { ...payload, manualPublicCellId: null } }))).toBe('area');
  });

  it('uses the saved non-review stage as the deterministic next stage', () => {
    expect(earliestIncompleteStep(draft({ report: { ...payload, step: 'photo' } }))).toBe('photo');
    expect(earliestIncompleteStep(draft({ report: { ...payload, step: 'safety' } }))).toBe('safety');
    expect(earliestIncompleteStep(draft({ report: undefined }))).toBe('photo');
  });

  it('requires details, a supplied location mode, and explicit review before submission', () => {
    expect(validateReportForSubmission(draft({ report: { ...payload, step: 'details', condition: null } }), null))
      .toEqual(['details_required', 'area_required', 'review_required']);
    expect(validateReportForSubmission(draft({ report: { ...payload, step: 'area' } }), {
      kind: 'device_once', latitude: 1.3521, longitude: 103.8198,
    })).toEqual(['review_required']);
    expect(validateReportForSubmission(draft(), { kind: 'manual_area', publicCellId: '89652636d87ffff' })).toEqual([]);
  });

  it('maps bounded payload traits into the literal submission JSON shape', () => {
    expect(reportTraits(payload)).toEqual({
      coat: ['tabby'],
      markings: ['white-paws'],
      condition: 'needs_attention',
    });
  });

  it('uses the remote owner projection as authority for a bound sighting', () => {
    const timeline = mergeReportRecovery([remote], [draft({
      sightingId: remote.sightingId,
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      mediaId: 'media-12345678',
      encryptionVersion: 'aes-256-gcm.v1',
    })]);

    expect(timeline).toEqual([{
      key: `committed:${remote.sightingId}`,
      kind: 'committed',
      sightingId: remote.sightingId,
      draftId: null,
      occurredAt: remote.occurredAt,
      reportState: 'private_review',
      mediaState: 'quarantined',
      identityState: 'pending_review',
    }]);
  });

  it('exposes local recovery without encrypted references or coordinates', () => {
    const timeline = mergeReportRecovery([], [draft({
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      mediaId: 'media-12345678',
      encryptionVersion: 'aes-256-gcm.v1',
      uploadJob: { state: 'needs_user', attempts: 1, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null },
    })]);

    expect(timeline).toEqual([{
      key: 'recovery:draft-12345678',
      kind: 'recovery',
      sightingId: null,
      draftId: 'draft-12345678',
      occurredAt: '2026-08-31T08:00:00.000Z',
      reportState: 'draft',
      mediaState: 'needs_user',
      identityState: 'not_requested',
    }]);
    expect(JSON.stringify(timeline)).not.toContain('reviewed-media');
    expect(JSON.stringify(timeline)).not.toContain('latitude');
    expect(JSON.stringify(timeline)).not.toContain('longitude');
  });
});
