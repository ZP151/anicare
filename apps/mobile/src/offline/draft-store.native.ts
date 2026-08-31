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
import { sanitizeReportDraftPayload } from '../report/report-draft';
import {
  createRetryableSingleFlight,
  loadOrCreateDatabaseKey,
  openEncryptedDatabaseWithDependencies,
} from './draft-database-initialization';
import type { UploadJob, UploadJobState, UploadResumeState } from './upload-job';

const DATABASE_KEY_NAME = 'animalhelper.offline-drafts.v1';
const DATABASE_NAME = 'animalhelper-drafts.db';

export const LEGACY_URI_CLEAR_SQL = 'UPDATE sighting_drafts SET photo_uri = NULL;';
export const LEGACY_REVIEWED_PATH_CLEAR_SQL = 'UPDATE sighting_drafts SET reviewed_media_path = NULL;';
export const ENCRYPTION_VERSION_BACKFILL_SQL = `UPDATE sighting_drafts
  SET encryption_version = 'aes-256-gcm.v1'
  WHERE reviewed_media_ref IS NOT NULL AND encryption_version IS NULL;`;
export const REPORT_PAYLOAD_COLUMN = { report_payload_json: 'TEXT' } as const;
export const DRAFT_SAVE_SQL = `INSERT INTO sighting_drafts
     (id, notes, risk, media_id, sighting_id, owner_subject, reviewed_media_ref, encryption_version,
      review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error,
      upload_resume_state, upload_attempt_started_at, report_payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       notes = excluded.notes,
       risk = excluded.risk,
       media_id = COALESCE(sighting_drafts.media_id, excluded.media_id),
       sighting_id = COALESCE(sighting_drafts.sighting_id, excluded.sighting_id),
       owner_subject = COALESCE(sighting_drafts.owner_subject, excluded.owner_subject),
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
       report_payload_json = COALESCE(excluded.report_payload_json, sighting_drafts.report_payload_json),
       revision = sighting_drafts.revision + 1,
       updated_at = excluded.updated_at`;
export const DRAFT_LIST_SQL = `SELECT id, notes, risk, media_id, sighting_id, owner_subject, reviewed_media_ref,
  encryption_version, review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error,
  upload_resume_state, upload_attempt_started_at, report_payload_json, pending_media_cleanup_ref, revision
  FROM sighting_drafts ORDER BY updated_at DESC`;
export const DRAFT_GET_SQL = `SELECT id, notes, risk, media_id, sighting_id, owner_subject, reviewed_media_ref,
  encryption_version, review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error,
  upload_resume_state, upload_attempt_started_at, report_payload_json, pending_media_cleanup_ref, revision
  FROM sighting_drafts WHERE id = ?`;
export const MEDIA_JOURNAL_SAVE_SQL = `UPDATE sighting_drafts SET
  media_id = ?,
  owner_subject = COALESCE(owner_subject, ?),
  reviewed_media_ref = ?,
  encryption_version = ?,
  review_receipt_json = ?,
  upload_state = ?,
  upload_attempts = ?,
  next_attempt_at = ?,
  last_error = ?,
  upload_resume_state = ?,
  upload_attempt_started_at = ?,
  pending_media_cleanup_ref = CASE
    WHEN reviewed_media_ref IS NOT NULL AND reviewed_media_ref <> ? THEN reviewed_media_ref
    ELSE pending_media_cleanup_ref END,
  revision = revision + 1
  WHERE id = ? AND (owner_subject = ? OR (owner_subject IS NULL AND media_id IS NULL AND reviewed_media_ref IS NULL))
    AND (pending_media_cleanup_ref IS NULL OR reviewed_media_ref = ?) AND (
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
  WHERE id = ? AND revision = ? AND upload_state = ? AND reviewed_media_ref IS NOT NULL
    AND (encryption_version IS NULL OR encryption_version <> 'aes-256-gcm.v1')`;
