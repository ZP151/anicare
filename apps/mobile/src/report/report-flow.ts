import type { MyReportSummary } from '../api/my-reports';
import type { SightingLocationInput } from '../api/sightings';
import type { StoredDraft } from '../offline/draft-policy';
import type { ReportDraftPayloadV1, ReportDraftStep } from './report-draft';

export type ReportPrerequisiteIssue = 'details_required' | 'area_required' | 'review_required';

export type ReportTimelineItem = Readonly<{
  key: string;
  kind: 'committed' | 'recovery';
  sightingId: string | null;
  draftId: string | null;
  occurredAt: string;
  reportState: MyReportSummary['reportState'] | 'draft' | 'submitted';
  mediaState: MyReportSummary['mediaState'] | 'needs_user';
  identityState: MyReportSummary['identityState'];
}>;

export type ReportReceiptStatus = Readonly<{
  reportState: MyReportSummary['reportState'] | 'draft' | 'submitted';
  mediaState: MyReportSummary['mediaState'] | 'needs_user';
  identityState: MyReportSummary['identityState'];
}>;

export function earliestIncompleteStep(draft: StoredDraft): ReportDraftStep {
  const payload = draft.report;
  if (!payload) return 'photo';
  if (payload.step === 'photo') return 'photo';
  if (payload.step === 'area' && payload.condition === null) return 'area';
  if (payload.condition === null) return 'details';
  if (payload.step === 'details') return 'details';
  if (payload.step === 'safety') return 'safety';
  if (payload.manualPublicCellId === null) return 'area';
  if (payload.step === 'area') return 'area';
  return 'review';
}

export function validateReportForSubmission(
  draft: StoredDraft,
  location: SightingLocationInput | null,
): readonly ReportPrerequisiteIssue[] {
  const payload = draft.report;
  const issues: ReportPrerequisiteIssue[] = [];
  if (!payload || payload.condition === null) issues.push('details_required');
  if (location === null) issues.push('area_required');
  if (!payload || payload.step !== 'review') issues.push('review_required');
  return Object.freeze(issues);
}

export function reportTraits(payload: ReportDraftPayloadV1): Readonly<Record<string, unknown>> {
  return Object.freeze({
    coat: [...payload.coat],
    markings: [...payload.markings],
    condition: payload.condition,
  });
}

function hasMediaBoundary(draft: StoredDraft): boolean {
  return draft.mediaId !== undefined || draft.encryptedReviewedRef !== undefined ||
    draft.encryptionVersion !== undefined || draft.receipt !== undefined || draft.uploadJob !== undefined ||
    draft.mediaFailure !== undefined;
}

function localMediaState(draft: StoredDraft): ReportTimelineItem['mediaState'] {
  if (draft.mediaFailure !== undefined || draft.uploadJob?.state === 'needs_user') return 'needs_user';
  if (!hasMediaBoundary(draft)) return 'none';
  if (draft.uploadJob?.state === 'quarantined') return 'quarantined';
  if (draft.uploadJob?.state === 'complete') return 'removed';
  return 'pending';
}

function committedTimelineItem(summary: MyReportSummary, local: StoredDraft | null = null): ReportTimelineItem {
  return Object.freeze({
    key: `committed:${summary.sightingId}`,
    kind: 'committed',
    sightingId: summary.sightingId,
    draftId: null,
    occurredAt: summary.occurredAt,
    reportState: summary.reportState,
    mediaState: local && localMediaState(local) === 'needs_user' ? 'needs_user' : summary.mediaState,
    identityState: summary.identityState,
  });
}

function recoveryTimelineItem(draft: StoredDraft): ReportTimelineItem | null {
  if (!draft.report && !draft.textReceiptCommittedAt) return null;
  return Object.freeze({
    key: `recovery:${draft.id}`,
    kind: 'recovery',
    sightingId: draft.sightingId ?? null,
    draftId: draft.id,
    occurredAt: draft.report?.occurredAt ?? draft.textReceiptCommittedAt!,
    reportState: draft.sightingId && !hasMediaBoundary(draft) ? 'submitted' : 'draft',
    mediaState: localMediaState(draft),
    identityState: 'not_requested',
  });
}

export function mergeReportRecovery(
  remote: readonly MyReportSummary[],
  local: readonly StoredDraft[],
): readonly ReportTimelineItem[] {
  const remoteSightingIds = new Set(remote.map((summary) => summary.sightingId));
  const localBySighting = new Map(local.filter((draft) => draft.sightingId).map((draft) => [draft.sightingId!, draft]));
  const items: ReportTimelineItem[] = remote.map((summary) => committedTimelineItem(summary, localBySighting.get(summary.sightingId) ?? null));
  for (const draft of local) {
    if (draft.sightingId && remoteSightingIds.has(draft.sightingId)) continue;
    const item = recoveryTimelineItem(draft);
    if (item) items.push(item);
  }
  return Object.freeze(items.sort((left, right) => {
    const time = right.occurredAt.localeCompare(left.occurredAt);
    return time !== 0 ? time : left.key.localeCompare(right.key);
  }));
}

export function mergeReceiptStatus(remote: MyReportSummary | null, local: StoredDraft | null): ReportReceiptStatus | null {
  if (remote) {
    const localState = local ? localMediaState(local) : 'none';
    const mediaState = localState === 'needs_user'
      ? localState
      : remote.mediaState;
    return Object.freeze({ reportState: remote.reportState, mediaState, identityState: remote.identityState });
  }
  const recovery = local ? recoveryTimelineItem(local) : null;
  return recovery ? Object.freeze({ reportState: recovery.reportState, mediaState: recovery.mediaState, identityState: recovery.identityState }) : null;
}
