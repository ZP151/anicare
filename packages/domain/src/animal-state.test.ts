import { describe, expect, it } from 'vitest';

import { deriveAnimalState } from './animal-state.js';
import type { AnimalEvent } from './types.js';

const event = (partial: Partial<AnimalEvent> & Pick<AnimalEvent, 'id' | 'type'>): AnimalEvent => ({
  animalId: 'cat-1',
  occurredAt: '2026-08-26T08:00:00.000Z',
  recordedAt: '2026-08-26T08:01:00.000Z',
  provenance: 'reported',
  actorId: 'user-1',
  ...partial,
});

describe('deriveAnimalState', () => {
  it('keeps aliases and derives a community-confirmed terminal state from the event ledger', () => {
    const events: AnimalEvent[] = [
      event({ id: '1', type: 'profile_created', payload: { primaryAlias: 'Mochi' } }),
      event({ id: '2', type: 'alias_added', payload: { alias: '麻糬' } }),
      event({
        id: '3',
        type: 'lifecycle_asserted',
        provenance: 'community_confirmed',
        payload: { lifecycle: 'adopted' },
      }),
    ];

    expect(deriveAnimalState('cat-1', events)).toEqual({
      animalId: 'cat-1',
      aliases: ['Mochi', '麻糬'],
      lifecycle: 'adopted',
      lifecycleProvenance: 'community_confirmed',
      verification: 'community_confirmed',
      disputed: false,
    });
  });

  it('preserves conflicting assertions and suspends a definitive lifecycle conclusion', () => {
    const events: AnimalEvent[] = [
      event({ id: '1', type: 'profile_created', payload: { primaryAlias: 'Mochi' } }),
      event({ id: '2', type: 'lifecycle_asserted', payload: { lifecycle: 'deceased' } }),
      event({ id: '3', type: 'lifecycle_asserted', payload: { lifecycle: 'active' } }),
    ];

    expect(deriveAnimalState('cat-1', events)).toMatchObject({
      lifecycle: 'unknown',
      lifecycleProvenance: 'disputed',
      disputed: true,
    });
  });
});

