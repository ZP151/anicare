import { finalizeMediaUpload, putReservedMedia, reserveMediaUpload } from '../api/media-transport';
import { developmentInsecureOrigins } from '../api/development-origin';
import { getSupabaseClient } from '../api/supabase';
import {
  claimMediaUploadAttempt,
  cleanupQuarantinedMedia,
  getOfflineDraft,
  listOfflineDrafts,
  transitionClaimedMediaUpload,
  type MediaUploadClaim,
} from '../offline/draft-store';
import type { StoredDraft } from '../offline/draft-policy';
import type { UploadJobState } from '../offline/upload-job';
import { deleteReviewedMediaReference, withDecryptedReviewedJpeg } from './draft-media';
import { runMediaUploadAttempt, type MediaUploadRunResult } from './media-upload-coordinator';

const CLAIM_LEASE_MS = 60_000;
const RECOVERY_BATCH_LIMIT = 4;
export { developmentInsecureOrigins } from '../api/development-origin';

export type MediaUploadRuntimeResult = MediaUploadRunResult | UploadJobState | 'not_ready';

export type MediaUploadRuntimeDependencies = Readonly<{
  getAccessToken(): Promise<string | null>;
  getOwnerSubject(): Promise<string | null>;
  listDrafts(): Promise<readonly StoredDraft[]>;
  getDraft(id: string): Promise<StoredDraft | null>;
  claimAttempt(id: string, now: Date, leaseMs: number): Promise<MediaUploadClaim | null>;
  runAttempt(claim: MediaUploadClaim): Promise<MediaUploadRunResult>;
  deleteCiphertext(reference: string): Promise<void>;
  cleanupQuarantined(id: string, revision: number): Promise<void>;
  now(): Date;
  leaseMs: number;
}>;

function isRetryCandidate(draft: StoredDraft, now: Date, leaseMs: number): boolean {
  if (draft.mediaFailure || !draft.mediaId || !draft.sightingId || !draft.encryptedReviewedRef ||
      draft.encryptionVersion !== 'aes-256-gcm.v1' || !draft.receipt || !draft.uploadJob) return false;
  const job = draft.uploadJob;
  if (job.state === 'upload_pending' || job.state === 'quarantined') return true;
  if (job.state === 'waiting') {
    const due = job.nextAttemptAt ? Date.parse(job.nextAttemptAt) : Number.NaN;
    return Number.isFinite(due) && due <= now.getTime();
  }
  if (job.state === 'uploading' || job.state === 'finalizing') {
    const started = job.attemptStartedAt ? Date.parse(job.attemptStartedAt) : Number.NaN;
    return Number.isFinite(started) && started + leaseMs <= now.getTime();
  }
  return false;
}

export function createMediaUploadRuntime(dependencies: MediaUploadRuntimeDependencies) {
  async function uploadDraftMediaNow(draftId: string): Promise<MediaUploadRuntimeResult> {
    // Check auth before the CAS claim, because claiming increments attempts.
    const ownerSubject = await dependencies.getOwnerSubject();
    if (!ownerSubject) return 'not_ready';
    const current = await dependencies.getDraft(draftId);
    if (current?.mediaId && current.ownerSubject !== ownerSubject) return 'needs_user';
    if (current?.mediaFailure || current?.uploadJob?.state === 'needs_user') return 'needs_user';
    if (!await dependencies.getAccessToken()) return 'not_ready';
    if (current?.uploadJob?.state === 'quarantined') {
      const revision = current.revision;
      if (!current.encryptedReviewedRef || typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return 'needs_user';
      // Quarantine is already the durable success boundary. Resume only its ordered local cleanup.
      await dependencies.deleteCiphertext(current.encryptedReviewedRef);
      await dependencies.cleanupQuarantined(current.id, revision);
      return 'quarantined';
    }
    if (current?.uploadJob?.state === 'waiting') {
      const due = current.uploadJob.nextAttemptAt ? Date.parse(current.uploadJob.nextAttemptAt) : Number.NaN;
      if (!Number.isFinite(due) || due > dependencies.now().getTime()) return 'waiting';
    }
    if (current?.uploadJob?.state === 'uploading' || current?.uploadJob?.state === 'finalizing') {
      const started = current.uploadJob.attemptStartedAt ? Date.parse(current.uploadJob.attemptStartedAt) : Number.NaN;
      if (!Number.isFinite(started) || started + dependencies.leaseMs > dependencies.now().getTime()) {
        return current.uploadJob.state;
      }
    }
    const claim = await dependencies.claimAttempt(draftId, dependencies.now(), dependencies.leaseMs);
    if (!claim) {
      const latest = await dependencies.getDraft(draftId);
      return latest?.mediaFailure ? 'needs_user' : latest?.uploadJob?.state ?? 'not_ready';
    }
    return dependencies.runAttempt(claim);
  }

  async function retryRecoverableMediaDrafts(): Promise<MediaUploadRuntimeResult[]> {
    if (!await dependencies.getOwnerSubject()) return [];
    const now = dependencies.now();
    const candidates = (await dependencies.listDrafts())
      .filter((draft) => isRetryCandidate(draft, now, dependencies.leaseMs))
      .slice(0, RECOVERY_BATCH_LIMIT);
    const results: MediaUploadRuntimeResult[] = [];
    // Intentionally sequential: Task 4 CAS owns cross-trigger concurrency.
    for (const draft of candidates) results.push(await uploadDraftMediaNow(draft.id));
    return results;
  }

  return { uploadDraftMediaNow, retryRecoverableMediaDrafts };
}

async function currentAccessToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function currentOwnerSubject(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const strictTransportDependencies = {
  fetch: globalThis.fetch,
  supabaseUrl,
  now: () => new Date(),
  insecureOrigins: developmentInsecureOrigins(supabaseUrl, process.env.NODE_ENV === 'production'),
};

const nativeRuntime = createMediaUploadRuntime({
  getAccessToken: currentAccessToken,
  getOwnerSubject: currentOwnerSubject,
  listDrafts: listOfflineDrafts,
  getDraft: getOfflineDraft,
  claimAttempt: claimMediaUploadAttempt,
  runAttempt: (claim) => runMediaUploadAttempt(claim, {
    getOfflineDraft,
    transitionClaimedMediaUpload,
    getOwnerSubject: currentOwnerSubject,
    getAccessToken: async () => {
      const token = await currentAccessToken();
      if (!token) throw new Error('authentication_required');
      return token;
    },
    withDecryptedReviewedJpeg,
    reserveMediaUpload: (input) => reserveMediaUpload(input, strictTransportDependencies),
    putReservedMedia: (input) => putReservedMedia(input, strictTransportDependencies),
    finalizeMediaUpload: (input) => finalizeMediaUpload(input, strictTransportDependencies),
    deleteReviewedMediaReference,
    cleanupQuarantinedMedia,
    now: () => new Date(),
    random: Math.random,
  }),
  deleteCiphertext: deleteReviewedMediaReference,
  cleanupQuarantined: cleanupQuarantinedMedia,
  now: () => new Date(),
  leaseMs: CLAIM_LEASE_MS,
});

export const uploadDraftMediaNow = nativeRuntime.uploadDraftMediaNow;
export const retryRecoverableMediaDrafts = nativeRuntime.retryRecoverableMediaDrafts;
