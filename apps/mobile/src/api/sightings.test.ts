import { buildSightingPayload } from './sightings';

describe('buildSightingPayload', () => {
  it('includes precise input for the protected endpoint but never client-controlled exposure fields', () => {
    const payload = buildSightingPayload({
      latitude: 1.3521,
      longitude: 103.8198,
      occurredAt: new Date('2026-08-26T08:00:00.000Z'),
      risk: 'normal',
      traits: { coat: 'tortoiseshell', earTip: true },
      notes: 'Seen drinking water.',
      clientDedupeKey: 'draft-12345678',
    });

    expect(payload).toEqual({
      latitude: 1.3521,
      longitude: 103.8198,
      occurredAt: '2026-08-26T08:00:00.000Z',
      risk: 'normal',
      traits: { coat: 'tortoiseshell', earTip: true },
      notes: 'Seen drinking water.',
      clientDedupeKey: 'draft-12345678',
    });
    expect(payload).not.toHaveProperty('publicCellId');
    expect(payload).not.toHaveProperty('visibility');
    expect(payload).not.toHaveProperty('visibleAt');
  });
});

