import type { PublicSighting } from '../api/feed';
import { getCommunityMapCopy, type Locale } from '../i18n/catalog';

export const PUBLIC_MAP_REGION = Object.freeze({
  latitude: 1.3521,
  longitude: 103.8198,
  latitudeDelta: 0.24,
  longitudeDelta: 0.18,
});

export const PUBLIC_MAP_PADDING = Object.freeze({
  top: 72,
  right: 16,
  bottom: 320,
  left: 16,
});

export const PUBLIC_GOOGLE_MAP_STYLE = Object.freeze([
  { elementType: 'geometry', stylers: [{ color: '#F1EBDD' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#D1D0BA' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#E7E1D2' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#DDE2C8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#B8D8D0' }] },
] as const);

const verificationPriority: Readonly<Record<PublicSighting['verification'], number>> = {
  partner_confirmed: 4,
  community_confirmed: 3,
  reported: 2,
  disputed: 1,
  superseded: 0,
};

const timePriority: Readonly<Record<PublicSighting['timeBucket'], number>> = {
  today: 3,
  this_week: 2,
  earlier: 1,
};

export type PublicMapPresentation = Readonly<{
  alias: string;
  verificationLabel: string;
  timeLabel: string;
  animalId: string;
}>;

export type PublicAreaSummary = Readonly<{
  areaKey: string;
  label: string;
  activityLabel: string;
  catCount: number;
  confirmedCount: number;
  cats: readonly PublicMapPresentation[];
}>;

export function toPublicMapPresentation(sighting: PublicSighting, locale: Locale = 'en'): PublicMapPresentation {
  const copy = getCommunityMapCopy(locale);
  const verificationLabel = copy.verificationLabel(sighting.verification);
  const validTimeBucket = sighting.timeBucket === 'today'
    || sighting.timeBucket === 'this_week'
    || sighting.timeBucket === 'earlier';
  if (!verificationLabel || !validTimeBucket) throw new Error('invalid_public_map_presentation');

  return {
    alias: sighting.primaryAlias,
    verificationLabel,
    timeLabel: copy.timeLabel(sighting.timeBucket),
    animalId: sighting.animalId,
  };
}

function isConfirmed(verdict: PublicSighting['verification']): boolean {
  return verdict === 'community_confirmed' || verdict === 'partner_confirmed';
}

export function buildPublicAreaSummaries(
  sightings: readonly PublicSighting[],
  locale: Locale = 'en',
): readonly PublicAreaSummary[] {
  const copy = getCommunityMapCopy(locale);
  const groupedByCell = new Map<string, PublicSighting[]>();

  for (const sighting of sightings) {
    const grouped = groupedByCell.get(sighting.publicCellId);
    if (!grouped) {
      groupedByCell.set(sighting.publicCellId, [sighting]);
      continue;
    }
    grouped.push(sighting);
  }

  const summaries: PublicAreaSummary[] = [];
  let areaOrdinal = 1;

  for (const group of groupedByCell.values()) {
    const dedupedByAnimal = new Map<string, PublicSighting>();
    for (const sighting of group) {
      if (!dedupedByAnimal.has(sighting.animalId)) dedupedByAnimal.set(sighting.animalId, sighting);
    }
    const uniqueByAnimal = [...dedupedByAnimal.values()];

    const cats = [...uniqueByAnimal]
      .sort((left, right) => {
        const verificationDelta = verificationPriority[right.verification] - verificationPriority[left.verification];
        if (verificationDelta !== 0) return verificationDelta;
        return timePriority[right.timeBucket] - timePriority[left.timeBucket];
      })
      .map((sighting) => toPublicMapPresentation(sighting, locale));

    const strongestBucket: PublicSighting['timeBucket'] = group.some((sighting) => sighting.timeBucket === 'today')
      ? 'today'
      : group.some((sighting) => sighting.timeBucket === 'this_week')
        ? 'this_week'
        : 'earlier';

    summaries.push({
      areaKey: `public-area-${areaOrdinal}`,
      label: copy.areaLabel(areaOrdinal),
      activityLabel: copy.activityLabel(uniqueByAnimal.length, strongestBucket),
      catCount: uniqueByAnimal.length,
      confirmedCount: uniqueByAnimal.reduce((count, sighting) => (isConfirmed(sighting.verification) ? count + 1 : count), 0),
      cats,
    });
    areaOrdinal += 1;
  }

  return summaries;
}

export function createDemoPublicAreaSummaries(locale: Locale = 'en'): readonly PublicAreaSummary[] {
  return buildPublicAreaSummaries([
    {
      sightingId: '00000000-0000-4000-8000-000000000201',
      animalId: 'demo-community-cat-1',
      primaryAlias: 'Demo Meow One',
      verification: 'community_confirmed',
      publicCellId: 'demo-cell-1',
      timeBucket: 'today',
      coverMediaId: null,
      cursor: '00000000-0000-4000-8000-000000000202',
    },
    {
      sightingId: '00000000-0000-4000-8000-000000000203',
      animalId: 'demo-community-cat-2',
      primaryAlias: 'Demo Meow Two',
      verification: 'reported',
      publicCellId: 'demo-cell-1',
      timeBucket: 'this_week',
      coverMediaId: null,
      cursor: '00000000-0000-4000-8000-000000000204',
    },
    {
      sightingId: '00000000-0000-4000-8000-000000000205',
      animalId: 'demo-community-cat-3',
      primaryAlias: 'Demo Meow Three',
      verification: 'partner_confirmed',
      publicCellId: 'demo-cell-2',
      timeBucket: 'earlier',
      coverMediaId: null,
      cursor: '00000000-0000-4000-8000-000000000206',
    },
  ], locale);
}
