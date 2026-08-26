import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { sanitizeDraftForStorage, StoredDraft } from './draft-policy';

const DATABASE_KEY_NAME = 'animalhelper.offline-drafts.v1';
const DATABASE_NAME = 'animalhelper-drafts.db';

export const LEGACY_URI_CLEAR_SQL = 'UPDATE sighting_drafts SET photo_uri = NULL;';
export const DRAFT_SAVE_SQL = `INSERT INTO sighting_drafts (id, notes, risk, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       notes = excluded.notes,
       risk = excluded.risk,
       updated_at = excluded.updated_at`;
export const DRAFT_LIST_SQL = 'SELECT id, notes, risk FROM sighting_drafts ORDER BY updated_at DESC';

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
      updated_at TEXT NOT NULL
    );
    -- Clear any selected source URI left by the legacy schema before use.
    ${LEGACY_URI_CLEAR_SQL}
  `);
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
  }>(DRAFT_LIST_SQL);
  return rows.map((row) => ({
    id: row.id,
    notes: row.notes,
    risk: row.risk,
  }));
}

export async function deleteOfflineDraft(id: string) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM sighting_drafts WHERE id = ?', id);
}
