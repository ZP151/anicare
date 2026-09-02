import { cellToLatLng, getResolution, isValidCell, latLngToCell } from 'h3-js';

import type {
  PreciseLocationGrant,
  PreciseLocationPurpose,
  PublicLocationCell,
  PublicTimeBucket,
  RiskTier,
} from './types.js';

const SINGAPORE_UTC_OFFSET_HOURS = 8;
const SINGAPORE_BOUNDS = Object.freeze({ minLatitude: 1.1, maxLatitude: 1.5, minLongitude: 103.55, maxLongitude: 104.15 });

function getSingaporeTimeBucket(date: Date): PublicTimeBucket {
  const localHour = (date.getUTCHours() + SINGAPORE_UTC_OFFSET_HOURS) % 24;
  if (localHour < 6) return 'overnight';
  if (localHour < 12) return 'morning';
  if (localHour < 18) return 'afternoon';
  return 'evening';
}

export function toPublicLocationCell(coordinates: {
  latitude: number;
  longitude: number;
}): PublicLocationCell {
  return {
    cellId: latLngToCell(coordinates.latitude, coordinates.longitude, 9),
    resolution: 9,
  };
}

export function isSingaporePublicCell(cellId: string): boolean {
  if (!/^[0-9a-f]{15}$/i.test(cellId) || !isValidCell(cellId) || getResolution(cellId) !== 9) return false;
  const [latitude, longitude] = cellToLatLng(cellId);
  return latitude >= SINGAPORE_BOUNDS.minLatitude && latitude <= SINGAPORE_BOUNDS.maxLatitude &&
    longitude >= SINGAPORE_BOUNDS.minLongitude && longitude <= SINGAPORE_BOUNDS.maxLongitude;
}

export function getPublicExposure(
  riskTier: RiskTier,
  occurredAt: Date,
): { visible: boolean; visibleAt: string | null; timeBucket: PublicTimeBucket | null } {
  if (riskTier === 'critical') {
    return { visible: false, visibleAt: null, timeBucket: null };
  }

  const delayHours = riskTier === 'sensitive' ? 24 : 2;
  const visibleAt = new Date(occurredAt.getTime() + delayHours * 60 * 60 * 1000);
  return {
    visible: true,
    visibleAt: visibleAt.toISOString(),
    timeBucket: getSingaporeTimeBucket(occurredAt),
  };
}

export function canViewPreciseLocation(
  grant: PreciseLocationGrant,
  context: {
    userId: string;
    animalId: string;
    purpose: PreciseLocationPurpose;
    now: Date;
  },
): boolean {
  if (grant.revokedAt !== null) return false;
  if (grant.userId !== context.userId) return false;
  if (grant.animalId !== context.animalId) return false;
  if (grant.purpose !== context.purpose) return false;

  const now = context.now.getTime();
  return now >= Date.parse(grant.grantedAt) && now < Date.parse(grant.expiresAt);
}

