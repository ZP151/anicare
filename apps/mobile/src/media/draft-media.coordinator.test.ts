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

type Store = { files: Map<string, Uint8Array>; deleted: string[] };

function fileDependencies(store: Store, failure?: 'write' | 'commit') {
  return {
    randomId: () => 'temp-12345678',
    writeTemp: async (reference: string, bytes: Uint8Array) => {
      store.files.set(reference, failure === 'write' ? bytes.slice(0, 1) : bytes);
      if (failure === 'write') throw new Error('partial_write');
    },
    replaceTemp: async (temporary: string, final: string) => {
      if (failure === 'commit') throw new Error('commit_failed');
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
    const store: Store = { files: new Map(), deleted: [] };
    await expect(commitEncryptedFile('media-12345678', new Uint8Array([1, 2]), fileDependencies(store, 'write')))
      .rejects.toThrow('partial_write');
    expect([...store.files.keys()]).toEqual([]);
    expect(store.deleted).toEqual(['reviewed-media/.media-12345678.temp-12345678.tmp']);
  });

  it('cleans temp state and remains retryable when final replacement fails', async () => {
    const store: Store = { files: new Map(), deleted: [] };
    await expect(commitEncryptedFile('media-12345678', new Uint8Array([1, 2]), fileDependencies(store, 'commit')))
      .rejects.toThrow('commit_failed');
    expect([...store.files.keys()]).toEqual([]);
  });

  it('atomically replaces a prior final file for the same stable media ID', async () => {
    const store: Store = {
      files: new Map([['reviewed-media/media-12345678.agcm', new Uint8Array([9])]]),
      deleted: [],
    };
    await expect(commitEncryptedFile('media-12345678', new Uint8Array([1, 2]), fileDependencies(store)))
      .resolves.toBe('reviewed-media/media-12345678.agcm');
    expect([...store.files.get('reviewed-media/media-12345678.agcm')!]).toEqual([1, 2]);
  });
});
