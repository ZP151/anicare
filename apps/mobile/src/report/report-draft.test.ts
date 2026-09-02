import {
  createReportDraftPayload,
  reportDraftSummary,
  sanitizeReportDraftPayload,
} from './report-draft';

const validPayload = {
  version: 1,
  step: 'details',
  occurredAt: '2026-08-31T10:00:00.000Z',
  coat: ['tabby', 'tabby'],
  markings: ['white-paws'],
  condition: 'appears_well',
  manualPublicCellId: null,
  updatedAt: '2026-08-31T10:01:00.000Z',
} as const;

describe('report draft payload', () => {
  it('normalizes a complete V1 payload into the persisted privacy-safe shape', () => {
    expect(sanitizeReportDraftPayload(validPayload)).toEqual({
      version: 1,
      step: 'details',
      areaSelectionMode: 'either',
      occurredAt: '2026-08-31T10:00:00.000Z',
      coat: ['tabby'],
      markings: ['white-paws'],
      condition: 'appears_well',
      manualPublicCellId: null,
      updatedAt: '2026-08-31T10:01:00.000Z',
    });
  });

  it('retains only approved, unique, bounded traits', () => {
    expect(sanitizeReportDraftPayload({
      ...validPayload,
      coat: ['tabby', 'black', 'white', 'ginger', 'grey', 'calico', 'tortoiseshell', 'brown', 'tabby', 'not-approved'],
      markings: ['white-paws', 'white-chest', 'white-tail-tip', 'ear-tip', 'collar', 'scar', 'striped', 'spotted', 'white-paws'],
    })).toMatchObject({
      coat: ['tabby', 'black', 'white', 'ginger', 'grey', 'calico', 'tortoiseshell', 'brown'],
      markings: ['white-paws', 'white-chest', 'white-tail-tip', 'ear-tip', 'collar', 'scar', 'striped', 'spotted'],
    });
  });

  it.each([
    [{ ...validPayload, version: 2 }],
    [{ ...validPayload, occurredAt: '2026-08-31' }],
    [{ ...validPayload, manualPublicCellId: 'definitely-not-a-cell' }],
    [{ ...validPayload, latitude: 1.3 }],
    [{ ...validPayload, accessToken: 'secret' }],
    [{ ...validPayload, sourceUri: 'file:///private/raw.jpg' }],
    [{ ...validPayload, routePath: '/report/review' }],
  ])('rejects invalid or privacy-sensitive nested payload %#', (payload) => {
    expect(() => sanitizeReportDraftPayload(payload)).toThrow('invalid_report_draft');
  });

  it('requires a real canonical H3 resolution-9 manual-area cell', () => {
    expect(sanitizeReportDraftPayload({
      ...validPayload,
      manualPublicCellId: '89652636d87ffff',
    }).manualPublicCellId).toBe('89652636d87ffff');
    for (const manualPublicCellId of ['890000000000000', '88652636d9fffff', '89084000003ffff']) {
      expect(() => sanitizeReportDraftPayload({ ...validPayload, manualPublicCellId }))
        .toThrow('invalid_report_draft');
    }
  });

  it('persists only the bounded manual-required map origin state', () => {
    expect(sanitizeReportDraftPayload({
      ...validPayload,
      areaSelectionMode: 'manual_required',
    }).areaSelectionMode).toBe('manual_required');
    expect(() => sanitizeReportDraftPayload({ ...validPayload, areaSelectionMode: 'device_only' }))
      .toThrow('invalid_report_draft');
  });

  it('creates an immutable empty V1 draft at the supplied time', () => {
    const payload = createReportDraftPayload(new Date('2026-08-31T10:00:00.000Z'));
    expect(payload).toEqual({
      version: 1,
      step: 'photo',
      areaSelectionMode: 'either',
      occurredAt: '2026-08-31T10:00:00.000Z',
      coat: [],
      markings: [],
      condition: null,
      manualPublicCellId: null,
      updatedAt: '2026-08-31T10:00:00.000Z',
    });
    expect(Object.isFrozen(payload.coat)).toBe(true);
    expect(Object.isFrozen(payload.markings)).toBe(true);
  });

  it('creates a resumable summary only for a valid versioned report draft', () => {
    expect(reportDraftSummary({
      id: 'draft-12345678', notes: '', risk: 'normal', report: sanitizeReportDraftPayload(validPayload),
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
    })).toEqual({
      id: 'draft-12345678', updatedAt: '2026-08-31T10:01:00.000Z', step: 'details',
      title: 'Report draft', hasReviewedMedia: true,
    });
    expect(reportDraftSummary({ id: 'draft-12345678', notes: '', risk: 'normal' })).toBeNull();
  });
});
