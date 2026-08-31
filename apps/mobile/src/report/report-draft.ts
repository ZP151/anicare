import { isReviewedMediaReference } from '../media/media-reference';
import type { StoredDraft } from '../offline/draft-policy';

export type ReportDraftStep = 'photo' | 'details' | 'safety' | 'area' | 'review';
export type ReportCondition = 'appears_well' | 'needs_attention' | 'urgent';

export type ReportDraftPayloadV1 = Readonly<{
  version: 1;
  step: ReportDraftStep;
  occurredAt: string;
  coat: readonly string[];
  markings: readonly string[];
  condition: ReportCondition | null;
  manualPublicCellId: string | null;
  updatedAt: string;
}>;

const reportSteps = new Set<ReportDraftStep>(['photo', 'details', 'safety', 'area', 'review']);
const reportConditions = new Set<ReportCondition>(['appears_well', 'needs_attention', 'urgent']);
const coatValues = new Set(['tabby', 'black', 'white', 'ginger', 'grey', 'calico', 'tortoiseshell', 'brown']);
const markingValues = new Set(['white-paws', 'white-chest', 'white-tail-tip', 'ear-tip', 'collar', 'scar', 'striped', 'spotted']);
const pentagonBaseCells = new Set([4, 14, 24, 38, 49, 58, 63, 72, 83, 97, 107, 117]);
const payloadKeys = [
  'version', 'step', 'occurredAt', 'coat', 'markings', 'condition', 'manualPublicCellId', 'updatedAt',
] as const;

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

export function sanitizeReportDraftPayload(value: unknown): ReportDraftPayloadV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== payloadKeys.length || keys.some((key) => !payloadKeys.includes(key as typeof payloadKeys[number]))) invalid();
  if (candidate.version !== 1 || typeof candidate.step !== 'string' || !reportSteps.has(candidate.step as ReportDraftStep) ||
      !isCanonicalIsoTimestamp(candidate.occurredAt) || !isCanonicalIsoTimestamp(candidate.updatedAt) ||
      (candidate.condition !== null && (typeof candidate.condition !== 'string' || !reportConditions.has(candidate.condition as ReportCondition))) ||
      (candidate.manualPublicCellId !== null && !isCanonicalPublicCell(candidate.manualPublicCellId))) invalid();

  return Object.freeze({
    version: 1,
    step: candidate.step as ReportDraftStep,
    occurredAt: candidate.occurredAt,
    coat: sanitizeTraits(candidate.coat, coatValues),
    markings: sanitizeTraits(candidate.markings, markingValues),
    condition: candidate.condition as ReportCondition | null,
    manualPublicCellId: candidate.manualPublicCellId as string | null,
    updatedAt: candidate.updatedAt,
  });
}

export function createReportDraftPayload(now: Date): ReportDraftPayloadV1 {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
  const timestamp = now.toISOString();
  return sanitizeReportDraftPayload({
    version: 1,
    step: 'photo',
    occurredAt: timestamp,
    coat: [],
    markings: [],
    condition: null,
    manualPublicCellId: null,
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
