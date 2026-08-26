import { describe, expect, it } from 'vitest';

import { prepareSightingRecord } from './sighting-policy.js';

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
});