export const MEDIA_UPLOAD_CAS_SQL = `UPDATE sighting_drafts SET
  upload_state = ?,
  upload_attempts = ?,
  next_attempt_at = ?,
  last_error = ?,
  upload_resume_state = ?,
  upload_attempt_started_at = ?,
  revision = revision + 1
  WHERE id = ? AND revision = ? AND upload_state = ? AND owner_subject = ?
    AND pending_media_cleanup_ref IS NULL
    AND upload_state IN ('upload_pending', 'uploading', 'finalizing', 'waiting')`;
export const ATTACH_SIGHTING_TO_DRAFT_SQL = `UPDATE sighting_drafts SET
  sighting_id = ?,
  owner_subject = ?,
  revision = revision + 1,
  updated_at = ?
  WHERE id = ? AND (
    (sighting_id IS NULL AND (owner_subject = ? OR
      (owner_subject IS NULL AND media_id IS NULL AND reviewed_media_ref IS NULL)))
    OR (sighting_id = ? AND owner_subject = ?)
  )`;
export const QUARANTINED_MEDIA_CLEANUP_SQL = `DELETE FROM sighting_drafts
  WHERE id = ? AND revision = ? AND upload_state = 'quarantined'`;
export const PENDING_MEDIA_CLEANUP_LIST_SQL = `SELECT id, reviewed_media_ref,
  pending_media_cleanup_ref, revision FROM sighting_drafts
  WHERE pending_media_cleanup_ref IS NOT NULL ORDER BY updated_at ASC`;
export const CLEAR_PENDING_MEDIA_CLEANUP_SQL = `UPDATE sighting_drafts SET
  pending_media_cleanup_ref = NULL,
  revision = revision + 1
  WHERE id = ? AND revision = ? AND (reviewed_media_ref = ? OR (reviewed_media_ref IS NULL AND ? IS NULL))
    AND pending_media_cleanup_ref = ?`;
export const REMOVE_REVIEWED_MEDIA_CAS_SQL = `UPDATE sighting_drafts SET
  pending_media_cleanup_ref = reviewed_media_ref,
  media_id = NULL,
  reviewed_media_ref = NULL,
  encryption_version = NULL,
  review_receipt_json = NULL,
  upload_state = NULL,
  upload_attempts = NULL,
  next_attempt_at = NULL,
  last_error = NULL,
  upload_resume_state = NULL,
  upload_attempt_started_at = NULL,
  revision = revision + 1
  WHERE id = ? AND revision = ? AND sighting_id IS NULL AND pending_media_cleanup_ref IS NULL
    AND media_id = ? AND reviewed_media_ref = ? AND upload_state = ?
    AND upload_state IN ('local_persisting', 'upload_pending', 'needs_user')`;
const ENSURE_DRAFT_ROW_SQL = `INSERT OR IGNORE INTO sighting_drafts
  (id, notes, risk, updated_at) VALUES (?, '', 'normal', ?)`;

type DraftRow = {
  id: string;
  notes: string;
  risk: StoredDraft['risk'];
  media_id: string | null;
  sighting_id: string | null;
  owner_subject?: string | null;
  reviewed_media_ref: string | null;
  encryption_version: string | null;
  review_receipt_json: string | null;
  upload_state: string | null;
  upload_attempts: number | null;
  next_attempt_at: string | null;
  last_error: string | null;
  upload_resume_state: string | null;
  upload_attempt_started_at: string | null;
  report_payload_json?: string | null;
  pending_media_cleanup_ref?: string | null;
  revision: number;
};

type PendingReviewedMediaVersionMismatch = Readonly<{
  expectedRevision: number;
  expectedState: UploadJobState;
}>;

const pendingReviewedMediaVersionMismatches = new WeakMap<StoredDraft, PendingReviewedMediaVersionMismatch>();
const versionMismatchSourceStates = new Set<UploadJobState>([
  'local_persisting', 'upload_pending', 'uploading', 'finalizing', 'waiting',
  'needs_user', 'quarantined', 'complete',
]);

