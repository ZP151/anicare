import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { sanitizeDraftForStorage, type StoredDraft } from './draft-policy';

const DATABASE_KEY_NAME = 'animalhelper.offline-drafts.v1';
const DATABASE_NAME = 'animalhelper-drafts.db';

export const LEGACY_URI_CLEAR_SQL = 'UPDATE sighting_drafts SET photo_uri = NULL;';
export const LEGACY_REVIEWED_PATH_CLEAR_SQL = 'UPDATE sighting_drafts SET reviewed_media_path = NULL;';
export const DRAFT_SAVE_SQL = `INSERT INTO sighting_drafts
     (id, notes, risk, media_id, sighting_id, reviewed_media_ref, review_receipt_json,
      upload_state, upload_attempts, next_attempt_at, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       notes = excluded.notes,
       risk = excluded.risk,
       media_id = COALESCE(excluded.media_id, sighting_drafts.media_id),
       sighting_id = COALESCE(excluded.sighting_id, sighting_drafts.sighting_id),
       reviewed_media_ref = COALESCE(excluded.reviewed_media_ref, sighting_drafts.reviewed_media_ref),
       review_receipt_json = COALESCE(excluded.review_receipt_json, sighting_drafts.review_receipt_json),
       upload_state = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.upload_state ELSE sighting_drafts.upload_state END,
       upload_attempts = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.upload_attempts ELSE sighting_drafts.upload_attempts END,
       next_attempt_at = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.next_attempt_at ELSE sighting_drafts.next_attempt_at END,
       last_error = CASE WHEN excluded.media_id IS NOT NULL THEN excluded.last_error ELSE sighting_drafts.last_error END,
       updated_at = excluded.updated_at`;
export const DRAFT_LIST_SQL = `SELECT id, notes, risk, media_id, sighting_id, reviewed_media_ref,
  review_receipt_json, upload_state, upload_attempts, next_attempt_at, last_error
  FROM sighting_drafts ORDER BY updated_at DESC`;

const SCHEMA_V2_COLUMNS = {
  media_id: 'TEXT',
  sighting_id: 'TEXT',
  reviewed_media_ref: 'TEXT',
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
    draft.receipt ? JSON.stringify(draft.receipt) : null,
    draft.uploadJob?.state ?? null,
    draft.uploadJob?.attempts ?? null,
    draft.uploadJob?.nextAttemptAt ?? null,
    draft.uploadJob?.lastError ?? null,
    new Date().toISOString(),
  );
  return draft;
}

export async function listOfflineDrafts(): Promise<StoredDraft[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    notes: string;
    risk: StoredDraft['risk'];
    media_id: string | null;
    sighting_id: string | null;
    reviewed_media_ref: string | null;
    review_receipt_json: string | null;
    upload_state: string | null;
    upload_attempts: number | null;
    next_attempt_at: string | null;
    last_error: string | null;
  }>(DRAFT_LIST_SQL);
  return rows.map((row) => sanitizeDraftForStorage({
    id: row.id,
    notes: row.notes,
    risk: row.risk,
    ...(row.media_id && row.reviewed_media_ref && row.review_receipt_json ? {
      mediaId: row.media_id,
      sightingId: row.sighting_id ?? undefined,
      encryptedReviewedRef: row.reviewed_media_ref,
      receipt: JSON.parse(row.review_receipt_json),
      uploadJob: {
        state: row.upload_state,
        attempts: row.upload_attempts,
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
      },
    } : {}),
  }));
}

export async function deleteOfflineDraft(id: string) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM sighting_drafts WHERE id = ?', id);
}
