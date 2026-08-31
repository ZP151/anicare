jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import { commitEncryptedFile, createKeyCoordinator } from './draft-media.native';

describe('reviewed-media key initialization', () => {
  it('shares one generated and persisted key across concurrent first use', async () => {
    let generated = 0;
    let persisted = 0;
    const getKey = createKeyCoordinator({
      loadKey: async () => null,
      generateKey: async () => ({ id: ++generated }),
      persistKey: async () => { persisted += 1; },
    });

    const [first, second] = await Promise.all([getKey(), getKey()]);

    expect(first).toBe(second);
    expect(generated).toBe(1);
    expect(persisted).toBe(1);
  });

  it('clears a failed initialization so a later call can recover', async () => {
    let generated = 0;
    const getKey = createKeyCoordinator({
      loadKey: async () => null,
      generateKey: async () => {
        generated += 1;
        if (generated === 1) throw new Error('secure_store_locked');
        return { id: generated };
      },
      persistKey: async () => undefined,
    });

    await expect(getKey()).rejects.toThrow('secure_store_locked');
    await expect(getKey()).resolves.toEqual({ id: 2 });
    expect(generated).toBe(2);
  });
});

type Store = { files: Map<string, Uint8Array>; deleted: string[]; moveOptions: unknown[] };

function fileDependencies(store: Store, failure?: 'write' | 'commit' | 'race') {
  let temporary = 0;
  return {
    randomId: () => `temp-1234567${++temporary}`,
    finalExists: async (reference: string) => store.files.has(reference),
    writeTemp: async (reference: string, bytes: Uint8Array) => {
      store.files.set(reference, failure === 'write' ? bytes.slice(0, 1) : bytes);
      if (failure === 'write') throw new Error('partial_write');
    },
    moveTemp: async (temporary: string, final: string, options: { overwrite: false }) => {
      store.moveOptions.push(options);
      if (failure === 'race') store.files.set(final, new Uint8Array([9]));
      if (failure === 'commit') throw new Error('commit_failed');
      if (store.files.has(final)) throw new Error('destination_exists');
      store.files.set(final, store.files.get(temporary)!);
      store.files.delete(temporary);
    },
    deleteTemp: async (reference: string) => {
      store.deleted.push(reference);
      store.files.delete(reference);
    },
  };
}

describe('reviewed-media file commit', () => {
  it('cleans a partially written app-owned temp file', async () => {
    const store: Store = { files: new Map(), deleted: [], moveOptions: [] };
    await expect(commitEncryptedFile('reviewed-media/media-12345678.commit-12345678.agcm', new Uint8Array([1, 2]), fileDependencies(store, 'write')))
      .rejects.toThrow('partial_write');
    expect([...store.files.keys()]).toEqual([]);
    expect(store.deleted).toEqual(['reviewed-media/.media-12345678.commit-12345678.temp-12345671.tmp']);
  });

  it('moves to a nonexistent immutable final with overwrite disabled', async () => {
    const store: Store = { files: new Map(), deleted: [], moveOptions: [] };
    await expect(commitEncryptedFile('reviewed-media/media-12345678.commit-12345678.agcm', new Uint8Array([1, 2]), fileDependencies(store)))
      .resolves.toBe('reviewed-media/media-12345678.commit-12345678.agcm');
    expect(store.moveOptions).toEqual([{ overwrite: false }]);
    expect([...store.files.get('reviewed-media/media-12345678.commit-12345678.agcm')!]).toEqual([1, 2]);
  });

  it('cleans temp state and remains retryable when immutable commit fails', async () => {
    const store: Store = { files: new Map(), deleted: [], moveOptions: [] };
    await expect(commitEncryptedFile('reviewed-media/media-12345678.commit-12345678.agcm', new Uint8Array([1, 2]), fileDependencies(store, 'commit')))
      .rejects.toThrow('commit_failed');
    expect([...store.files.keys()]).toEqual([]);
  });

  it('reuses a prior immutable final for authenticated verification without moving or deleting it', async () => {
    const store: Store = {
      files: new Map([['reviewed-media/media-12345678.commit-12345678.agcm', new Uint8Array([9])]]),
      deleted: [],
      moveOptions: [],
    };
    await expect(commitEncryptedFile('reviewed-media/media-12345678.commit-12345678.agcm', new Uint8Array([1, 2]), fileDependencies(store)))
      .resolves.toBe('reviewed-media/media-12345678.commit-12345678.agcm');
    expect([...store.files.get('reviewed-media/media-12345678.commit-12345678.agcm')!]).toEqual([9]);
    expect(store.moveOptions).toEqual([]);
  });

  it('preserves a final that appears during a failed no-overwrite move', async () => {
    const store: Store = { files: new Map(), deleted: [], moveOptions: [] };
    await expect(commitEncryptedFile('reviewed-media/media-12345678.commit-12345678.agcm', new Uint8Array([1, 2]), fileDependencies(store, 'race')))
      .rejects.toThrow('destination_exists');
    expect([...store.files.get('reviewed-media/media-12345678.commit-12345678.agcm')!]).toEqual([9]);
    expect(store.moveOptions).toEqual([{ overwrite: false }]);
  });

  it('serializes concurrent same-reference commits around an Android-style replacing move', async () => {
    const final = 'reviewed-media/media-12345678.commit-12345678.agcm';
    const files = new Map<string, Uint8Array>();
    let temporary = 0;
    let moves = 0;
    const deleted: string[] = [];
    const dependencies = {
      randomId: () => `temp-1234567${++temporary}`,
      finalExists: async (reference: string) => {
        await Promise.resolve();
        return files.has(reference);
      },
      writeTemp: async (reference: string, bytes: Uint8Array) => { files.set(reference, bytes); },
      moveTemp: async (from: string, to: string, options: { overwrite: false }) => {
        expect(options).toEqual({ overwrite: false });
        moves += 1;
        // Models Expo Android's check-then-rename fallback: this replaces if called twice.
        files.set(to, files.get(from)!);
        files.delete(from);
      },
      deleteTemp: async (reference: string) => { deleted.push(reference); files.delete(reference); },
    };

    await expect(Promise.all([
      commitEncryptedFile(final, new Uint8Array([1]), dependencies),
      commitEncryptedFile(final, new Uint8Array([2]), dependencies),
    ])).resolves.toEqual([final, final]);

    expect(moves).toBe(1);
    expect([...files.get(final)!]).toEqual([1]);
    expect(deleted).not.toContain(final);
  });
});
