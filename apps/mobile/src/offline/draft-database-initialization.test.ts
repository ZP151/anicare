import {
  createRetryableSingleFlight,
  loadOrCreateDatabaseKey,
  openEncryptedDatabaseWithDependencies,
  type DatabaseKeyDependencies,
} from './draft-database-initialization';

describe('encrypted draft database initialization', () => {
  const database = { id: 'draft-database' };

  it('fails closed when secure storage is unavailable without touching key dependencies', async () => {
    const load = jest.fn(async () => 'a'.repeat(64));
    const store = jest.fn(async (_key: string) => undefined);
    const randomBytes = jest.fn((_length: number) => new Uint8Array(32));

    await expect(loadOrCreateDatabaseKey({
      isAvailable: async () => false,
      load,
      store,
      randomBytes,
    })).rejects.toThrow('secure_offline_storage_unavailable');

    expect(load).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
    expect(randomBytes).not.toHaveBeenCalled();
  });

  it('returns a valid stored key before considering generation', async () => {
    const events: string[] = [];
    const storedKey = 'A'.repeat(64);
    const store = jest.fn(async (_key: string) => { events.push('store'); });
    const randomBytes = jest.fn((_length: number) => {
      events.push('random');
      return new Uint8Array(32);
    });

    await expect(loadOrCreateDatabaseKey({
      isAvailable: async () => { events.push('available'); return true; },
      load: async () => { events.push('load'); return storedKey; },
      store,
      randomBytes,
    })).resolves.toBe(storedKey);

    expect(events).toEqual(['available', 'load']);
    expect(store).not.toHaveBeenCalled();
    expect(randomBytes).not.toHaveBeenCalled();
  });

  it('rejects an invalid stored key without replacing it', async () => {
    const store = jest.fn(async (_key: string) => undefined);
    const randomBytes = jest.fn((_length: number) => new Uint8Array(32));
    const dependencies: DatabaseKeyDependencies = {
      isAvailable: async () => true,
      load: async () => 'not-hex',
      store,
      randomBytes,
    };

    await expect(loadOrCreateDatabaseKey(dependencies))
      .rejects.toThrow('secure_offline_storage_key_invalid');
    expect(store).not.toHaveBeenCalled();
    expect(randomBytes).not.toHaveBeenCalled();
  });

  it('generates exactly 32 bytes, lowercase-hex encodes them, then stores the key', async () => {
    const events: string[] = [];
    const randomBytes = jest.fn((_length: number) => {
      events.push('random');
      return Uint8Array.from(Array.from({ length: 32 }, (_, index) => index));
    });
    const store = jest.fn(async (_key: string) => { events.push('store'); });
    const expectedKey = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

    await expect(loadOrCreateDatabaseKey({
      isAvailable: async () => { events.push('available'); return true; },
      load: async () => { events.push('load'); return null; },
      store,
      randomBytes,
    })).resolves.toBe(expectedKey);

    expect(events).toEqual(['available', 'load', 'random', 'store']);
    expect(randomBytes).toHaveBeenCalledWith(32);
    expect(store).toHaveBeenCalledWith(expectedKey);
  });

  it('does not store an invalid-length generated key', async () => {
    const store = jest.fn(async (_key: string) => undefined);

    await expect(loadOrCreateDatabaseKey({
      isAvailable: async () => true,
      load: async () => null,
      store,
      randomBytes: () => new Uint8Array(31),
    })).rejects.toThrow('secure_offline_storage_key_invalid');

    expect(store).not.toHaveBeenCalled();
  });

  it('fails on web before calling any database dependency', async () => {
    const loadKey = jest.fn(async () => 'a'.repeat(64));
    const openDatabase = jest.fn(async () => database);
    const applyKey = jest.fn(async () => undefined);
    const initialize = jest.fn(async () => undefined);

    await expect(openEncryptedDatabaseWithDependencies({
      isNative: false,
      loadKey,
      openDatabase,
      applyKey,
      initialize,
    })).rejects.toThrow('secure_offline_storage_unavailable');

    expect(loadKey).not.toHaveBeenCalled();
    expect(openDatabase).not.toHaveBeenCalled();
    expect(applyKey).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('loads and validates the key before opening, applying it exactly, and initializing', async () => {
    const events: string[] = [];
    const key = 'a'.repeat(64);
    const applyKey = jest.fn(async (_database: typeof database, appliedKey: string) => {
      events.push(`apply:${appliedKey}`);
    });
    const openDatabase = jest.fn(async () => { events.push('open'); return database; });

    await expect(openEncryptedDatabaseWithDependencies({
      isNative: true,
      loadKey: async () => { events.push('load'); return key; },
      openDatabase,
      applyKey,
      initialize: async () => { events.push('initialize'); },
    })).resolves.toBe(database);

    expect(events).toEqual(['load', 'open', `apply:${key}`, 'initialize']);
    expect(applyKey).toHaveBeenCalledWith(database, key);
  });

  it('rejects an invalid loaded key before opening SQLite', async () => {
    const openDatabase = jest.fn(async () => database);

    await expect(openEncryptedDatabaseWithDependencies({
      isNative: true,
      loadKey: async () => 'not-hex',
      openDatabase,
      applyKey: async () => undefined,
      initialize: async () => undefined,
    })).rejects.toThrow('secure_offline_storage_key_invalid');

    expect(openDatabase).not.toHaveBeenCalled();
  });

  it('does not open SQLite when the persisted key is invalid', async () => {
    const store = jest.fn(async (_key: string) => undefined);
    const invalidKeyDependencies: DatabaseKeyDependencies = {
      isAvailable: async () => true,
      load: async () => 'not-hex',
      store,
      randomBytes: () => new Uint8Array(32),
    };
    const openDatabase = jest.fn(async () => database);

    await expect(openEncryptedDatabaseWithDependencies({
      isNative: true,
      loadKey: () => loadOrCreateDatabaseKey(invalidKeyDependencies),
      openDatabase,
      applyKey: async () => undefined,
      initialize: async () => undefined,
    })).rejects.toThrow('secure_offline_storage_key_invalid');

    expect(store).not.toHaveBeenCalled();
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it('retries initialization after secure storage becomes available', async () => {
    let availabilityChecks = 0;
    const openDatabase = jest.fn(async () => database);
    const keyDependencies: DatabaseKeyDependencies = {
      isAvailable: async () => ++availabilityChecks > 1,
      load: async () => 'b'.repeat(64),
      store: async () => undefined,
      randomBytes: () => new Uint8Array(32),
    };
    const getDatabase = createRetryableSingleFlight(() => openEncryptedDatabaseWithDependencies({
      isNative: true,
      loadKey: () => loadOrCreateDatabaseKey(keyDependencies),
      openDatabase,
      applyKey: async () => undefined,
      initialize: async () => undefined,
    }));

    await expect(getDatabase()).rejects.toThrow('secure_offline_storage_unavailable');
    await expect(getDatabase()).resolves.toBe(database);
    expect(openDatabase).toHaveBeenCalledTimes(1);
  });

  it('retries the whole initialization attempt after SQLite open fails', async () => {
    const openDatabase = jest.fn()
      .mockRejectedValueOnce(new Error('database_locked'))
      .mockResolvedValue(database);
    const loadKey = jest.fn(async () => 'c'.repeat(64));
    const applyKey = jest.fn(async () => undefined);
    const initialize = jest.fn(async () => undefined);
    const getDatabase = createRetryableSingleFlight(() => openEncryptedDatabaseWithDependencies({
      isNative: true,
      loadKey,
      openDatabase,
      applyKey,
      initialize,
    }));

    await expect(getDatabase()).rejects.toThrow('database_locked');
    await expect(getDatabase()).resolves.toBe(database);
    expect(loadKey).toHaveBeenCalledTimes(2);
    expect(openDatabase).toHaveBeenCalledTimes(2);
    expect(applyKey).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('shares one promise across concurrent callers and keeps the successful result cached', async () => {
    let resolveOpen!: (value: typeof database) => void;
    const open = jest.fn(() => new Promise<typeof database>((resolve) => {
      resolveOpen = resolve;
    }));
    const getDatabase = createRetryableSingleFlight(open);

    const first = getDatabase();
    const second = getDatabase();
    expect(first).toBe(second);
    resolveOpen(database);
    await expect(first).resolves.toBe(database);

    const afterSuccess = getDatabase();
    expect(afterSuccess).toBe(first);
    await expect(afterSuccess).resolves.toBe(database);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
