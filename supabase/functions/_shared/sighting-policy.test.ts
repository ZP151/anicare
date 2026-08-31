import { describe, expect, it } from 'vitest';

import { prepareManualSightingRecord, prepareSightingRecord } from './sighting-policy.js';

describe('prepareSightingRecord', () => {
  const base = {
    latitude: 1.3521,
    longitude: 103.8198,
    occurredAt: '2026-08-26T08:00:00.000Z',
    risk: 'normal' as const,
  };

  it('derives the public cell and safety delay on the server', () => {
    expect(prepareSightingRecord(base)).toEqual({
      publicCellId: '89652636d87ffff',
      timeBucket: 'afternoon',
      visibility: 'public',
      visibleAt: '2026-08-26T10:00:00.000Z',
    });
  });

  it('keeps critical sightings hidden and delays sensitive sightings for 24 hours', () => {
    expect(prepareSightingRecord({ ...base, risk: 'critical' })).toMatchObject({
      visibility: 'hidden',
      visibleAt: null,
    });
    expect(prepareSightingRecord({ ...base, risk: 'sensitive' }).visibleAt).toBe(
      '2026-08-27T08:00:00.000Z',
    );
  });

  it('gives a valid manual public cell the same bucket and safety policy as device location', () => {
    expect(prepareManualSightingRecord({
      publicCellId: '89652636d87ffff',
      occurredAt: base.occurredAt,
      risk: base.risk,
    })).toEqual(prepareSightingRecord(base));
  });

  it.each([
    ['a malformed H3 value', 'not-an-h3-cell'],
    ['a non-canonical uppercase H3 value', '89652636D87FFFF'],
    ['a non-canonical zero-prefixed H3 value', '089652636d87ffff'],
    ['a non-public H3 resolution', '88652636d9fffff'],
    ['an H3 cell centered outside Singapore', '8928308280fffff'],
  ])('rejects %s for manual submission', (_reason, publicCellId) => {
    expect(() => prepareManualSightingRecord({
      publicCellId,
      occurredAt: base.occurredAt,
      risk: base.risk,
    })).toThrow('invalid_manual_public_cell');
  });
});
