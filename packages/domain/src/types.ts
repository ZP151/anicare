export type VerificationProvenance =
  | 'reported'
  | 'community_confirmed'
  | 'partner_confirmed'
  | 'disputed'
  | 'superseded';

export type AnimalLifecycle =
  | 'unknown'
  | 'active'
  | 'inactive'
  | 'adopted'
  | 'relocated'
  | 'deceased';

export type AnimalEventType =
  | 'profile_created'
  | 'alias_added'
  | 'lifecycle_asserted'
  | 'fact_disputed'
  | 'fact_superseded';

export interface AnimalEvent {
  id: string;
  animalId: string;
  type: AnimalEventType;
  occurredAt: string;
  recordedAt: string;
  provenance: VerificationProvenance;
  actorId: string | null;
  payload?: {
    primaryAlias?: string;
    alias?: string;
    lifecycle?: AnimalLifecycle;
    supersedesEventId?: string;
    [key: string]: unknown;
  };
}

export interface DerivedAnimalState {
  animalId: string;
  aliases: string[];
  lifecycle: AnimalLifecycle;
  lifecycleProvenance: VerificationProvenance;
  verification: Exclude<VerificationProvenance, 'disputed' | 'superseded'>;
  disputed: boolean;
}

export type RiskTier = 'normal' | 'sensitive' | 'critical';

export type PublicTimeBucket = 'overnight' | 'morning' | 'afternoon' | 'evening';

export interface PublicLocationCell {
  cellId: string;
  resolution: 9;
}

export type PreciseLocationPurpose =
  | 'welfare_check'
  | 'transport'
  | 'veterinary_care'
  | 'tnr_support';

export interface PreciseLocationGrant {
  id: string;
  userId: string;
  animalId: string;
  purpose: PreciseLocationPurpose;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

