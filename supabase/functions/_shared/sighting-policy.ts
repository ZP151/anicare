import { latLngToCell } from 'h3-js';

export type SightingRisk = 'normal' | 'sensitive' | 'critical';

function singaporeTimeBucket(date: Date): 'overnight' | 'morning' | 'afternoon' | 'evening' {
  const hour = (date.getUTCHours() + 8) % 24;
  if (hour < 6) return 'overnight';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function prepareSightingRecord(input: {
  latitude: number;
  longitude: number;
  occurredAt: string;
  risk: SightingRisk;
}): {
  publicCellId: string;
  timeBucket: 'overnight' | 'morning' | 'afternoon' | 'evening';
  visibility: 'public' | 'hidden';
  visibleAt: string | null;
} {
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) throw new Error('Invalid occurredAt');

  if (input.risk === 'critical') {
    return {
      publicCellId: latLngToCell(input.latitude, input.longitude, 9),
      timeBucket: singaporeTimeBucket(occurredAt),
      visibility: 'hidden',
      visibleAt: null,
    };
  }

  const delayHours = input.risk === 'sensitive' ? 24 : 2;
  return {
    publicCellId: latLngToCell(input.latitude, input.longitude, 9),
    timeBucket: singaporeTimeBucket(occurredAt),
    visibility: 'public',
    visibleAt: new Date(occurredAt.getTime() + delayHours * 3_600_000).toISOString(),
  };
}

