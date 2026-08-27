import type { SightingRecoveryOutcome, SightingRisk, SightingSubmissionResponse } from '../api/sightings';
import type { StoredDraft } from '../offline/draft-policy';
import type { UploadJobState } from '../offline/upload-job';

export type ReportCoordinates = Readonly<{ latitude: number; longitude: number }>;
export type MediaSubmissionState = UploadJobState | 'not_ready' | 'unavailable' | 'stale';

export type SubmitReportWithMediaInput = Readonly<{
  draftId: string;
  notes: string;
  risk: SightingRisk;
  coordinates: ReportCoordinates | null;
  occurredAt: Date;
}>;

export type ReportSubmissionOutcome = Readonly<{
  sightingId: string | null;
  visibility: SightingSubmissionResponse['visibility'] | null;
  state: 'submitted_text_only' | 'recovery_miss' | MediaSubmissionState;
}>;

export type ReportSubmissionDependencies = Readonly<{
  saveDraft(input: Readonly<{ id: string; notes: string; risk: SightingRisk }>): Promise<unknown>;
  getDraft(id: string): Promise<StoredDraft | null>;
  recoverSighting(draftId: string): Promise<SightingRecoveryOutcome>;
  createSighting(input: Readonly<{
    latitude: number;
    longitude: number;
    occurredAt: Date;
    risk: SightingRisk;
    notes: string | null;
    clientDedupeKey: string;
  }>): Promise<SightingSubmissionResponse>;
  currentOwnerSubject(): Promise<string>;
  attachSighting(draftId: string, sightingId: string, ownerSubject: string): Promise<boolean>;
  uploadMedia(draftId: string): Promise<MediaSubmissionState>;
  deleteDraft(draftId: string): Promise<void>;
}>;

export function nextReportDraftIdAfterSubmission(
  currentDraftId: string,
  result: ReportSubmissionOutcome,
  nextDraftId: string,
): string {
  return result.state === 'submitted_text_only' || result.state === 'quarantined'
    ? nextDraftId
    : currentDraftId;
}

export function nextReportFormAfterSubmission(
  currentDraftId: string,
  result: ReportSubmissionOutcome,
  nextDraftId: string,
): Readonly<{ draftId: string; resetForm: boolean; keepConfirmation: boolean }> {
  const resetForm = nextReportDraftIdAfterSubmission(currentDraftId, result, nextDraftId) !== currentDraftId;
  return { draftId: resetForm ? nextDraftId : currentDraftId, resetForm, keepConfirmation: resetForm };
}

export class ReportDraftPersistenceError extends Error {
  constructor() {
    super('draft_persistence_failed');
    this.name = 'ReportDraftPersistenceError';
  }
}

export async function persistReportDraftBeforeReview(
  input: Readonly<{ draftId: string; notes: string; risk: SightingRisk }>,
  dependencies: Pick<ReportSubmissionDependencies, 'saveDraft'>,
): Promise<void> {
  await dependencies.saveDraft({ id: input.draftId, notes: input.notes, risk: input.risk });
}

function hasMediaBoundary(draft: StoredDraft): boolean {
  return draft.mediaId !== undefined ||
    draft.encryptedReviewedRef !== undefined || draft.encryptionVersion !== undefined ||
    draft.receipt !== undefined || draft.uploadJob !== undefined || draft.mediaFailure !== undefined;
}

type ResolvedSighting = Readonly<{
  sightingId: string;
  visibility: SightingSubmissionResponse['visibility'] | null;
}>;

async function recoverOrCreateSighting(
  input: SubmitReportWithMediaInput,
  draft: StoredDraft,
  dependencies: ReportSubmissionDependencies,
): Promise<Readonly<{ sighting: ResolvedSighting | null; recoveryMiss: boolean }>> {
  if (draft.sightingId) {
    return { sighting: { sightingId: draft.sightingId, visibility: null }, recoveryMiss: false };
  }

  const recovered = await dependencies.recoverSighting(input.draftId);
  if (!('kind' in recovered)) {
    return { sighting: { sightingId: recovered.sightingId, visibility: recovered.visibility }, recoveryMiss: false };
  }
  if (!input.coordinates) return { sighting: null, recoveryMiss: true };
  const created = await dependencies.createSighting({
    latitude: input.coordinates.latitude,
    longitude: input.coordinates.longitude,
    occurredAt: input.occurredAt,
    risk: input.risk,
    notes: input.notes.trim() || null,
    clientDedupeKey: input.draftId,
  });
  return {
    sighting: { sightingId: created.sightingId, visibility: created.visibility },
    recoveryMiss: false,
  };
}

