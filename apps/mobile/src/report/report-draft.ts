import { isReviewedMediaReference } from '../media/media-reference';
import type { StoredDraft } from '../offline/draft-policy';

export type ReportDraftStep = 'photo' | 'details' | 'safety' | 'area' | 'review';
export type ReportCondition = 'appears_well' | 'needs_attention' | 'urgent';
export type ReportAreaSelectionMode = 'either' | 'manual_required';
export type ReportDraftCreatorMode = 'anonymous' | 'authenticated';
export type ReportIdentityIntent = Readonly<{ kind: 'existing'; animalId: string }> | Readonly<{ kind: 'new' }> | null;
export type ReportPublicPlace = Readonly<{ residenceType: 'hdb' | 'condo' | 'other'; name: string }>;

export type ReportDraftPayloadV1 = Readonly<{
  version: 1;
  step: ReportDraftStep;
  areaSelectionMode?: ReportAreaSelectionMode;
  creatorMode?: ReportDraftCreatorMode;
  occurredAt: string;
  coat: readonly string[];
  markings: readonly string[];
  condition: ReportCondition | null;
  manualPublicCellId: string | null;
  /** Explicitly supplied by the reporter; never inferred from a coordinate or H3 cell. */
  publicPlace?: ReportPublicPlace;
  /** A reporter's tentative choice, never an accepted sighting/animal link. */
  /** Optional in the type solely for legacy callers; the sanitizer always emits null or a valid intent. */
  identityIntent?: ReportIdentityIntent;
  /** Stable only while an identity intent is pending, for idempotent retries. */
  identityRequestId?: string;
  updatedAt: string;
}>;

const reportSteps = new Set<ReportDraftStep>(['photo', 'details', 'safety', 'area', 'review']);
const reportConditions = new Set<ReportCondition>(['appears_well', 'needs_attention', 'urgent']);
const areaSelectionModes = new Set<ReportAreaSelectionMode>(['either', 'manual_required']);
const creatorModes = new Set<ReportDraftCreatorMode>(['anonymous', 'authenticated']);
const coatValues = new Set(['tabby', 'black', 'white', 'ginger', 'grey', 'calico', 'tortoiseshell', 'brown']);
const markingValues = new Set(['white-paws', 'white-chest', 'white-tail-tip', 'ear-tip', 'collar', 'scar', 'striped', 'spotted']);
const pentagonBaseCells = new Set([4, 14, 24, 38, 49, 58, 63, 72, 83, 97, 107, 117]);
const payloadKeys = [
  'version', 'step', 'areaSelectionMode', 'creatorMode', 'occurredAt', 'coat', 'markings', 'condition', 'manualPublicCellId', 'publicPlace', 'identityIntent', 'identityRequestId', 'updatedAt',
] as const;
const requiredPayloadKeys = payloadKeys.filter((key) => key !== 'areaSelectionMode' && key !== 'creatorMode' && key !== 'publicPlace' && key !== 'identityIntent' && key !== 'identityRequestId');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(): never {
  throw new Error('invalid_report_draft');
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function sanitizeTraits(value: unknown, allowed: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(value)) invalid();
  const traits: string[] = [];
  for (const trait of value) {
    if (typeof trait !== 'string' || trait.length === 0 || trait.length > 40) invalid();
    if (allowed.has(trait) && !traits.includes(trait) && traits.length < 8) traits.push(trait);
  }
  return Object.freeze(traits);
}

function isCanonicalPublicCell(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{15}$/.test(value)) return false;
  const index = BigInt(`0x${value}`);
  const mode = Number((index >> 59n) & 0xfn);
  const reserved = Number((index >> 56n) & 0x7n);
  const resolution = Number((index >> 52n) & 0xfn);
  const baseCell = Number((index >> 45n) & 0x7fn);
  if (mode !== 1 || reserved !== 0 || resolution !== 9 || baseCell > 121) return false;

  let leadingNonZeroDigit = 0;
  for (let digitIndex = 1; digitIndex <= 15; digitIndex += 1) {
    const digit = Number((index >> BigInt((15 - digitIndex) * 3)) & 0x7n);
    if (digitIndex <= resolution) {
      if (digit === 7) return false;
      if (leadingNonZeroDigit === 0 && digit !== 0) leadingNonZeroDigit = digit;
    } else if (digit !== 7) {
      return false;
    }
  }
  return !pentagonBaseCells.has(baseCell) || leadingNonZeroDigit !== 1;
}

