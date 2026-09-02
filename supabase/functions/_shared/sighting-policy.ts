import { cellToLatLng, getResolution, isValidCell, latLngToCell } from 'h3-js';

export type SightingRisk = 'normal' | 'sensitive' | 'critical';
export type PreparedSightingRecord = Readonly<{
  publicCellId: string;
  timeBucket: 'overnight' | 'morning' | 'afternoon' | 'evening';
  visibility: 'public' | 'hidden';
  visibleAt: string | null;
}>;

const PUBLIC_CELL_RESOLUTION = 9;
const CANONICAL_H3_CELL = /^[0-9a-f]{15}$/;
const SINGAPORE_BOUNDS = Object.freeze({
  minLatitude: 1.10,
  maxLatitude: 1.50,
  minLongitude: 103.55,
  maxLongitude: 104.15,
});

function singaporeTimeBucket(date: Date): 'overnight' | 'morning' | 'afternoon' | 'evening' {
  const hour = (date.getUTCHours() + 8) % 24;
  if (hour < 6) return 'overnight';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function prepareSightingRecordForPublicCell(input: {
  publicCellId: string;
  occurredAt: string;
  risk: SightingRisk;
}): PreparedSightingRecord {
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) throw new Error('Invalid occurredAt');

  if (input.risk === 'critical') {
    return {
      publicCellId: input.publicCellId,
      timeBucket: singaporeTimeBucket(occurredAt),
      visibility: 'hidden',
      visibleAt: null,
    };
  }

  const delayHours = input.risk === 'sensitive' ? 24 : 2;
  return {
    publicCellId: input.publicCellId,
    timeBucket: singaporeTimeBucket(occurredAt),
    visibility: 'public',
    visibleAt: new Date(occurredAt.getTime() + delayHours * 3_600_000).toISOString(),
  };
}

export function prepareSightingRecord(input: {
  latitude: number;
  longitude: number;
  occurredAt: string;
  risk: SightingRisk;
}): PreparedSightingRecord {
  return prepareSightingRecordForPublicCell({
    publicCellId: latLngToCell(input.latitude, input.longitude, PUBLIC_CELL_RESOLUTION),
    occurredAt: input.occurredAt,
    risk: input.risk,
  });
}

export function prepareManualSightingRecord(input: {
  publicCellId: string;
  occurredAt: string;
  risk: SightingRisk;
}): PreparedSightingRecord {
  if (
    !CANONICAL_H3_CELL.test(input.publicCellId) ||
    !isValidCell(input.publicCellId) ||
    getResolution(input.publicCellId) !== PUBLIC_CELL_RESOLUTION
  ) {
    throw new Error('invalid_manual_public_cell');
  }
  const [latitude, longitude] = cellToLatLng(input.publicCellId);
  if (
    latitude < SINGAPORE_BOUNDS.minLatitude || latitude > SINGAPORE_BOUNDS.maxLatitude ||
    longitude < SINGAPORE_BOUNDS.minLongitude || longitude > SINGAPORE_BOUNDS.maxLongitude
  ) {
    throw new Error('invalid_manual_public_cell');
  }
  return prepareSightingRecordForPublicCell(input);
}

