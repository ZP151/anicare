jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import type { MediaReviewState } from './contracts';
import { persistReviewedMedia, type DraftMediaDependencies } from './draft-media.native';

const reviewed: MediaReviewState = {
  status: 'reviewed',
  masks: [],
  rendered: {
    uri: 'file:///cache/reviewed.jpg',
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
    getOrCreateKey: async () => ({ opaque: true }),
    readBytes: async (uri) => {
      events.push(`read:${uri}`);
      return new Uint8Array([1, 2, 3, 4]);
    },
    sha256: async () => 'a'.repeat(64),
    encrypt: async (bytes, _key, aad) => {
      events.push(`encrypt:${bytes.byteLength}:${aad}`);
      return new Uint8Array([9, 8, 7]);
    },
    writeEncrypted: async (mediaId, bytes) => {
      events.push(`write:${mediaId}:${bytes.byteLength}`);
      return `file:///documents/reviewed-media/${mediaId}.agcm`;
    },
    deleteTransient: async (uri) => {
      events.push(`delete:${uri}`);
    },
  };
}

describe('native reviewed-media persistence', () => {
  it('encrypts confirmed rendered bytes before deleting every transient copy', async () => {
    const events: string[] = [];
    const result = await persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      review: reviewed,
      transientUris: ['file:///raw.heic', 'file:///cache/canonical.jpg'],
    }, dependencies(events));

    expect(result).toEqual({
      encryptedReviewedPath: 'file:///documents/reviewed-media/media-12345678.agcm',
      encryptionVersion: 'aes-256-gcm.v1',
      mediaId: 'media-12345678',
    });
    expect(events.slice(0, 3)).toEqual([
      'read:file:///cache/reviewed.jpg',
      expect.stringContaining('encrypt:4:'),
      'write:media-12345678:3',
    ]);
    expect(events.slice(3)).toEqual([
      'delete:file:///raw.heic',
      'delete:file:///cache/canonical.jpg',
      'delete:file:///cache/reviewed.jpg',
    ]);
    expect(events[1]).toContain('draft-12345678');
    expect(events[1]).toContain('a'.repeat(64));
  });

  it('fails before reading bytes when the exact render is not confirmed', async () => {
    const events: string[] = [];
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      review: { ...reviewed, status: 'needs_review', receipt: null },
      transientUris: ['file:///raw.heic'],
    }, dependencies(events))).rejects.toThrow('media_review_required');
    expect(events).toEqual([]);
  });

  it('keeps transient files when authenticated persistence fails', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      review: reviewed,
      transientUris: ['file:///raw.heic'],
    }, {
      ...deps,
      writeEncrypted: async () => { throw new Error('disk_full'); },
    })).rejects.toThrow('disk_full');
    expect(events).not.toContain('delete:file:///raw.heic');
  });

  it('rejects same-length bytes changed after confirmation before encryption', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    await expect(persistReviewedMedia({
      draftId: 'draft-12345678',
      mediaId: 'media-12345678',
      review: reviewed,
      transientUris: ['file:///raw.heic'],
    }, {
      ...deps,
      sha256: async () => 'b'.repeat(64),
    })).rejects.toThrow('reviewed_media_changed');
    expect(events.some((event) => event.startsWith('encrypt:'))).toBe(false);
    expect(events).not.toContain('delete:file:///raw.heic');
  });
});
