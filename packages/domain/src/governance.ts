export interface IdentityProposalInput {
  id: string;
  sightingId: string;
  proposedAnimalId: string | null;
  proposerId: string;
  source: 'ai_candidate' | 'manual_search' | 'new_animal';
  createdAt: string;
}

export interface IdentityProposal extends IdentityProposalInput {
  status: 'tentative';
}

export function createIdentityProposal(input: IdentityProposalInput): IdentityProposal {
  return { ...input, status: 'tentative' };
}

export interface CareEventCandidate {
  animalId: string | null;
  actorId: string;
  activity: string;
  completedAt: string;
  publicCellId: string;
  dedupeKey: string;
  status: 'draft' | 'completed' | 'rejected';
}

const countableCareActivities = new Set(['feed', 'water', 'cleanup', 'observe', 'companionship']);

export function isEffectiveCareEvent(event: CareEventCandidate): boolean {
  return (
    event.status === 'completed' &&
    event.animalId !== null &&
    event.actorId.length > 0 &&
    event.completedAt.length > 0 &&
    event.publicCellId.length > 0 &&
    event.dedupeKey.length > 0 &&
    countableCareActivities.has(event.activity)
  );
}

export interface ModerationParticipants {
  reporterId: string;
  contentAuthorId: string | null;
  targetUserId: string | null;
}

export function canAdjudicateModerationReport(
  reviewerId: string,
  report: ModerationParticipants,
): boolean {
  return ![report.reporterId, report.contentAuthorId, report.targetUserId].includes(reviewerId);
}