function sanitizePublicPlace(value: unknown): ReportPublicPlace | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== 2 || !['hdb', 'condo', 'other'].includes(candidate.residenceType as string) ||
      typeof candidate.name !== 'string' || /[\u0000-\u001F\u007F-\u009F]/.test(candidate.name)) invalid();
  const name = candidate.name.trim();
  if (name.length < 1 || name.length > 100) invalid();
  return Object.freeze({ residenceType: candidate.residenceType as ReportPublicPlace['residenceType'], name });
}

export function sanitizeReportDraftPayload(value: unknown): ReportDraftPayloadV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.some((key) => !payloadKeys.includes(key as typeof payloadKeys[number])) ||
      requiredPayloadKeys.some((key) => !Object.prototype.hasOwnProperty.call(candidate, key))) invalid();
  const areaSelectionMode = candidate.areaSelectionMode ?? 'either';
  const identityIntent = candidate.identityIntent ?? null;
  const identityRequestId = candidate.identityRequestId;
  const publicPlace = sanitizePublicPlace(candidate.publicPlace);
  if (candidate.version !== 1 || typeof candidate.step !== 'string' || !reportSteps.has(candidate.step as ReportDraftStep) ||
      typeof areaSelectionMode !== 'string' || !areaSelectionModes.has(areaSelectionMode as ReportAreaSelectionMode) ||
      (candidate.creatorMode !== undefined &&
        (typeof candidate.creatorMode !== 'string' || !creatorModes.has(candidate.creatorMode as ReportDraftCreatorMode))) ||
      !isCanonicalIsoTimestamp(candidate.occurredAt) || !isCanonicalIsoTimestamp(candidate.updatedAt) ||
      (candidate.condition !== null && (typeof candidate.condition !== 'string' || !reportConditions.has(candidate.condition as ReportCondition))) ||
      (candidate.manualPublicCellId !== null && !isCanonicalPublicCell(candidate.manualPublicCellId)) ||
      (identityIntent !== null && (!identityIntent || typeof identityIntent !== 'object' || Array.isArray(identityIntent))) ||
      (identityIntent !== null && identityRequestId === undefined) ||
      (identityRequestId !== undefined && (typeof identityRequestId !== 'string' || !UUID.test(identityRequestId)))) invalid();

  if (identityIntent !== null) {
    const intent = identityIntent as Record<string, unknown>;
    const keys = Object.keys(intent);
    const validExisting = intent.kind === 'existing' && keys.length === 2 &&
      Object.prototype.hasOwnProperty.call(intent, 'animalId') && typeof intent.animalId === 'string' && UUID.test(intent.animalId);
    const validNew = intent.kind === 'new' && keys.length === 1;
    if (!validExisting && !validNew) invalid();
  }

  return Object.freeze({
    version: 1,
    step: candidate.step as ReportDraftStep,
    areaSelectionMode: areaSelectionMode as ReportAreaSelectionMode,
    ...(candidate.creatorMode ? { creatorMode: candidate.creatorMode as ReportDraftCreatorMode } : {}),
    occurredAt: candidate.occurredAt,
    coat: sanitizeTraits(candidate.coat, coatValues),
    markings: sanitizeTraits(candidate.markings, markingValues),
    condition: candidate.condition as ReportCondition | null,
    manualPublicCellId: candidate.manualPublicCellId as string | null,
    ...(publicPlace ? { publicPlace } : {}),
    identityIntent: identityIntent === null
      ? null
      : (identityIntent as ReportIdentityIntent),
    ...(identityIntent !== null ? { identityRequestId: identityRequestId as string } : {}),
    updatedAt: candidate.updatedAt,
  });
}

export function createReportDraftPayload(
  now: Date,
  options: Readonly<{ areaSelectionMode?: ReportAreaSelectionMode; creatorMode?: ReportDraftCreatorMode }> = {},
): ReportDraftPayloadV1 {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
  const timestamp = now.toISOString();
  return sanitizeReportDraftPayload({
    version: 1,
    step: 'photo',
    areaSelectionMode: 'either',
    ...options,
    occurredAt: timestamp,
    coat: [],
    markings: [],
    condition: null,
    manualPublicCellId: null,
    identityIntent: null,
    updatedAt: timestamp,
  });
}

export function reportDraftSummary(draft: StoredDraft): Readonly<{
  id: string;
  updatedAt: string;
  step: ReportDraftStep;
  title: string;
  hasReviewedMedia: boolean;
}> | null {
  if (!draft.report) return null;
  return Object.freeze({
    id: draft.id,
    updatedAt: draft.report.updatedAt,
    step: draft.report.step,
    title: 'Report draft',
    hasReviewedMedia: isReviewedMediaReference(draft.encryptedReviewedRef, draft.mediaId),
  });
}

export async function removeReviewedMediaFromDraft(draftId: string): Promise<void> {
  const store = await import('../offline/draft-store');
  await store.removeReviewedMediaFromDraft(draftId);
}
