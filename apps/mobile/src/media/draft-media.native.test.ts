jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import type { MediaReviewState } from './contracts';
import {
  cleanupProcessorCacheUris,
  persistReviewedMedia,
  verifyReviewedMedia,
  withDecryptedReviewedJpegWithDependencies,
  type DraftMediaDependencies,
  type VerifyReviewedMediaDependencies,
} from './draft-media.native';
import { withDecryptedReviewedJpeg as withDecryptedReviewedJpegOnWeb } from './draft-media.web';

const encryptedReviewedRef = 'reviewed-media/media-12345678.commit-12345678.agcm';
const encryptionVersion = 'aes-256-gcm.v1' as const;

const reviewed: MediaReviewState = {
  status: 'reviewed',
  masks: [],
  rendered: {
    uri: 'file:///cache/animalhelper-reviewed-12345678.jpg',
    sha256: 'a'.repeat(64),
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
    byteLength: 4,
    recipeVersion: 'jpeg-srgb-2048-q88.v1',
    detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
  },
  receipt: {
    sanitizedSha256: 'a'.repeat(64),
    recipeVersion: 'jpeg-srgb-2048-q88.v1',
    detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
    width: 1200,
    height: 800,
    byteLength: 4,
    confirmedAtLocal: '2026-08-27T00:00:00.000Z',
  },
};

function dependencies(events: string[]): DraftMediaDependencies {
  return {
    getOrCreateKeyForWrite: async () => ({ opaque: true }),
    committedExists: async () => false,
    readBytes: async (uri) => {
      events.push(`read:${uri}`);
      return new Uint8Array([1, 2, 3, 4]);
    },
    sha256: async () => 'a'.repeat(64),
    encrypt: async (bytes, _key, aad) => {
      events.push(`encrypt:${bytes.byteLength}:${aad}`);
      return new Uint8Array([9, 8, 7]);
    },
    commitEncrypted: async (reference, bytes) => {
      events.push(`write:${reference}:${bytes.byteLength}`);
      return reference;
    },
    cacheRootUri: 'file:///cache/',
    deleteProcessorCache: async (uri) => {
      events.push(`delete:${uri}`);
    },
  };
}