export function getPendingReviewedMediaVersionMismatch(
  draft: StoredDraft,
): PendingReviewedMediaVersionMismatch | undefined {
  return pendingReviewedMediaVersionMismatches.get(draft);
}

const SCHEMA_V2_COLUMNS = {
  ...REPORT_PAYLOAD_COLUMN,
  media_id: 'TEXT',
  sighting_id: 'TEXT',
  owner_subject: 'TEXT',
  reviewed_media_ref: 'TEXT',
  encryption_version: 'TEXT',
  review_receipt_json: 'TEXT',
  upload_state: 'TEXT',
  upload_attempts: 'INTEGER',
  next_attempt_at: 'TEXT',
  last_error: 'TEXT',
  upload_resume_state: 'TEXT',
  upload_attempt_started_at: 'TEXT',
  pending_media_cleanup_ref: 'TEXT',
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

async function initializeDraftDatabaseSchema(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sighting_drafts (
      id TEXT PRIMARY KEY NOT NULL,
      photo_uri TEXT,
      notes TEXT NOT NULL,
      risk TEXT NOT NULL CHECK (risk IN ('normal', 'sensitive', 'critical')),
      media_id TEXT,
      sighting_id TEXT,
      owner_subject TEXT,
      reviewed_media_ref TEXT,
      encryption_version TEXT,
      review_receipt_json TEXT,
      upload_state TEXT,
      upload_attempts INTEGER,
      next_attempt_at TEXT,
      last_error TEXT,
      upload_resume_state TEXT,
      upload_attempt_started_at TEXT,
      report_payload_json TEXT,
      pending_media_cleanup_ref TEXT,
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
}

async function openDraftDatabase() {
  return openEncryptedDatabaseWithDependencies({
    isNative: Platform.OS !== 'web',
    loadKey: () => loadOrCreateDatabaseKey({
      isAvailable: () => SecureStore.isAvailableAsync(),
      load: () => SecureStore.getItemAsync(DATABASE_KEY_NAME),
      store: async (created) => {
        await SecureStore.setItemAsync(DATABASE_KEY_NAME, created, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      },
      randomBytes: (length) => Crypto.getRandomBytes(length),
    }),
    openDatabase: () => SQLite.openDatabaseAsync(DATABASE_NAME),
    applyKey: async (database, key) => {
      await database.execAsync(`PRAGMA key = "x'${key}'";`);
    },
    initialize: initializeDraftDatabaseSchema,
    closeDatabase: (database) => database.closeAsync(),
  });
}

const getDatabase = createRetryableSingleFlight(openDraftDatabase);

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
    draft.ownerSubject ?? null,
    draft.encryptedReviewedRef ?? null,
    draft.encryptionVersion ?? null,
    draft.receipt ? JSON.stringify(draft.receipt) : null,
    draft.uploadJob?.state ?? null,
    draft.uploadJob?.attempts ?? null,
    draft.uploadJob?.nextAttemptAt ?? null,
    draft.uploadJob?.lastError ?? null,
    draft.uploadJob?.resumeState ?? null,
    draft.uploadJob?.attemptStartedAt ?? null,
    draft.report ? JSON.stringify(draft.report) : null,
    new Date().toISOString(),
  );
  return draft;
}

export type ReviewedMediaJournalState = 'local_persisting' | 'upload_pending' | 'needs_user';
export type ReviewedMediaJournalError = 'local_media_missing' | 'local_media_corrupt' | 'version_mismatch' | null;
export type ReviewedMediaJournalSnapshot = Readonly<{
  draftId: string;
  ownerSubject: string;
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
  commitMediaSnapshot(snapshot: ReviewedMediaJournalSnapshot): Promise<void>;
  cleanupPendingMedia(draftId: string): Promise<void>;
}>;

export async function saveReviewedMediaJournalWithDependencies(
  journal: ReviewedMediaJournal,
  state: ReviewedMediaJournalState,
  error: ReviewedMediaJournalError,
  ownerSubject: string,
  dependencies: SaveReviewedMediaJournalDependencies,
): Promise<void> {
  if (!isStableMediaId(ownerSubject)) throw new Error('authentication_required');
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
    ownerSubject,
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
  await dependencies.commitMediaSnapshot(snapshot);
  await dependencies.cleanupPendingMedia(snapshot.draftId).catch(() => undefined);
}

export function selectPendingCleanupForReplacement(
  activeReference: string | null,
  pendingReference: string | null,
  incomingReference: string,
): string | null {
  if (!isReviewedMediaReference(incomingReference)) throw new Error('invalid_reviewed_media_reference');
  if (pendingReference !== null) {
    if (!isReviewedMediaReference(pendingReference) || !isReviewedMediaReference(activeReference)) {
      throw new Error('invalid_pending_media_cleanup');
    }
    if (activeReference !== incomingReference) throw new Error('pending_media_cleanup_conflict');
    return pendingReference;
  }
  if (activeReference === null || activeReference === incomingReference) return null;
  if (!isReviewedMediaReference(activeReference)) throw new Error('invalid_pending_media_cleanup');
  return activeReference;
}

export async function saveReviewedMediaJournal(
  journal: ReviewedMediaJournal,
  state: ReviewedMediaJournalState,
  error: ReviewedMediaJournalError,
  ownerSubject: string,
): Promise<void> {
  const database = await getDatabase();
  return saveReviewedMediaJournalWithDependencies(journal, state, error, ownerSubject, {
    commitMediaSnapshot: async (snapshot) => {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const current = await transaction.getFirstAsync<{
          reviewed_media_ref: string | null;
          pending_media_cleanup_ref: string | null;
        }>(
          `SELECT reviewed_media_ref, pending_media_cleanup_ref
           FROM sighting_drafts WHERE id = ?`, snapshot.draftId,
        );
        selectPendingCleanupForReplacement(
          current?.reviewed_media_ref ?? null,
          current?.pending_media_cleanup_ref ?? null,
          snapshot.encryptedReviewedRef,
        );
        await transaction.runAsync(ENSURE_DRAFT_ROW_SQL, snapshot.draftId, new Date().toISOString());
        const result = await transaction.runAsync(
          MEDIA_JOURNAL_SAVE_SQL,
          snapshot.mediaId,
          snapshot.ownerSubject,
          snapshot.encryptedReviewedRef,
          snapshot.encryptionVersion,
          JSON.stringify(snapshot.receipt),
          snapshot.uploadJob.state,
          snapshot.uploadJob.attempts,
          snapshot.uploadJob.nextAttemptAt,
          snapshot.uploadJob.lastError,
          snapshot.uploadJob.resumeState,
          snapshot.uploadJob.attemptStartedAt,
          snapshot.encryptedReviewedRef,
          snapshot.draftId,
          snapshot.ownerSubject,
          snapshot.encryptedReviewedRef,
          snapshot.mediaId,
          snapshot.encryptedReviewedRef,
          snapshot.encryptionVersion,
          JSON.stringify(snapshot.receipt),
        );
        if (result.changes !== 1) throw new Error('missing_durable_media_journal');
      });
    },
    cleanupPendingMedia: cleanupPendingReviewedMediaForDraft,
  });
}