/**
 * Coordinates remain in this invocation only. The durable draft first anchors
 * the dedupe key; a sighting ID is appended before Task 4 may claim media.
 */
export async function submitReportWithMedia(
  input: SubmitReportWithMediaInput,
  dependencies: ReportSubmissionDependencies,
): Promise<ReportSubmissionOutcome> {
  try {
    await persistReportDraftBeforeReview(input, dependencies);
  } catch {
    throw new ReportDraftPersistenceError();
  }
  const draft = await dependencies.getDraft(input.draftId);
  if (!draft) throw new Error('missing_durable_draft');
  const ownerSubject = await dependencies.currentOwnerSubject();
  if (draft.ownerSubject !== undefined && draft.ownerSubject !== ownerSubject) throw new Error('auth_ownership');

  const resolved = await recoverOrCreateSighting(input, draft, dependencies);
  if (resolved.recoveryMiss || !resolved.sighting) {
    return { sightingId: null, visibility: null, state: 'recovery_miss' };
  }

  if (!draft.sightingId && !await dependencies.attachSighting(input.draftId, resolved.sighting.sightingId, ownerSubject)) {
    throw new Error('sighting_attachment_conflict');
  }

  const durable = await dependencies.getDraft(input.draftId);
  if (!durable || durable.sightingId !== resolved.sighting.sightingId || durable.ownerSubject !== ownerSubject) {
    throw new Error('sighting_attachment_conflict');
  }

  if (!hasMediaBoundary(durable)) {
    await dependencies.deleteDraft(input.draftId);
    return {
      sightingId: resolved.sighting.sightingId,
      visibility: resolved.sighting.visibility,
      state: 'submitted_text_only',
    };
  }

  const state = await dependencies.uploadMedia(input.draftId);
  return {
    sightingId: resolved.sighting.sightingId,
    visibility: resolved.sighting.visibility,
    state,
  };
}

export function reportSubmissionStatus(result: ReportSubmissionOutcome): string {
  switch (result.state) {
    case 'submitted_text_only':
      if (result.visibility === 'hidden') return 'Submitted for private safety review.';
      if (result.visibility === 'public') return 'Submitted. The public update will appear after its safety delay.';
      return 'Submitted. Visibility is being confirmed; it is not public availability.';
    case 'quarantined':
      return 'Reviewed media is in private quarantine. It is not publicly available.';
    case 'upload_pending':
      return 'Reviewed media is queued for a private upload and remains on this device.';
    case 'uploading':
      return 'Reviewed media is uploading privately. It is not publicly available.';
    case 'finalizing':
      return 'Reviewed media is awaiting private quarantine confirmation.';
    case 'waiting':
      return 'Private media upload retry is scheduled. It is not publicly available.';
    case 'needs_user':
      return 'The encrypted media needs review or recapture before it can be retried.';
    case 'recovery_miss':
      return 'No prior submission was found. Choose a location to submit this draft again, or recapture and re-review if its media cannot be recovered.';
    case 'not_ready':
      return 'Private media remains on this device until an authenticated upload can run.';
    case 'unavailable':
      return 'Secure media transport is unavailable on this platform. Nothing was uploaded.';
    case 'stale':
      return 'Another recovery run owns this media state. It remains private and will be rechecked.';
    default:
      return 'Your durable report state is awaiting safe recovery.';
  }
}

export function reportSubmissionFailureStatus(error: unknown): string {
  if (error instanceof ReportDraftPersistenceError) {
    return 'Submission could not safely start. Review the report and try again.';
  }
  if (error instanceof Error && error.message === 'authentication_required') {
    return 'Sign in from Profile before contributing. Anonymous browsing remains available.';
  }
  return 'Submission could not be completed. Your durable draft remains available for recovery.';
}
