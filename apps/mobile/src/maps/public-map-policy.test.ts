import {
  PUBLIC_MAP_PADDING,
  PUBLIC_MAP_REGION,
  buildPublicAreaSummaries,
  createDemoPublicAreaSummaries,
  toPublicMapPresentation,
} from './public-map-policy';

const safeRow = {
  sightingId: '00000000-0000-4000-8000-000000000101',
  animalId: '00000000-0000-4000-8000-000000000102',
  primaryAlias: 'Mochi',
  verification: 'community_confirmed' as const,
  publicCellId: '8928308280fffff',
  timeBucket: 'today' as const,
  coverMediaId: '00000000-0000-4000-8000-000000000999',
  cursor: '00000000-0000-4000-8000-000000000101',
};

describe('privacy-safe Google Maps presentation', () => {
  it('projects only fields safe for the selected-cat layer', () => {
    const result = toPublicMapPresentation(safeRow);
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      alias: 'Mochi',
      verificationLabel: 'Community confirmed',
      timeLabel: 'Seen in the latest delayed window',
      animalId: '00000000-0000-4000-8000-000000000102',
    });
    expect(serialized).not.toMatch(/publicCell|sightingId|coverMedia|cursor/);
    expect(serialized).not.toContain(safeRow.publicCellId);
    expect(serialized).not.toContain(safeRow.sightingId);
    expect(serialized).not.toContain(safeRow.coverMediaId);
    expect(serialized).not.toContain(safeRow.cursor);
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

  it('builds coarse-area summaries for privacy-safe map presentation', () => {
    const result = buildPublicAreaSummaries([
      {
        ...safeRow,
        sightingId: '00000000-0000-4000-8000-000000000111',
        animalId: '00000000-0000-4000-8000-000000000112',
        primaryAlias: 'Mochi',
        verification: 'reported',
        publicCellId: '8928308280fffff',
        timeBucket: 'earlier',
      },
      {
        ...safeRow,
        sightingId: '00000000-0000-4000-8000-000000000113',
        animalId: '00000000-0000-4000-8000-000000000112',
        primaryAlias: 'Mochi Duplicate',
        verification: 'reported',
        publicCellId: '8928308280fffff',
        timeBucket: 'today',
      },
      {
        ...safeRow,
        sightingId: '00000000-0000-4000-8000-000000000114',
        animalId: '00000000-0000-4000-8000-000000000115',
        primaryAlias: 'Luna',
        verification: 'partner_confirmed',
        publicCellId: '8928308280fffff',
        timeBucket: 'this_week',
      },
      {
        ...safeRow,
        sightingId: '00000000-0000-4000-8000-000000000116',
        animalId: '00000000-0000-4000-8000-000000000117',
        primaryAlias: 'Purr',
        verification: 'community_confirmed',
        publicCellId: '8928308280ffffe',
        timeBucket: 'this_week',
      },
    ]);

    expect(result).toEqual([
      {
        areaKey: 'public-area-1',
        label: 'Community area 1',
        activityLabel: '2 cats active in the latest delayed window',
        catCount: 2,
        confirmedCount: 1,
        cats: [
          {
            alias: 'Luna',
            verificationLabel: 'Partner confirmed',
            timeLabel: 'Seen in the delayed weekly window',
            animalId: '00000000-0000-4000-8000-000000000115',
          },
          {
            alias: 'Mochi',
            verificationLabel: 'Reported · awaiting community review',
            timeLabel: 'Seen in an earlier delayed window',
            animalId: '00000000-0000-4000-8000-000000000112',
          },
        ],
      },
      {
        areaKey: 'public-area-2',
        label: 'Community area 2',
        activityLabel: '1 cat active in the delayed weekly window',
        catCount: 1,
        confirmedCount: 1,
        cats: [
          {
            alias: 'Purr',
            verificationLabel: 'Community confirmed',
            timeLabel: 'Seen in the delayed weekly window',
            animalId: '00000000-0000-4000-8000-000000000117',
          },
        ],
      },
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/publicCellId|sightingId|coverMediaId|cursor/);
    expect(serialized).not.toContain('8928308280fffff');
    expect(serialized).not.toContain('8928308280ffffe');
    expect(serialized).not.toContain('00000000-0000-4000-8000-000000000101');
    expect(serialized).not.toContain('00000000-0000-4000-8000-000000000111');
    expect(serialized).not.toContain('00000000-0000-4000-8000-000000000114');
    expect(serialized).not.toContain('00000000-0000-4000-8000-000000000116');
    expect(serialized).not.toContain('00000000-0000-4000-8000-000000000113');
    expect(serialized).not.toContain('00000000-0000-4000-8000-000000000999');
  });

  it('builds no summaries from no rows', () => {
    expect(buildPublicAreaSummaries([])).toEqual([]);
  });

  it('creates a safe two-area demo for initial map rendering', () => {
    const demo = createDemoPublicAreaSummaries();

    expect(demo).toHaveLength(2);
    expect(demo).toEqual([
      {
        areaKey: 'public-area-1',
        label: 'Community area 1',
        activityLabel: '2 cats active in the latest delayed window',
        catCount: 2,
        confirmedCount: 1,
        cats: [
          {
            alias: 'Demo Meow One',
            verificationLabel: 'Community confirmed',
            timeLabel: 'Seen in the latest delayed window',
            animalId: 'demo-community-cat-1',
          },
          {
            alias: 'Demo Meow Two',
            verificationLabel: 'Reported · awaiting community review',
            timeLabel: 'Seen in the delayed weekly window',
            animalId: 'demo-community-cat-2',
          },
        ],
      },
      {
        areaKey: 'public-area-2',
        label: 'Community area 2',
        activityLabel: '1 cat active in the earlier delayed window',
        catCount: 1,
        confirmedCount: 1,
        cats: [
          {
            alias: 'Demo Meow Three',
            verificationLabel: 'Partner confirmed',
            timeLabel: 'Seen in an earlier delayed window',
            animalId: 'demo-community-cat-3',
          },
        ],
      },
    ]);
    expect(demo.every((area) => area.cats.every((cat) => cat.animalId.startsWith('demo-')))).toBe(true);
    expect(demo.every((area) => area.cats.every((cat) => cat.alias.startsWith('Demo Meow')))).toBe(true);
    expect(JSON.stringify(demo)).not.toMatch(/[0-9a-f]{10,20}/i);
  });
});