export type PendingReviewedMediaCleanup = Readonly<{
  draftId: string;
  activeReference: string | null;
  pendingReference: string;
  revision: number;
}>;

export type CleanupPendingReviewedMediaDependencies = Readonly<{
  listPendingCleanup(): Promise<readonly PendingReviewedMediaCleanup[]>;
  deleteOwnedReference(reference: string): Promise<void>;
  clearPendingCleanup(cleanup: PendingReviewedMediaCleanup): Promise<boolean>;
}>;

export async function cleanupPendingReviewedMediaReferencesWithDependencies(
  dependencies: CleanupPendingReviewedMediaDependencies,
): Promise<void> {
  for (const cleanup of await dependencies.listPendingCleanup()) {
    if (!isStableMediaId(cleanup.draftId) || !Number.isInteger(cleanup.revision) || cleanup.revision < 0 ||
        (cleanup.activeReference !== null && !isReviewedMediaReference(cleanup.activeReference)) ||
        !isReviewedMediaReference(cleanup.pendingReference) ||
        cleanup.activeReference === cleanup.pendingReference) {
      throw new Error('invalid_pending_media_cleanup');
    }
    await dependencies.deleteOwnedReference(cleanup.pendingReference);
    if (!await dependencies.clearPendingCleanup(cleanup)) {
      throw new Error('pending_media_cleanup_conflict');
    }
  }
}