describe('native reviewed-media persistence', () => {
  it('encrypts confirmed rendered bytes to the prepared immutable reference without prematurely deleting plaintext', async () => {
    const events: string[] = [];
    const result = await persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      intendedEncryptedRef: encryptedReviewedRef,
      review: reviewed,
      processorCacheUris: [
        'file:///cache/animalhelper-canonical-12345678.jpg',
        'file:///cache/unrelated.db',
        'file:///cache/../documents/secret.txt',
        'file:///attacker/animalhelper-canonical-12345678.jpg',
        'content://gallery/animalhelper-canonical-12345678.jpg',
      ],
    }, dependencies(events));

    expect(result).toEqual({
      encryptedReviewedRef,
      encryptionVersion: 'aes-256-gcm.v1',
      mediaId: 'media-12345678',
    });
    expect(events.slice(0, 3)).toEqual([
      'read:file:///cache/animalhelper-reviewed-12345678.jpg',
      expect.stringContaining('encrypt:4:'),
      `write:${encryptedReviewedRef}:3`,
    ]);
    expect(events.slice(3)).toEqual([]);

    await cleanupProcessorCacheUris([
      'file:///cache/animalhelper-canonical-12345678.jpg',
      'file:///cache/unrelated.db',
      'file:///cache/../documents/secret.txt',
      'file:///attacker/animalhelper-canonical-12345678.jpg',
      'content://gallery/animalhelper-canonical-12345678.jpg',
      reviewed.rendered!.uri,
    ], dependencies(events));
    expect(events.slice(3)).toEqual([
      'delete:file:///cache/animalhelper-canonical-12345678.jpg',
      'delete:file:///cache/animalhelper-reviewed-12345678.jpg',
    ]);
    expect(events[1]).toContain('draft-12345678');
    expect(events[1]).toContain(encryptedReviewedRef);
    expect(events[1]).toContain('a'.repeat(64));
    expect(events[1]).toContain('2026-08-27T00:00:00.000Z');
  });

  it('fails before reading bytes when the exact render is not confirmed', async () => {
    const events: string[] = [];
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      intendedEncryptedRef: encryptedReviewedRef,
      review: { ...reviewed, status: 'needs_review', receipt: null },
      processorCacheUris: [],
    }, dependencies(events))).rejects.toThrow('media_review_required');
    expect(events).toEqual([]);
  });

  it('rejects a gallery or caller-controlled rendered URI before reading bytes', async () => {
    const events: string[] = [];
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      intendedEncryptedRef: encryptedReviewedRef,
      review: { ...reviewed, rendered: { ...reviewed.rendered!, uri: 'content://gallery/original.jpg' } },
      processorCacheUris: [],
    }, dependencies(events))).rejects.toThrow('unowned_rendered_media');
    expect(events).toEqual([]);
  });

  it('keeps transient files when authenticated persistence fails', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      intendedEncryptedRef: encryptedReviewedRef,
      review: reviewed,
      processorCacheUris: ['file:///cache/animalhelper-canonical-12345678.jpg'],
    }, {
      ...deps,
      commitEncrypted: async () => { throw new Error('disk_full'); },
    })).rejects.toThrow('disk_full');
    expect(events).not.toContain('delete:file:///cache/animalhelper-canonical-12345678.jpg');
  });

  it('rejects same-length bytes changed after confirmation before encryption', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      intendedEncryptedRef: encryptedReviewedRef,
      review: reviewed,
      processorCacheUris: ['file:///cache/animalhelper-canonical-12345678.jpg'],
    }, {
      ...deps,
      sha256: async () => 'b'.repeat(64),
    })).rejects.toThrow('reviewed_media_changed');
    expect(events.some((event) => event.startsWith('encrypt:'))).toBe(false);
    expect(events).not.toContain('delete:file:///cache/animalhelper-canonical-12345678.jpg');
  });

  it('never creates a replacement write key when the immutable artifact already exists', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    const getOrCreateKeyForWrite = jest.fn(async () => ({ opaque: true }));
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      intendedEncryptedRef: encryptedReviewedRef,
      review: reviewed,
      processorCacheUris: [],
    }, {
      ...deps,
      committedExists: async () => true,
      getOrCreateKeyForWrite,
    })).rejects.toThrow('reviewed_media_already_exists');
    expect(getOrCreateKeyForWrite).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });
});

