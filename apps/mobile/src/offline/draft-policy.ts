import type { SightingRisk } from '../api/sightings';

export type StoredDraft = {
  id: string;
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
    notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 1000) : '',
    risk,
  };
}
