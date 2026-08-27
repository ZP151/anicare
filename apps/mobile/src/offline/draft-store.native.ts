import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { deleteReviewedMediaReference } from '../media/draft-media';
import { isReviewedMediaReference } from '../media/media-reference';
import type { ReviewedMediaJournal } from '../media/reviewed-draft';
import { sanitizeDraftForStorage, type StoredDraft } from './draft-policy';

const DATABASE_KEY_NAME = 'animalhelper.offline-drafts.v1';
const DATABASE_NAME = 'animalhelper-drafts.db';

export const LEGACY_URI_CLEAR_SQL = 'UPDATE sighting_drafts SET photo_uri = NULL;';
export const LEGACY_REVIEWED_PATH_CLEAR_SQL = 'UPDATE sighting_drafts SET reviewed_media_path = NULL;';
export const ENCRYPTION_VERSION_BACKFILL_SQL = `UPDATE sighting_drafts
  SET encryption_version = 'aes-256-gcm.v1'
  WHERE reviewed_media_ref IS NOT NULL AND encryption_version IS NULL;`;
export const DRAFT_SAVE_SQL = `INSERT INTO sighting_drafts
     (id, notes, risk, media_id, sighting_id, reviewed_media_ref, encryption_version,
      review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       notes = excluded.notes,
       risk = excluded.risk,
       media_id = COALESCE(excluded.media_id, sighting_drafts.media_id),
       sighting_id = COALESCE(excluded.sighting_id, sighting_drafts.sighting_id),
       reviewed_media_ref = COALESCE(excluded.reviewed_media_ref, sighting_drafts.reviewed_media_ref),
       encryption_version = COALESCE(excluded.encryption_version, sighting_drafts.encryption_version),
       review_receipt_json = COALESCE(excluded.review_receipt_json, sighting_drafts.review_receipt_json),
       upload_state = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.upload_state ELSE sighting_drafts.upload_state END,
       upload_attempts = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.upload_attempts ELSE sighting_drafts.upload_attempts END,
       next_attempt_at = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.next_attempt_at ELSE sighting_drafts.next_attempt_at END,
       last_error = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.last_error ELSE sighting_drafts.last_error END,
       updated_at = excluded.updated_at`;
export const DRAFT_LIST_SQL = `SELECT id, notes, risk, media_id, sighting_id, reviewed_media_ref,
  encryption_version, review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error
  FROM sighting_drafts ORDER BY updated_at DESC`;
export const MEDIA_JOURNAL_SAVE_SQL = `UPDATE sighting_drafts SET
  media_id = ?,
  reviewed_media_ref = ?,
  encryption_version = ?,
  review_receipt_json = ?,
  upload_state = ?,
  upload_attempts = ?,
  next_attempt_at = ?,
  last_error = ?
  WHERE id = ?`;
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
} as const;

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
      updated_at TEXT NOT NULL
    );
    -- Clear any selected source URI left by the legacy schema before use.
    ${LEGACY_URI_CLEAR_SQL}
  `);
  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(sighting_drafts)');
  const existing = new Set(columns.map(({ name }) => name));
  for (const [name, type] of Object.entries(SCHEMA_V2_COLUMNS)) {
    if (!existing.has(name)) await database.execAsync(`ALTER TABLE sighting_drafts ADD COLUMN ${name} ${type};`);
  }
  await database.execAsync(ENCRYPTION_VERSION_BACKFILL_SQL);
  if (existing.has('reviewed_media_path')) await database.execAsync(LEGACY_REVIEWED_PATH_CLEAR_SQL);
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
    uploadJob: { state, attempts: 0, nextAttemptAt: null, lastError: error },
  });
  if (!validated.mediaId || !validated.encryptedReviewedRef || !validated.encryptionVersion ||
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
          snapshot.draftId,
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

export function deserializeDraftRows(rows: readonly DraftRow[]): StoredDraft[] {
  const drafts: StoredDraft[] = [];
  for (const row of rows) {
    let textOnly: StoredDraft;
    try {
      textOnly = sanitizeDraftForStorage({ id: row.id, notes: row.notes, risk: row.risk });
    } catch {
      continue;
    }
    if (!row.media_id || !row.reviewed_media_ref || !row.review_receipt_json) {
      drafts.push(textOnly);
      continue;
    }
    try {
      drafts.push(sanitizeDraftForStorage({
        id: row.id,
        notes: row.notes,
        risk: row.risk,
        mediaId: row.media_id,
        sightingId: row.sighting_id ?? undefined,
        encryptedReviewedRef: row.reviewed_media_ref,
        encryptionVersion: row.encryption_version,
        receipt: JSON.parse(row.review_receipt_json),
        uploadJob: {
          state: row.upload_state,
          attempts: row.upload_attempts,
          nextAttemptAt: row.next_attempt_at,
          lastError: row.last_error,
        },
      }));
    } catch {
      drafts.push(textOnly);
    }
  }
  return drafts;
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