describe('scoped authenticated reviewed-media reads', () => {
  const input = {
    draftId: 'draft-12345678',
    mediaId: 'media-12345678',
    encryptedReviewedRef,
    encryptionVersion,
    receipt: reviewed.receipt!,
  };

  function readerDependencies(plaintext: Uint8Array = new Uint8Array([1, 2, 3, 4])) {
    return {
      loadExistingKey: jest.fn(async () => ({ opaque: true })),
      generateKey: jest.fn(async () => ({ generated: true })),
      persistKey: jest.fn(async () => undefined),
      getCommittedSize: jest.fn(async () => 40),
      readCommitted: jest.fn(async () => {
        const envelope = new Uint8Array(40);
        envelope.set([0x41, 0x48, 0x4d, 0x31]);
        new DataView(envelope.buffer).setUint32(4, 32, false);
        return envelope;
      }),
      decryptEnvelope: jest.fn(async (_payload: Uint8Array, _key: unknown, aad: string) => {
        expect(aad).toContain('"encryptionVersion":"aes-256-gcm.v1"');
        return plaintext;
      }),
      sha256: jest.fn(async () => 'a'.repeat(64)),
    };
  }

  it('uses an existing key and clears the exact full-span plaintext after consume returns', async () => {
    const dependencies = readerDependencies();
    let observed: Uint8Array | undefined;
    await expect(withDecryptedReviewedJpegWithDependencies(input, async (artifact) => {
      observed = artifact.bytes;
      expect(artifact.bytes.byteOffset).toBe(0);
      expect(artifact.bytes.buffer.byteLength).toBe(artifact.bytes.byteLength);
      expect(artifact).toMatchObject({ sha256: 'a'.repeat(64), byteLength: 4 });
      return artifact.sha256;
    }, dependencies)).resolves.toBe(reviewed.receipt!.sanitizedSha256);
    expect([...observed!]).toEqual(new Array(reviewed.receipt!.byteLength).fill(0));
    expect(dependencies.generateKey).not.toHaveBeenCalled();
    expect(dependencies.persistKey).not.toHaveBeenCalled();
  });

  it('clears plaintext after consume throws without replacing the consumer error', async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4]);
    const dependencies = readerDependencies(plaintext);
    await expect(withDecryptedReviewedJpegWithDependencies(input, async () => {
      throw new Error('consumer_failed');
    }, dependencies)).rejects.toThrow('consumer_failed');
    expect([...plaintext]).toEqual([0, 0, 0, 0]);
  });

  it('normalizes a sliced decrypt view and clears the discarded plaintext view', async () => {
    const backing = new Uint8Array([91, 1, 2, 3, 4, 92]);
    const decryptedView = backing.subarray(1, 5);
    const dependencies = readerDependencies(decryptedView);
    await withDecryptedReviewedJpegWithDependencies(input, async (artifact) => {
      expect([...artifact.bytes]).toEqual([1, 2, 3, 4]);
      expect(artifact.bytes.buffer).not.toBe(decryptedView.buffer);
      expect(artifact.bytes.byteOffset).toBe(0);
      expect(artifact.bytes.buffer.byteLength).toBe(4);
    }, dependencies);
    expect([...decryptedView]).toEqual([0, 0, 0, 0]);
  });

  it('fails a missing existing key without generating or persisting one or invoking consume', async () => {
    const dependencies = readerDependencies();
    dependencies.loadExistingKey.mockResolvedValueOnce(null as never);
    const consume = jest.fn();
    await expect(withDecryptedReviewedJpegWithDependencies(input, consume, dependencies))
      .rejects.toThrow('local_media_key_missing');
    expect(consume).not.toHaveBeenCalled();
    expect(dependencies.generateKey).not.toHaveBeenCalled();
    expect(dependencies.persistKey).not.toHaveBeenCalled();
  });

  it.each([undefined, 'aes-256-gcm.v2'])('fails closed on missing or unknown encryption version %s', async (version) => {
    const dependencies = readerDependencies();
    const consume = jest.fn();
    await expect(withDecryptedReviewedJpegWithDependencies({
      ...input,
      encryptionVersion: version,
    } as never, consume, dependencies)).rejects.toThrow('version_mismatch');
    expect(dependencies.getCommittedSize).not.toHaveBeenCalled();
    expect(dependencies.loadExistingKey).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('rejects AAD authentication failure before consume', async () => {
    const dependencies = readerDependencies();
    dependencies.decryptEnvelope.mockRejectedValueOnce(
      Object.assign(new Error('AES decryption failed: Tag mismatch!'), { code: 'ERR_DECRYPTION_FAILED' }),
    );
    const consume = jest.fn();
    await expect(withDecryptedReviewedJpegWithDependencies(input, consume, dependencies))
      .rejects.toThrow('local_media_corrupt');
    expect(consume).not.toHaveBeenCalled();
  });

  it.each([
    ['length', new Uint8Array([1, 2, 3]), 'a'.repeat(64)],
    ['hash', new Uint8Array([1, 2, 3, 4]), 'b'.repeat(64)],
  ] as const)('rejects a plaintext %s mismatch and clears decrypted bytes', async (_kind, plaintext, hash) => {
    const dependencies = readerDependencies(plaintext);
    dependencies.sha256.mockResolvedValueOnce(hash);
    const consume = jest.fn();
    await expect(withDecryptedReviewedJpegWithDependencies(input, consume, dependencies))
      .rejects.toThrow('local_media_corrupt');
    expect(consume).not.toHaveBeenCalled();
    expect([...plaintext]).toEqual(new Array(plaintext.byteLength).fill(0));
  });

  it('clears verified plaintext before returning a status', async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4]);
    await expect(verifyReviewedMedia(input, readerDependencies(plaintext) as VerifyReviewedMediaDependencies))
      .resolves.toBe('valid');
    expect([...plaintext]).toEqual([0, 0, 0, 0]);
  });

  it('fails on web before invoking consume', async () => {
    const consume = jest.fn();
    await expect(withDecryptedReviewedJpegOnWeb(input, consume)).rejects.toThrow('secure_media_processing_unavailable');
    expect(consume).not.toHaveBeenCalled();
  });
});
