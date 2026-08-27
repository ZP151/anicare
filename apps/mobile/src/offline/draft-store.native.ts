import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { deleteReviewedMediaReference } from '../media/draft-media';
import { isReviewedMediaReference, isStableMediaId } from '../media/media-reference';
import type { ReviewedMediaJournal } from '../media/reviewed-draft';
import {
  sanitizeDraftForStorage,
  UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION,
  type StoredDraft,
} from './draft-policy';
import type { UploadJob, UploadJobState, UploadResumeState } from './upload-job';

const DATABASE_KEY_NAME = 'animalhelper.offline-drafts.v1';
const DATABASE_NAME = 'animalhelper-drafts.db';

export const LEGACY_URI_CLEAR_SQL = 'UPDATE sighting_drafts SET photo_uri = NULL;';
export const LEGACY_REVIEWED_PATH_CLEAR_SQL = 'UPDATE sighting_drafts SET reviewed_media_path = NULL;';
export const ENCRYPTION_VERSION_BACKFILL_SQL = `UPDATE sighting_drafts
  SET encryption_version = 'aes-256-gcm.v1'
  WHERE reviewed_media_ref IS NOT NULL AND encryption_version IS NULL;`;
export const DRAFT_SAVE_SQL = `INSERT INTO sighting_drafts
     (id, notes, risk, media_id, sighting_id, reviewed_media_ref, encryption_version,
      review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error,
      upload_resume_state, upload_attempt_started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       notes = excluded.notes,
       risk = excluded.risk,
       media_id = COALESCE(sighting_drafts.media_id, excluded.media_id),
       sighting_id = COALESCE(sighting_drafts.sighting_id, excluded.sighting_id),
       reviewed_media_ref = COALESCE(sighting_drafts.reviewed_media_ref, excluded.reviewed_media_ref),
       encryption_version = COALESCE(sighting_drafts.encryption_version, excluded.encryption_version),
       review_receipt_json = COALESCE(sighting_drafts.review_receipt_json, excluded.review_receipt_json),
       upload_state = CASE WHEN excluded.media_id IS NOT NULL AND
         (sighting_drafts.media_id IS NULL OR
          (excluded.media_id = sighting_drafts.media_id AND sighting_drafts.upload_state = 'local_persisting'))
         THEN excluded.upload_state ELSE sighting_drafts.upload_state END,
       upload_attempts = CASE WHEN excluded.media_id IS NOT NULL AND
         (sighting_drafts.media_id IS NULL OR
          (excluded.media_id = sighting_drafts.media_id AND sighting_drafts.upload_state = 'local_persisting'))
         THEN excluded.upload_attempts ELSE sighting_drafts.upload_attempts END,
       next_attempt_at = CASE WHEN excluded.media_id IS NOT NULL AND
         (sighting_drafts.media_id IS NULL OR
          (excluded.media_id = sighting_drafts.media_id AND sighting_drafts.upload_state = 'local_persisting'))
         THEN excluded.next_attempt_at ELSE sighting_drafts.next_attempt_at END,
       last_error = CASE WHEN excluded.media_id IS NOT NULL AND
         (sighting_drafts.media_id IS NULL OR
          (excluded.media_id = sighting_drafts.media_id AND sighting_drafts.upload_state = 'local_persisting'))
         THEN excluded.last_error ELSE sighting_drafts.last_error END,
       upload_resume_state = CASE WHEN excluded.media_id IS NOT NULL AND
         (sighting_drafts.media_id IS NULL OR
          (excluded.media_id = sighting_drafts.media_id AND sighting_drafts.upload_state = 'local_persisting'))
         THEN excluded.upload_resume_state ELSE sighting_drafts.upload_resume_state END,
       upload_attempt_started_at = CASE WHEN excluded.media_id IS NOT NULL AND
         (sighting_drafts.media_id IS NULL OR
          (excluded.media_id = sighting_drafts.media_id AND sighting_drafts.upload_state = 'local_persisting'))
         THEN excluded.upload_attempt_started_at ELSE sighting_drafts.upload_attempt_started_at END,
       revision = sighting_drafts.revision + 1,
       updated_at = excluded.updated_at`;
