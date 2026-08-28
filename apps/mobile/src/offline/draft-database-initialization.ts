const DATABASE_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export type DatabaseKeyDependencies = Readonly<{
  isAvailable(): Promise<boolean>;
  load(): Promise<string | null>;
  store(key: string): Promise<void>;
  randomBytes(length: number): Uint8Array;
}>;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateDatabaseKey(key: string) {
  if (!DATABASE_KEY_PATTERN.test(key)) throw new Error('secure_offline_storage_key_invalid');
  return key;
}

export async function loadOrCreateDatabaseKey(
  dependencies: DatabaseKeyDependencies,
): Promise<string> {
  if (!await dependencies.isAvailable()) throw new Error('secure_offline_storage_unavailable');

  const current = await dependencies.load();
  if (current !== null) return validateDatabaseKey(current);

  const created = validateDatabaseKey(bytesToHex(dependencies.randomBytes(32)));
  await dependencies.store(created);
  return created;
}

export type EncryptedDatabaseDependencies<T> = Readonly<{
  isNative: boolean;
  loadKey(): Promise<string>;
  openDatabase(): Promise<T>;
  applyKey(database: T, key: string): Promise<void>;
  initialize(database: T): Promise<void>;
}>;

export async function openEncryptedDatabaseWithDependencies<T>(
  dependencies: EncryptedDatabaseDependencies<T>,
): Promise<T> {
  if (!dependencies.isNative) throw new Error('secure_offline_storage_unavailable');

  const key = validateDatabaseKey(await dependencies.loadKey());
  const database = await dependencies.openDatabase();
  await dependencies.applyKey(database, key);
  await dependencies.initialize(database);
  return database;
}

export function createRetryableSingleFlight<T>(
  open: () => Promise<T>,
): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (inFlight) return inFlight;
    const attempt = open();
    inFlight = attempt;
    void attempt.catch(() => {
      if (inFlight === attempt) inFlight = null;
    });
    return attempt;
  };
}
