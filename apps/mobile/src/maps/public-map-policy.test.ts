import { PUBLIC_MAP_PADDING, PUBLIC_MAP_REGION, toPublicMapPresentation } from './public-map-policy';

const safeRow = {
  sightingId: '00000000-0000-4000-8000-000000000101',
  animalId: '00000000-0000-4000-8000-000000000102',
  primaryAlias: 'Mochi',
  verification: 'community_confirmed' as const,
  publicCellId: '8928308280fffff',
  timeBucket: 'today' as const,
  coverMediaId: null,
  cursor: '00000000-0000-4000-8000-000000000101',
};

describe('privacy-safe Google Maps presentation', () => {
  it('projects only fields safe for the selected-cat layer', () => {
    const result = toPublicMapPresentation(safeRow);

    expect(result).toEqual({
      alias: 'Mochi',
      verificationLabel: 'Community confirmed',
      timeLabel: 'Seen in the latest delayed window',
      animalId: '00000000-0000-4000-8000-000000000102',
    });
    expect(JSON.stringify(result)).not.toMatch(/892830|publicCell|sightingId|coverMedia|cursor/);
  });

  it('uses only a broad public camera and protects map attribution space', () => {
    expect(PUBLIC_MAP_REGION.latitudeDelta).toBeGreaterThanOrEqual(0.2);
    expect(PUBLIC_MAP_REGION.longitudeDelta).toBeGreaterThanOrEqual(0.15);
    expect(PUBLIC_MAP_PADDING.bottom).toBeGreaterThanOrEqual(300);
  });

  it('rejects unrecognised public projection states', () => {
    expect(() => toPublicMapPresentation({ ...safeRow, verification: 'verified' as never })).toThrow(
      'invalid_public_map_presentation',
    );
    expect(() => toPublicMapPresentation({ ...safeRow, timeBucket: 'now' as never })).toThrow(
      'invalid_public_map_presentation',
    );
  });
});