function databasePendingCleanupDependencies(
  database: SQLite.SQLiteDatabase,
  draftId?: string,
): CleanupPendingReviewedMediaDependencies {
  return {
    listPendingCleanup: async () => {
      const rows = draftId
        ? await database.getAllAsync<DraftRow>(
            `${PENDING_MEDIA_CLEANUP_LIST_SQL.replace(' ORDER BY updated_at ASC', '')} AND id = ?`, draftId,
          )
        : await database.getAllAsync<DraftRow>(PENDING_MEDIA_CLEANUP_LIST_SQL);
      return rows.map((row) => ({
        draftId: row.id,
        activeReference: row.reviewed_media_ref ?? null,
        pendingReference: row.pending_media_cleanup_ref ?? '',
        revision: row.revision,
      }));
    },
    deleteOwnedReference: deleteReviewedMediaReference,
    clearPendingCleanup: async (cleanup) => {
      const result = await database.runAsync(
        CLEAR_PENDING_MEDIA_CLEANUP_SQL,
        cleanup.draftId,
        cleanup.revision,
        cleanup.activeReference,
        cleanup.activeReference,
        cleanup.pendingReference,
      );
      return result.changes === 1;
    },
  };
}

export async function cleanupPendingReviewedMediaForDraft(draftId: string): Promise<void> {
  const database = await getDatabase();
  await cleanupPendingReviewedMediaReferencesWithDependencies(
    databasePendingCleanupDependencies(database, draftId),
  );
}

export async function cleanupPendingReviewedMediaReferences(): Promise<void> {
  const database = await getDatabase();
  await cleanupPendingReviewedMediaReferencesWithDependencies(databasePendingCleanupDependencies(database));
}

export async function listOfflineDrafts(): Promise<StoredDraft[]> {
  const database = await getDatabase();
  return deserializeDraftRows(await database.getAllAsync<DraftRow>(DRAFT_LIST_SQL));
}

export async function markReviewedMediaVersionMismatch(
  id: string,
  expectedRevision: number,
  expectedState: UploadJobState,
): Promise<boolean> {
  const validated = sanitizeDraftForStorage({ id });
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 ||
      !versionMismatchSourceStates.has(expectedState)) return false;
  const database = await getDatabase();
  const result = await database.runAsync(
    MEDIA_VERSION_MISMATCH_SQL,
    validated.id,
    expectedRevision,
    expectedState,
  );
  return result.changes === 1;
}

export type MediaUploadClaim = Readonly<{
  draftId: string;
  mediaId: string;
  sightingId: string;
  ownerSubject: string;
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
    expectedOwnerSubject?: string,
  ): Promise<boolean>;
}>;

function claimableMedia(draft: StoredDraft): draft is StoredDraft & Required<Pick<
  StoredDraft,
  'mediaId' | 'sightingId' | 'ownerSubject' | 'encryptedReviewedRef' | 'encryptionVersion' | 'receipt' | 'uploadJob' | 'revision'
