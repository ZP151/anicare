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
  attachSighting(draftId: string, sightingId: string): Promise<boolean>;
  uploadMedia(draftId: string): Promise<MediaSubmissionState>;
  deleteDraft(draftId: string): Promise<void>;
}>;

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
  await persistReportDraftBeforeReview(input, dependencies);
  const draft = await dependencies.getDraft(input.draftId);
  if (!draft) throw new Error('missing_durable_draft');

  const resolved = await recoverOrCreateSighting(input, draft, dependencies);
  if (resolved.recoveryMiss || !resolved.sighting) {
    return { sightingId: null, visibility: null, state: 'recovery_miss' };
  }

  if (!draft.sightingId && !await dependencies.attachSighting(input.draftId, resolved.sighting.sightingId)) {
    throw new Error('sighting_attachment_conflict');
  }

  const durable = await dependencies.getDraft(input.draftId);
  if (!durable || durable.sightingId !== resolved.sighting.sightingId) {
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