export const DRAFT_LIST_SQL = `SELECT id, notes, risk, media_id, sighting_id, reviewed_media_ref,
  encryption_version, review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error,
  upload_resume_state, upload_attempt_started_at, revision
  FROM sighting_drafts ORDER BY updated_at DESC`;
export const DRAFT_GET_SQL = `SELECT id, notes, risk, media_id, sighting_id, reviewed_media_ref,
  encryption_version, review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error,
  upload_resume_state, upload_attempt_started_at, revision
  FROM sighting_drafts WHERE id = ?`;
export const MEDIA_JOURNAL_SAVE_SQL = `UPDATE sighting_drafts SET
  media_id = ?,
  reviewed_media_ref = ?,
  encryption_version = ?,
  review_receipt_json = ?,
  upload_state = ?,
  upload_attempts = ?,
  next_attempt_at = ?,
  last_error = ?,
  upload_resume_state = ?,
  upload_attempt_started_at = ?,
  revision = revision + 1
  WHERE id = ? AND (
    (media_id IS NULL AND reviewed_media_ref IS NULL AND encryption_version IS NULL
      AND review_receipt_json IS NULL AND upload_state IS NULL)
    OR
    (upload_state = 'local_persisting' AND media_id = ? AND reviewed_media_ref = ?
      AND encryption_version = ? AND review_receipt_json = ?)
    OR
    (sighting_id IS NULL AND upload_attempts = 0
      AND upload_state IN ('local_persisting', 'upload_pending', 'needs_user')
      AND upload_resume_state IS NULL AND upload_attempt_started_at IS NULL
      AND next_attempt_at IS NULL)
  )`;
export const MEDIA_VERSION_MISMATCH_SQL = `UPDATE sighting_drafts SET
  upload_state = 'needs_user',
  next_attempt_at = NULL,
  last_error = 'version_mismatch',
  upload_resume_state = NULL,
  upload_attempt_started_at = NULL,
  revision = revision + 1
  WHERE id = ? AND reviewed_media_ref IS NOT NULL
    AND (encryption_version IS NULL OR encryption_version <> 'aes-256-gcm.v1')`;
export const MEDIA_UPLOAD_CAS_SQL = `UPDATE sighting_drafts SET
  upload_state = ?,
  upload_attempts = ?,
  next_attempt_at = ?,
  last_error = ?,
  upload_resume_state = ?,
  upload_attempt_started_at = ?,
  revision = revision + 1
  WHERE id = ? AND revision = ? AND upload_state = ?
    AND upload_state IN ('upload_pending', 'uploading', 'finalizing', 'waiting')`;
export const ATTACH_SIGHTING_TO_DRAFT_SQL = `UPDATE sighting_drafts SET
  sighting_id = ?,
  revision = revision + 1,
  updated_at = ?
  WHERE id = ? AND sighting_id IS NULL`;
export const QUARANTINED_MEDIA_CLEANUP_SQL = `DELETE FROM sighting_drafts
  WHERE id = ? AND revision = ? AND upload_state = 'quarantined'`;
const ENSURE_DRAFT_ROW_SQL = `INSERT OR IGNORE INTO sighting_drafts
  (id, notes, risk, updated_at) VALUES (?, '', 'normal', ?)`;

type DraftRow = {
  id: string;
  notes: string;
  risk: StoredDraft['risk'];
  media_id: string | null;
  sighting_id: string | null;
  reviewed_media_ref: string | null;
  encryption_version: string | null;
  review_receipt_json: string | null;
  upload_state: string | null;
  upload_attempts: number | null;
  next_attempt_at: string | null;
  last_error: string | null;
  upload_resume_state: string | null;
  upload_attempt_started_at: string | null;
  revision: number;
};