>> & Readonly<{ encryptionVersion: 'aes-256-gcm.v1' }> {
  return isStableMediaId(draft.mediaId) && isStableMediaId(draft.sightingId) && isStableMediaId(draft.ownerSubject) &&
    isReviewedMediaReference(draft.encryptedReviewedRef, draft.mediaId) && !draft.pendingMediaCleanupRef &&
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
  expectedOwnerSubject: string,
  dependencies: MediaUploadCasDependencies,
): Promise<MediaUploadClaim | null> {
  if (!isStableMediaId(id) || !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isFinite(leaseMs) || leaseMs <= 0 || leaseMs > 24 * 60 * 60 * 1000 || !isStableMediaId(expectedOwnerSubject)) {
    throw new Error('invalid_media_upload_claim');
  }
  const current = await dependencies.getOfflineDraft(id);
  if (!current || !claimableMedia(current) || current.ownerSubject !== expectedOwnerSubject) return null;
  const claimed = claimedJob(current.uploadJob, now, leaseMs);
  if (!claimed) return null;
  const won = await dependencies.compareAndSwapUploadJob(
    id, current.revision, current.uploadJob.state, claimed.job, current.ownerSubject,
  );
  if (!won) return null;
  return {
    draftId: current.id,
    mediaId: current.mediaId,
    sightingId: current.sightingId,
    ownerSubject: current.ownerSubject,
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
  if (!isStableMediaId(current.ownerSubject)) return false;
  return dependencies.compareAndSwapUploadJob(id, expectedRevision, current.uploadJob.state, next, current.ownerSubject);
}

function databaseCasDependencies(database: SQLite.SQLiteDatabase): MediaUploadCasDependencies {
  return {
    getOfflineDraft: async (id) => {
      const row = await database.getFirstAsync<DraftRow>(DRAFT_GET_SQL, id);
      return row ? deserializeDraftRows([row])[0] ?? null : null;
    },
    compareAndSwapUploadJob: async (id, expectedRevision, expectedState, next, expectedOwnerSubject) => {
      if (!isStableMediaId(expectedOwnerSubject)) return false;
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
        expectedOwnerSubject,
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

export type RemoveReviewedMediaFromDraftDependencies = Readonly<{
  getOfflineDraft(id: string): Promise<StoredDraft | null>;
  detachReviewedMedia(
    id: string,
    expectedRevision: number,
    expectedState: 'local_persisting' | 'upload_pending' | 'needs_user',
    expectedReference: string,
  ): Promise<boolean>;
  cleanupPendingMedia(id: string): Promise<void>;
}>;

function removableReviewedMedia(draft: StoredDraft): draft is StoredDraft & Required<Pick<
  StoredDraft, 'mediaId' | 'encryptedReviewedRef' | 'uploadJob' | 'revision'
>> & Readonly<{ uploadJob: UploadJob & { state: 'local_persisting' | 'upload_pending' | 'needs_user' } }> {
  return draft.sightingId === undefined && !draft.pendingMediaCleanupRef && isStableMediaId(draft.mediaId) &&
    isReviewedMediaReference(draft.encryptedReviewedRef, draft.mediaId) && !!draft.uploadJob &&
    (draft.uploadJob.state === 'local_persisting' || draft.uploadJob.state === 'upload_pending' || draft.uploadJob.state === 'needs_user') &&
    Number.isInteger(draft.revision) && (draft.revision ?? -1) >= 0;
}

export async function removeReviewedMediaFromDraftWithDependencies(
  id: string,
  dependencies: RemoveReviewedMediaFromDraftDependencies,
): Promise<void> {
  if (!isStableMediaId(id)) throw new Error('reviewed_media_removal_not_allowed');
  const current = await dependencies.getOfflineDraft(id);
  if (!current || !removableReviewedMedia(current)) throw new Error('reviewed_media_removal_not_allowed');
  if (!await dependencies.detachReviewedMedia(id, current.revision, current.uploadJob.state, current.encryptedReviewedRef)) {
    throw new Error('reviewed_media_removal_conflict');
  }
  await dependencies.cleanupPendingMedia(id);
}

export async function removeReviewedMediaFromDraft(id: string): Promise<void> {
  const database = await getDatabase();
  await removeReviewedMediaFromDraftWithDependencies(id, {
    getOfflineDraft: async (draftId) => databaseCasDependencies(database).getOfflineDraft(draftId),
    detachReviewedMedia: async (draftId, revision, state, reference) => {
      const current = await database.getFirstAsync<DraftRow>(DRAFT_GET_SQL, draftId);
      if (!current || current.media_id === null) return false;
      const result = await database.runAsync(
        REMOVE_REVIEWED_MEDIA_CAS_SQL, draftId, revision, current.media_id, reference, state,
      );
      return result.changes === 1;
    },
    cleanupPendingMedia: cleanupPendingReviewedMediaForDraft,
  });
}

export type AttachSightingToDraftDependencies = Readonly<{
  getOfflineDraft(id: string): Promise<StoredDraft | null>;
  attachSightingId(id: string, sightingId: string, ownerSubject: string): Promise<boolean>;
}>;

/**
 * The sighting identifier is append-only. This is deliberately narrower than a
 * generic draft save so a retry cannot replace a media tuple or CAS state.
 */
export async function attachSightingToDraftWithDependencies(
  id: string,
  sightingId: string,
  ownerSubject: string,
  dependencies: AttachSightingToDraftDependencies,
): Promise<boolean> {
  if (!isStableMediaId(id) || !isStableMediaId(sightingId) || !isStableMediaId(ownerSubject)) return false;
  const current = await dependencies.getOfflineDraft(id);
  if (!current) return false;
  if (current.ownerSubject !== undefined && current.ownerSubject !== ownerSubject) return false;
  if (current.mediaId !== undefined && current.ownerSubject !== ownerSubject) return false;
  if (current.sightingId !== undefined) return current.sightingId === sightingId && current.ownerSubject === ownerSubject;
  if (await dependencies.attachSightingId(id, sightingId, ownerSubject)) return true;
  const after = await dependencies.getOfflineDraft(id);
  return after?.sightingId === sightingId && after.ownerSubject === ownerSubject;
}

export async function attachSightingToDraft(id: string, sightingId: string, ownerSubject: string): Promise<boolean> {
  const database = await getDatabase();
  return attachSightingToDraftWithDependencies(id, sightingId, ownerSubject, {
    getOfflineDraft: async (draftId) => databaseCasDependencies(database).getOfflineDraft(draftId),
    attachSightingId: async (draftId, attachedSightingId, attachedOwnerSubject) => {
      const result = await database.runAsync(
        ATTACH_SIGHTING_TO_DRAFT_SQL,
        attachedSightingId,
        attachedOwnerSubject,
        new Date().toISOString(),
        draftId,
        attachedOwnerSubject,
        attachedSightingId,
        attachedOwnerSubject,
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
  expectedOwnerSubject: string,
): Promise<MediaUploadClaim | null> {
  const database = await getDatabase();
  return claimMediaUploadAttemptWithDependencies(id, now, leaseMs, expectedOwnerSubject, databaseCasDependencies(database));
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
    let report: StoredDraft['report'];
    if (typeof row.report_payload_json === 'string') {
      try {
        report = sanitizeReportDraftPayload(JSON.parse(row.report_payload_json));
      } catch {
        report = undefined;
      }
    }
    let textOnly: StoredDraft;
    try {
      textOnly = {
        ...sanitizeDraftForStorage({ id: row.id, notes: row.notes, risk: row.risk, ...(report ? { report } : {}) }),
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
      drafts.push({ ...textOnly, sightingId: row.sighting_id,
        ...(isStableMediaId(row.owner_subject) ? { ownerSubject: row.owner_subject } : {}) });
      continue;
    }
    try {
      const otherwiseValid = sanitizeDraftForStorage({
        id: row.id,
        notes: row.notes,
        risk: row.risk,
        mediaId: row.media_id,
        sightingId: row.sighting_id ?? undefined,
        ownerSubject: row.owner_subject ?? undefined,
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
      const pendingCleanup = row.pending_media_cleanup_ref === null || row.pending_media_cleanup_ref === undefined
        ? undefined
        : isReviewedMediaReference(row.pending_media_cleanup_ref) && row.pending_media_cleanup_ref !== row.reviewed_media_ref
          ? row.pending_media_cleanup_ref
          : null;
      if (pendingCleanup === null) {
        drafts.push({ ...otherwiseValid, revision: textOnly.revision, mediaFailure: 'local_media_corrupt',
          uploadJob: failedMediaJob(row.upload_attempts, 'local_media_corrupt') });
      } else if (!isStableMediaId(row.owner_subject)) {
        drafts.push({
          ...otherwiseValid,
          revision: textOnly.revision,
          mediaFailure: 'auth_ownership',
          uploadJob: failedMediaJob(row.upload_attempts, 'auth_ownership'),
        });
      } else if (row.encryption_version === 'aes-256-gcm.v1') {
        drafts.push({ ...otherwiseValid, revision: textOnly.revision,
          ...(pendingCleanup ? { pendingMediaCleanupRef: pendingCleanup } : {}) });
      } else {
        const versionMismatch: StoredDraft = {
          ...otherwiseValid,
          revision: textOnly.revision,
          encryptionVersion: UNSUPPORTED_REVIEWED_MEDIA_ENCRYPTION_VERSION,
          mediaFailure: 'version_mismatch',
          uploadJob: failedMediaJob(row.upload_attempts, 'version_mismatch'),
        };
        const durablyMarked = row.upload_state === 'needs_user' && row.last_error === 'version_mismatch' &&
          row.next_attempt_at === null && row.upload_resume_state === null &&
          row.upload_attempt_started_at === null;
        if (!durablyMarked) {
          pendingReviewedMediaVersionMismatches.set(versionMismatch, {
            expectedRevision: textOnly.revision ?? 0,
            expectedState: otherwiseValid.uploadJob!.state,
          });
        }
        drafts.push(versionMismatch);
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
  lastError: 'local_media_corrupt' | 'version_mismatch' | 'auth_ownership',
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
  loadReviewedReferences(id: string): Promise<Readonly<{ active: string | null; pending: string | null }>>;
  deleteRow(id: string): Promise<void>;
  deleteOwnedReference(reference: string): Promise<void>;
}>;

export async function deleteOfflineDraftWithDependencies(id: string, dependencies: DeleteDraftDependencies): Promise<void> {
  const references = await dependencies.loadReviewedReferences(id);
  await dependencies.deleteRow(id);
  const owned = [...new Set([references.active, references.pending].filter(
    (reference): reference is string => isReviewedMediaReference(reference),
  ))];
  for (const reference of owned) await dependencies.deleteOwnedReference(reference);
}

export async function deleteOfflineDraft(id: string) {
  const database = await getDatabase();
  await deleteOfflineDraftWithDependencies(id, {
    loadReviewedReferences: async (draftId) => {
      const row = await database.getFirstAsync<{
        reviewed_media_ref: string | null;
        pending_media_cleanup_ref: string | null;
      }>(
        `SELECT reviewed_media_ref, pending_media_cleanup_ref
         FROM sighting_drafts WHERE id = ?`, draftId,
      );
      return {
        active: row?.reviewed_media_ref ?? null,
        pending: row?.pending_media_cleanup_ref ?? null,
      };
    },
    deleteRow: async (draftId) => { await database.runAsync('DELETE FROM sighting_drafts WHERE id = ?', draftId); },
    deleteOwnedReference: async (reference) => { await deleteReviewedMediaReference(reference).catch(() => undefined); },
  });
}
