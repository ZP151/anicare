import type { PublicSighting } from '../api/feed';

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

const verificationLabels: Record<PublicSighting['verification'], string> = {
  reported: 'Reported · awaiting community review',
  community_confirmed: 'Community confirmed',
  partner_confirmed: 'Partner confirmed',
  disputed: 'Public information disputed',
  superseded: 'Public identity updated',
};

const timeLabels: Record<PublicSighting['timeBucket'], string> = {
  today: 'Seen in the latest delayed window',
  this_week: 'Seen in the delayed weekly window',
  earlier: 'Seen in an earlier delayed window',
};

export type PublicMapPresentation = Readonly<{
  alias: string;
  verificationLabel: string;
  timeLabel: string;
  animalId: string;
}>;

export function toPublicMapPresentation(sighting: PublicSighting): PublicMapPresentation {
  const verificationLabel = verificationLabels[sighting.verification];
  const timeLabel = timeLabels[sighting.timeBucket];
  if (!verificationLabel || !timeLabel) throw new Error('invalid_public_map_presentation');

  return {
    alias: sighting.primaryAlias,
    verificationLabel,
    timeLabel,
    animalId: sighting.animalId,
  };
}
