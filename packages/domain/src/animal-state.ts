import type {
  AnimalEvent,
  AnimalLifecycle,
  DerivedAnimalState,
  VerificationProvenance,
} from './types.js';

const verificationRank: Record<'reported' | 'community_confirmed' | 'partner_confirmed', number> = {
  reported: 0,
  community_confirmed: 1,
  partner_confirmed: 2,
};

function strongestVerification(
  events: readonly AnimalEvent[],
): 'reported' | 'community_confirmed' | 'partner_confirmed' {
  return events.reduce<'reported' | 'community_confirmed' | 'partner_confirmed'>((current, event) => {
    if (event.provenance === 'disputed' || event.provenance === 'superseded') {
      return current;
    }

    return verificationRank[event.provenance] > verificationRank[current]
      ? event.provenance
      : current;
  }, 'reported');
}

export function deriveAnimalState(
  animalId: string,
  sourceEvents: readonly AnimalEvent[],
): DerivedAnimalState {
  const events = [...sourceEvents]
    .filter((event) => event.animalId === animalId)
    .sort((left, right) => {
      const occurredDifference = left.occurredAt.localeCompare(right.occurredAt);
      return occurredDifference === 0
        ? left.recordedAt.localeCompare(right.recordedAt)
        : occurredDifference;
    });

  const aliases = new Set<string>();
  const lifecycleAssertions: Array<{
    lifecycle: AnimalLifecycle;
    provenance: VerificationProvenance;
  }> = [];

  for (const event of events) {
    if (event.type === 'profile_created' && event.payload?.primaryAlias) {
      aliases.add(event.payload.primaryAlias.trim());
    }
    if (event.type === 'alias_added' && event.payload?.alias) {
      aliases.add(event.payload.alias.trim());
    }
    if (event.type === 'lifecycle_asserted' && event.payload?.lifecycle) {
      lifecycleAssertions.push({
        lifecycle: event.payload.lifecycle,
        provenance: event.provenance,
      });
    }
  }

  const assertedLifecycles = new Set(lifecycleAssertions.map((assertion) => assertion.lifecycle));
  const disputed = assertedLifecycles.size > 1;
  const latestAssertion = lifecycleAssertions.at(-1);

  return {
    animalId,
    aliases: [...aliases].filter(Boolean),
    lifecycle: disputed ? 'unknown' : (latestAssertion?.lifecycle ?? 'unknown'),
    lifecycleProvenance: disputed ? 'disputed' : (latestAssertion?.provenance ?? 'reported'),
    verification: strongestVerification(events),
    disputed,
  };
}
