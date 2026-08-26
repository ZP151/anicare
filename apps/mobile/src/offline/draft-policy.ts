import type { SightingRisk } from '../api/sightings';

export type StoredDraft = {
  id: string;
  photoUri: string | null;
  notes: string;
  risk: SightingRisk;
};

const risks = new Set<SightingRisk>(['normal', 'sensitive', 'critical']);

export function sanitizeDraftForStorage(input: Record<string, unknown>): StoredDraft {
  const risk = typeof input.risk === 'string' && risks.has(input.risk as SightingRisk)
    ? (input.risk as SightingRisk)
    : 'normal';

  return {
    id: String(input.id),
    photoUri: typeof input.photoUri === 'string' ? input.photoUri : null,
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 1000) : '',
    risk,
  };
}