const SCHEMA_V2_COLUMNS = {
  media_id: 'TEXT',
  sighting_id: 'TEXT',
  reviewed_media_ref: 'TEXT',
  encryption_version: 'TEXT',
  review_receipt_json: 'TEXT',
  upload_state: 'TEXT',
  upload_attempts: 'INTEGER',
  next_attempt_at: 'TEXT',
  last_error: 'TEXT',
  upload_resume_state: 'TEXT',
  upload_attempt_started_at: 'TEXT',
  revision: 'INTEGER NOT NULL DEFAULT 0',
} as const;

export type DraftTransportSchemaDependencies = Readonly<{
  listColumns(): Promise<readonly string[]>;
  addColumn(name: keyof typeof SCHEMA_V2_COLUMNS, type: string): Promise<void>;
  backfillEncryptionVersion(): Promise<void>;
  clearLegacyReviewedPath(): Promise<void>;
}>;

export async function ensureDraftTransportSchemaWithDependencies(
  dependencies: DraftTransportSchemaDependencies,
): Promise<void> {
  const existing = new Set(await dependencies.listColumns());
  for (const [name, type] of Object.entries(SCHEMA_V2_COLUMNS) as Array<
    [keyof typeof SCHEMA_V2_COLUMNS, string]
  >) {
    if (!existing.has(name)) await dependencies.addColumn(name, type);
  }
  await dependencies.backfillEncryptionVersion();
  if (existing.has('reviewed_media_path')) await dependencies.clearLegacyReviewedPath();
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getDatabaseKey() {
  const available = await SecureStore.isAvailableAsync();
  if (!available) throw new Error('secure_offline_storage_unavailable');

  const current = await SecureStore.getItemAsync(DATABASE_KEY_NAME);
  if (current) return current;

  const created = bytesToHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(DATABASE_KEY_NAME, created, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return created;
}

async function openDraftDatabase() {
  if (Platform.OS === 'web') throw new Error('secure_offline_storage_unavailable');

  const key = await getDatabaseKey();
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await database.execAsync(`PRAGMA key = "x'${key}'";`);
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sighting_drafts (
      id TEXT PRIMARY KEY NOT NULL,
      photo_uri TEXT,
      notes TEXT NOT NULL,
      risk TEXT NOT NULL CHECK (risk IN ('normal', 'sensitive', 'critical')),
      media_id TEXT,
      sighting_id TEXT,
      reviewed_media_ref TEXT,
      encryption_version TEXT,
      review_receipt_json TEXT,
      upload_state TEXT,
      upload_attempts INTEGER,
      next_attempt_at TEXT,
      last_error TEXT,
      upload_resume_state TEXT,
      upload_attempt_started_at TEXT,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    -- Clear any selected source URI left by the legacy schema before use.
    ${LEGACY_URI_CLEAR_SQL}
  `);
  await ensureDraftTransportSchemaWithDependencies({
    listColumns: async () => (await database.getAllAsync<{ name: string }>('PRAGMA table_info(sighting_drafts)'))
      .map(({ name }) => name),
    addColumn: async (name, type) => {
      await database.execAsync(`ALTER TABLE sighting_drafts ADD COLUMN ${name} ${type};`);
    },
    backfillEncryptionVersion: async () => { await database.execAsync(ENCRYPTION_VERSION_BACKFILL_SQL); },
    clearLegacyReviewedPath: async () => { await database.execAsync(LEGACY_REVIEWED_PATH_CLEAR_SQL); },
  });
  return database;
}

async function getDatabase() {
  databasePromise ??= openDraftDatabase();
  return databasePromise;
}

export async function saveOfflineDraft(input: Record<string, unknown>) {
  const draft = sanitizeDraftForStorage(input);
  const database = await getDatabase();
  await database.runAsync(
    DRAFT_SAVE_SQL,
    draft.id,
    draft.notes,
    draft.risk,
    draft.mediaId ?? null,
    draft.sightingId ?? null,
    draft.encryptedReviewedRef ?? null,
    draft.encryptionVersion ?? null,
    draft.receipt ? JSON.stringify(draft.receipt) : null,
    draft.uploadJob?.state ?? null,
    draft.uploadJob?.attempts ?? null,
    draft.uploadJob?.nextAttemptAt ?? null,
    draft.uploadJob?.lastError ?? null,
    draft.uploadJob?.resumeState ?? null,
    draft.uploadJob?.attemptStartedAt ?? null,
    new Date().toISOString(),
  );
  return draft;
}

export type ReviewedMediaJournalState = 'local_persisting' | 'upload_pending' | 'needs_user';
export type ReviewedMediaJournalError = 'local_media_missing' | 'local_media_corrupt' | 'version_mismatch' | null;
export type ReviewedMediaJournalSnapshot = Readonly<{
  draftId: string;
  mediaId: string;
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  receipt: ReviewedMediaJournal['receipt'];
  uploadJob: Readonly<{
    state: ReviewedMediaJournalState;
    attempts: 0;
    nextAttemptAt: null;
    lastError: ReviewedMediaJournalError;
    resumeState: null;
    attemptStartedAt: null;
  }>;
}>;
export type SaveReviewedMediaJournalDependencies = Readonly<{
  commitMediaSnapshot(snapshot: ReviewedMediaJournalSnapshot): Promise<string | null>;
}>;

export async function saveReviewedMediaJournalWithDependencies(
  journal: ReviewedMediaJournal,
  state: ReviewedMediaJournalState,
  error: ReviewedMediaJournalError,
  dependencies: SaveReviewedMediaJournalDependencies,
): Promise<string | null> {
  const validated = sanitizeDraftForStorage({
    id: journal.draftId,
    mediaId: journal.mediaId,
    encryptedReviewedRef: journal.encryptedReviewedRef,
    encryptionVersion: journal.encryptionVersion,
    receipt: journal.receipt,
    uploadJob: {
      state, attempts: 0, nextAttemptAt: null, lastError: error,
      resumeState: null, attemptStartedAt: null,
    },
  });
  if (!validated.mediaId || !validated.encryptedReviewedRef || validated.encryptionVersion !== 'aes-256-gcm.v1' ||
      !validated.receipt || !validated.uploadJob) {
    throw new Error('invalid_reviewed_media_journal');
  }
  const snapshot: ReviewedMediaJournalSnapshot = {
    draftId: validated.id,
    mediaId: validated.mediaId,
    encryptedReviewedRef: validated.encryptedReviewedRef,
    encryptionVersion: validated.encryptionVersion,
    receipt: validated.receipt,
    uploadJob: {
      state,
      attempts: 0,
      nextAttemptAt: null,
      lastError: error,
      resumeState: null,
      attemptStartedAt: null,
    },
  };
  const previous = await dependencies.commitMediaSnapshot(snapshot);
  return previous !== snapshot.encryptedReviewedRef && isReviewedMediaReference(previous) ? previous : null;
}

export async function saveReviewedMediaJournal(
  journal: ReviewedMediaJournal,
  state: ReviewedMediaJournalState,
  error: ReviewedMediaJournalError,
): Promise<string | null> {
  const database = await getDatabase();
  return saveReviewedMediaJournalWithDependencies(journal, state, error, {
    commitMediaSnapshot: async (snapshot) => {
      let previous: string | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const current = await transaction.getFirstAsync<{ reviewed_media_ref: string | null }>(
          'SELECT reviewed_media_ref FROM sighting_drafts WHERE id = ?', snapshot.draftId,
        );
        previous = current?.reviewed_media_ref ?? null;
        await transaction.runAsync(ENSURE_DRAFT_ROW_SQL, snapshot.draftId, new Date().toISOString());
        const result = await transaction.runAsync(
          MEDIA_JOURNAL_SAVE_SQL,
          snapshot.mediaId,
          snapshot.encryptedReviewedRef,
          snapshot.encryptionVersion,
          JSON.stringify(snapshot.receipt),
          snapshot.uploadJob.state,
          snapshot.uploadJob.attempts,
          snapshot.uploadJob.nextAttemptAt,
          snapshot.uploadJob.lastError,
          snapshot.uploadJob.resumeState,
          snapshot.uploadJob.attemptStartedAt,
          snapshot.draftId,
          snapshot.mediaId,
          snapshot.encryptedReviewedRef,
          snapshot.encryptionVersion,
          JSON.stringify(snapshot.receipt),
        );
        if (result.changes !== 1) throw new Error('missing_durable_media_journal');
      });
      return previous;
    },
  });
}

export async function listOfflineDrafts(): Promise<StoredDraft[]> {
  const database = await getDatabase();
  return deserializeDraftRows(await database.getAllAsync<DraftRow>(DRAFT_LIST_SQL));
}

export async function markReviewedMediaVersionMismatch(id: string): Promise<void> {
  const validated = sanitizeDraftForStorage({ id });
  const database = await getDatabase();
  const result = await database.runAsync(MEDIA_VERSION_MISMATCH_SQL, validated.id);
  if (result.changes !== 1) throw new Error('missing_version_mismatched_media_journal');
}

export type MediaUploadClaim = Readonly<{
  draftId: string;
  mediaId: string;
  sightingId: string;
  encryptedReviewedRef: string;
  encryptionVersion: 'aes-256-gcm.v1';
  receipt: NonNullable<StoredDraft['receipt']>;
  uploadJob: UploadJob & Readonly<{ state: UploadResumeState }>;
  revision: number;
  recovering: boolean;
  recoveryOnly: boolean;
}>;

export type MediaUploadCasDependencies = Readonly<{
  getOfflineDraft(id: string): Promise<StoredDraft | null>;
  compareAndSwapUploadJob(
    id: string,
    expectedRevision: number,
    expectedState: UploadJobState,
    next: UploadJob,
  ): Promise<boolean>;
}>;

function claimableMedia(draft: StoredDraft): draft is StoredDraft & Required<Pick<
  StoredDraft,
  'mediaId' | 'sightingId' | 'encryptedReviewedRef' | 'encryptionVersion' | 'receipt' | 'uploadJob' | 'revision'
>> & Readonly<{ encryptionVersion: 'aes-256-gcm.v1' }> {
  return isStableMediaId(draft.mediaId) && isStableMediaId(draft.sightingId) &&
    isReviewedMediaReference(draft.encryptedReviewedRef, draft.mediaId) &&
    draft.encryptionVersion === 'aes-256-gcm.v1' && !!draft.receipt && !!draft.uploadJob &&
    Number.isInteger(draft.revision) && draft.revision! >= 0 && !draft.mediaFailure;
}

function claimedJob(
  current: UploadJob,
  now: Date,
  leaseMs: number,
): {
  job: UploadJob & Readonly<{ state: UploadResumeState }>;
  recovering: boolean;
  recoveryOnly: boolean;
} | null {
  if (current.attempts > 5) return null;
  const recoveryOnly = current.attempts === 5;
  if (recoveryOnly && current.state !== 'uploading' && current.state !== 'finalizing') return null;
  let state: UploadResumeState;
  let recovering = true;
  if (current.state === 'upload_pending') {
    state = 'uploading';
    recovering = false;
  } else if (current.state === 'waiting') {
    const due = current.nextAttemptAt === null ? Number.NaN : Date.parse(current.nextAttemptAt);
    if (!current.resumeState || !Number.isFinite(due) || due > now.getTime()) return null;
    state = current.resumeState;
  } else if (current.state === 'uploading' || current.state === 'finalizing') {
    const started = typeof current.attemptStartedAt === 'string'
      ? Date.parse(current.attemptStartedAt)
      : Number.NaN;
    if (!Number.isFinite(started) || started + leaseMs > now.getTime()) return null;
    state = current.state;
  } else {
    return null;
  }
  return {
    recovering,
    recoveryOnly,
    job: {
      state,
      attempts: recoveryOnly ? current.attempts : current.attempts + 1,
      nextAttemptAt: null,
      lastError: null,
      resumeState: null,
      attemptStartedAt: now.toISOString(),
    },
  };
}

export async function claimMediaUploadAttemptWithDependencies(
  id: string,
  now: Date,
  leaseMs: number,
  dependencies: MediaUploadCasDependencies,
): Promise<MediaUploadClaim | null> {
  if (!isStableMediaId(id) || !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isFinite(leaseMs) || leaseMs <= 0 || leaseMs > 24 * 60 * 60 * 1000) {
    throw new Error('invalid_media_upload_claim');
  }
  const current = await dependencies.getOfflineDraft(id);
  if (!current || !claimableMedia(current)) return null;
  const claimed = claimedJob(current.uploadJob, now, leaseMs);
  if (!claimed) return null;
  const won = await dependencies.compareAndSwapUploadJob(
    id, current.revision, current.uploadJob.state, claimed.job,
  );
  if (!won) return null;
  return {
    draftId: current.id,
    mediaId: current.mediaId,
    sightingId: current.sightingId,
    encryptedReviewedRef: current.encryptedReviewedRef,
    encryptionVersion: current.encryptionVersion,
    receipt: current.receipt,
    uploadJob: claimed.job,
    revision: current.revision + 1,
    recovering: claimed.recovering,
    recoveryOnly: claimed.recoveryOnly,
  };
}

function validTransition(current: UploadJob, next: UploadJob): boolean {
  if (next.attempts !== current.attempts) return false;
  if (current.state === 'uploading') {
    if (next.state === 'finalizing') {
      return next.attemptStartedAt === current.attemptStartedAt && next.resumeState === null &&
        next.nextAttemptAt === null && next.lastError === null;
    }
    if (next.state === 'waiting') return next.resumeState === 'uploading';
    return next.state === 'needs_user';
  }
  if (current.state === 'finalizing') {
    if (next.state === 'waiting') return next.resumeState === 'finalizing';
    return next.state === 'needs_user' || next.state === 'quarantined';
  }
  return false;
}

export async function transitionClaimedMediaUploadWithDependencies(
  id: string,
  expectedRevision: number,
  next: UploadJob,
  dependencies: MediaUploadCasDependencies,
): Promise<boolean> {
  if (!isStableMediaId(id) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return false;
  const current = await dependencies.getOfflineDraft(id);
  if (!current || current.revision !== expectedRevision || !current.uploadJob ||
      !validTransition(current.uploadJob, next)) return false;
  try {
    const normalized = sanitizeDraftForStorage({ ...current, uploadJob: next }).uploadJob;
    if (!normalized || normalized.state !== next.state || normalized.attempts !== next.attempts ||
        normalized.nextAttemptAt !== next.nextAttemptAt || normalized.lastError !== next.lastError ||
        normalized.resumeState !== next.resumeState || normalized.attemptStartedAt !== next.attemptStartedAt) {
      return false;
    }
  } catch {
    return false;
  }
  return dependencies.compareAndSwapUploadJob(id, expectedRevision, current.uploadJob.state, next);
}

function databaseCasDependencies(database: SQLite.SQLiteDatabase): MediaUploadCasDependencies {
  return {
    getOfflineDraft: async (id) => {
      const row = await database.getFirstAsync<DraftRow>(DRAFT_GET_SQL, id);
      return row ? deserializeDraftRows([row])[0] ?? null : null;
    },
    compareAndSwapUploadJob: async (id, expectedRevision, expectedState, next) => {
      const result = await database.runAsync(
        MEDIA_UPLOAD_CAS_SQL,
        next.state,
        next.attempts,
        next.nextAttemptAt,
        next.lastError,
        next.resumeState ?? null,
        next.attemptStartedAt ?? null,
        id,
        expectedRevision,
        expectedState,
      );
      return result.changes === 1;
    },
  };
}

export async function getOfflineDraft(id: string): Promise<StoredDraft | null> {
  if (!isStableMediaId(id)) throw new Error('invalid_draft_id');
  const database = await getDatabase();
  return databaseCasDependencies(database).getOfflineDraft(id);
}

export type AttachSightingToDraftDependencies = Readonly<{
  getOfflineDraft(id: string): Promise<StoredDraft | null>;
  attachSightingId(id: string, sightingId: string): Promise<boolean>;
}>;

/**
 * The sighting identifier is append-only. This is deliberately narrower than a
 * generic draft save so a retry cannot replace a media tuple or CAS state.
 */
export async function attachSightingToDraftWithDependencies(
  id: string,
  sightingId: string,
  dependencies: AttachSightingToDraftDependencies,
): Promise<boolean> {
  if (!isStableMediaId(id) || !isStableMediaId(sightingId)) return false;
  const current = await dependencies.getOfflineDraft(id);
  if (!current) return false;
  if (current.sightingId !== undefined) return current.sightingId === sightingId;
  if (await dependencies.attachSightingId(id, sightingId)) return true;
  const after = await dependencies.getOfflineDraft(id);
  return after?.sightingId === sightingId;
}

export async function attachSightingToDraft(id: string, sightingId: string): Promise<boolean> {
  const database = await getDatabase();
  return attachSightingToDraftWithDependencies(id, sightingId, {
    getOfflineDraft: async (draftId) => databaseCasDependencies(database).getOfflineDraft(draftId),
    attachSightingId: async (draftId, attachedSightingId) => {
      const result = await database.runAsync(
        ATTACH_SIGHTING_TO_DRAFT_SQL,
        attachedSightingId,
        new Date().toISOString(),
        draftId,
      );
      return result.changes === 1;
    },
  });
}

export type CleanupQuarantinedMediaDependencies = Readonly<{
  deleteQuarantinedMedia(id: string, revision: number): Promise<boolean>;
}>;

/** Called only after Task 4 has CAS-persisted the quarantined terminal state and removed ciphertext. */
export async function cleanupQuarantinedMediaWithDependencies(
  id: string,
  revision: number,
  dependencies: CleanupQuarantinedMediaDependencies,
): Promise<void> {
  if (!isStableMediaId(id) || !Number.isInteger(revision) || revision < 0) {
    throw new Error('invalid_quarantined_media_cleanup');
  }
  if (!await dependencies.deleteQuarantinedMedia(id, revision)) {
    throw new Error('quarantined_media_cleanup_conflict');
  }
}

export async function cleanupQuarantinedMedia(id: string, revision: number): Promise<void> {
  const database = await getDatabase();
  return cleanupQuarantinedMediaWithDependencies(id, revision, {
    deleteQuarantinedMedia: async (draftId, expectedRevision) => {
      const result = await database.runAsync(QUARANTINED_MEDIA_CLEANUP_SQL, draftId, expectedRevision);
      return result.changes === 1;
    },
  });
}

export async function claimMediaUploadAttempt(
  id: string,
  now: Date,
  leaseMs: number,
): Promise<MediaUploadClaim | null> {
  const database = await getDatabase();
  return claimMediaUploadAttemptWithDependencies(id, now, leaseMs, databaseCasDependencies(database));
}

export async function transitionClaimedMediaUpload(
  id: string,
  expectedRevision: number,
  next: UploadJob,
): Promise<boolean> {
  const database = await getDatabase();
  return transitionClaimedMediaUploadWithDependencies(
    id, expectedRevision, next, databaseCasDependencies(database),
  );
}

export function deserializeDraftRows(rows: readonly DraftRow[]): StoredDraft[] {
  const drafts: StoredDraft[] = [];
  for (const row of rows) {
    let textOnly: StoredDraft;
    try {
      textOnly = {
        ...sanitizeDraftForStorage({ id: row.id, notes: row.notes, risk: row.risk }),
        revision: Number.isInteger(row.revision) && row.revision >= 0 ? row.revision : 0,
      };
    } catch {
      continue;
    }
    const hasMediaTuple = row.media_id !== null || row.reviewed_media_ref !== null ||
      row.review_receipt_json !== null || row.encryption_version !== null;
    const hasUploadWorkflow = row.upload_state !== null || row.upload_attempts !== null ||
      row.next_attempt_at !== null || row.last_error !== null || row.upload_resume_state !== null ||
      row.upload_attempt_started_at !== null;
    if (!hasMediaTuple && !hasUploadWorkflow && row.sighting_id === null) {
      drafts.push(textOnly);
      continue;
    }
    if (!hasMediaTuple && !hasUploadWorkflow && row.sighting_id && isStableMediaId(row.sighting_id)) {
      drafts.push({ ...textOnly, sightingId: row.sighting_id });
      continue;
    }
    try {
      const otherwiseValid = sanitizeDraftForStorage({
        id: row.id,
        notes: row.notes,
        risk: row.risk,
        mediaId: row.media_id,
        sightingId: row.sighting_id ?? undefined,
        encryptedReviewedRef: row.reviewed_media_ref,
        encryptionVersion: 'aes-256-gcm.v1',
        receipt: JSON.parse(row.review_receipt_json ?? ''),
        uploadJob: {
          state: row.upload_state,
          attempts: row.upload_attempts,
          nextAttemptAt: row.next_attempt_at,
          lastError: row.last_error,
          resumeState: row.upload_resume_state,
          attemptStartedAt: row.upload_attempt_started_at,
        },
      });
      if (row.encryption_version === 'aes-256-gcm.v1') {
        drafts.push({ ...otherwiseValid, revision: textOnly.revision });
      } else {
        drafts.push({
          ...otherwiseValid,
          revision: textOnly.revision,
          encryptionVersion: UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION,
          mediaFailure: 'version_mismatch',
          uploadJob: failedMediaJob(row.upload_attempts, 'version_mismatch'),
        });
      }
    } catch {
      const safeMediaId = isStableMediaId(row.media_id) ? row.media_id : undefined;
      const safeReference = safeMediaId && isReviewedMediaReference(row.reviewed_media_ref, safeMediaId)
        ? row.reviewed_media_ref
        : undefined;
      drafts.push({
        ...textOnly,
        ...(safeMediaId ? { mediaId: safeMediaId } : {}),
        ...(safeReference ? { encryptedReviewedRef: safeReference } : {}),
        ...(isStableMediaId(row.sighting_id) ? { sightingId: row.sighting_id } : {}),
        ...(safeReference && row.encryption_version === 'aes-256-gcm.v1'
          ? { encryptionVersion: 'aes-256-gcm.v1' as const }
          : {}),
        mediaFailure: 'local_media_corrupt',
        uploadJob: failedMediaJob(row.upload_attempts, 'local_media_corrupt'),
      });
    }
  }
  return drafts;
}

function failedMediaJob(
  attempts: number | null,
  lastError: 'local_media_corrupt' | 'version_mismatch',
): UploadJob {
  return {
    state: 'needs_user',
    attempts: Number.isInteger(attempts) && attempts! >= 0 && attempts! <= 5 ? attempts! : 0,
    nextAttemptAt: null,
    lastError,
    resumeState: null,
    attemptStartedAt: null,
  };
}

export type DeleteDraftDependencies = Readonly<{
  loadReviewedReference(id: string): Promise<string | null>;
  deleteRow(id: string): Promise<void>;
  deleteOwnedReference(reference: string): Promise<void>;
}>;

export async function deleteOfflineDraftWithDependencies(id: string, dependencies: DeleteDraftDependencies): Promise<void> {
  const reference = await dependencies.loadReviewedReference(id);
  await dependencies.deleteRow(id);
  if (isReviewedMediaReference(reference)) await dependencies.deleteOwnedReference(reference);
}

export async function deleteOfflineDraft(id: string) {
  const database = await getDatabase();
  await deleteOfflineDraftWithDependencies(id, {
    loadReviewedReference: async (draftId) => {
      const row = await database.getFirstAsync<{ reviewed_media_ref: string | null }>(
        'SELECT reviewed_media_ref FROM sighting_drafts WHERE id = ?', draftId,
      );
      return row?.reviewed_media_ref ?? null;
    },
    deleteRow: async (draftId) => { await database.runAsync('DELETE FROM sighting_drafts WHERE id = ?', draftId); },
    deleteOwnedReference: async (reference) => { await deleteReviewedMediaReference(reference).catch(() => undefined); },
  });
}
