import type { StoredDraft } from './draft-policy';
import type { ReviewedMediaJournal } from '../media/reviewed-draft';
import type { ReviewReceipt } from '../media/contracts';
import type { UploadJob } from './upload-job';
import type { UploadJobState } from './upload-job';

export type MediaUploadClaim = Readonly<{
  draftId: string;
  mediaId: string;
  sightingId: string;
  ownerSubject: string;
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  receipt: ReviewReceipt;
  uploadJob: UploadJob & Readonly<{ state: 'uploading' | 'finalizing' }>;
  revision: number;
  recovering: boolean;
  recoveryOnly: boolean;
}>;

export function saveOfflineDraft(input: Record<string, unknown>): Promise<StoredDraft>;
export function listOfflineDrafts(): Promise<StoredDraft[]>;
export function getOfflineDraft(id: string): Promise<StoredDraft | null>;
export function claimMediaUploadAttempt(id: string, now: Date, leaseMs: number): Promise<MediaUploadClaim | null>;
export function transitionClaimedMediaUpload(
  id: string,
  expectedRevision: number,
  next: UploadJob,
): Promise<boolean>;
export function attachSightingToDraft(id: string, sightingId: string, ownerSubject: string): Promise<boolean>;
export function cleanupQuarantinedMedia(id: string, revision: number): Promise<void>;
export function deleteOfflineDraft(id: string): Promise<void>;
export function cleanupPendingReviewedMediaReferences(): Promise<void>;
export function getPendingReviewedMediaVersionMismatch(draft: StoredDraft): Readonly<{
  expectedRevision: number;
  expectedState: UploadJobState;
}> | undefined;
export function markReviewedMediaVersionMismatch(
  id: string,
  expectedRevision: number,
  expectedState: UploadJobState,
): Promise<boolean>;
export function saveReviewedMediaJournal(
  journal: ReviewedMediaJournal,
  state: 'local_persisting' | 'upload_pending' | 'needs_user',
  error: 'local_media_missing' | 'local_media_corrupt' | 'version_mismatch' | null,
): Promise<void>;
