import { latLngToCell } from 'h3-js';

import type {
  PreciseLocationGrant,
  PreciseLocationPurpose,
  PublicLocationCell,
  PublicTimeBucket,
  RiskTier,
} from './types.js';

const SINGAPORE_UTC_OFFSET_HOURS = 8;

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

