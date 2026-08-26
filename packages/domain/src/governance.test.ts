import { describe, expect, it } from 'vitest';

import {
  canAdjudicateModerationReport,
  createIdentityProposal,
  isEffectiveCareEvent,
} from './governance.js';

describe('identity proposals', () => {
  it('keeps a contributor-selected AI candidate tentative until independent review', () => {
    expect(
      createIdentityProposal({
        id: 'proposal-1',
        sightingId: 'sighting-1',
        proposedAnimalId: 'cat-1',
        proposerId: 'user-1',
        source: 'ai_candidate',
        createdAt: '2026-08-26T08:00:00.000Z',
      }),
    ).toMatchObject({ status: 'tentative', proposedAnimalId: 'cat-1' });
  });
});

describe('effective care events', () => {
  const event = {
    animalId: 'cat-1',
    actorId: 'user-1',
    activity: 'water' as const,
    completedAt: '2026-08-26T08:00:00.000Z',
    publicCellId: '896520d8b5bffff',
    dedupeKey: 'cat-1:user-1:water:2026-08-26T08',
    status: 'completed' as const,
  };

  it('counts completed, identity-linked, auditable care', () => {
    expect(isEffectiveCareEvent(event)).toBe(true);
  });

  it('does not count sightings, drafts or records without an identity', () => {
    expect(isEffectiveCareEvent({ ...event, status: 'draft' })).toBe(false);
    expect(isEffectiveCareEvent({ ...event, animalId: null })).toBe(false);
    expect(isEffectiveCareEvent({ ...event, activity: 'sighting' })).toBe(false);
  });
});

describe('moderation recusal', () => {
  it('prevents a reporter, content author or target from adjudicating', () => {
    const report = {
      reporterId: 'reporter-1',
      contentAuthorId: 'author-1',
      targetUserId: 'target-1',
    };

    expect(canAdjudicateModerationReport('reporter-1', report)).toBe(false);
    expect(canAdjudicateModerationReport('author-1', report)).toBe(false);
    expect(canAdjudicateModerationReport('target-1', report)).toBe(false);
    expect(canAdjudicateModerationReport('steward-2', report)).toBe(true);
  });
});

