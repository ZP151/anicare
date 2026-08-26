export type SightingRisk = 'normal' | 'sensitive' | 'critical';

export interface SightingDraftInput {
  latitude: number;
  longitude: number;
  occurredAt: Date;
  risk: SightingRisk;
  traits: Record<string, unknown>;
  notes: string | null;
  clientDedupeKey: string;
}

export function buildSightingPayload(input: SightingDraftInput) {
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    occurredAt: input.occurredAt.toISOString(),
    risk: input.risk,
    traits: input.traits,
    notes: input.notes,
    clientDedupeKey: input.clientDedupeKey,
  };
}

export async function submitSighting(input: {
  endpoint: string;
  accessToken: string;
  draft: SightingDraftInput;
}): Promise<{
  sightingId: string;
  visibility: 'public' | 'hidden';
  visibleAt: string | null;
  requestId: string;
}> {
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildSightingPayload(input.draft)),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'submission_failed');
  }
  return body;
}

