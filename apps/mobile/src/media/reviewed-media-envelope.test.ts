jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import { decodeEncryptedEnvelope, encodeEncryptedEnvelope, verifyReviewedMedia } from './draft-media.native';

const receipt = {
  sanitizedSha256: 'a'.repeat(64),
  recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
  width: 10,
  height: 10,
  byteLength: 4,
  confirmedAtLocal: '2026-08-27T00:00:00.000Z',
};
const input = {
  draftId: 'draft-12345678',
  mediaId: 'media-12345678',
  encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
  receipt,
};

describe('authenticated reviewed-media envelope', () => {
  it('round-trips a versioned envelope and rejects corrupt headers', () => {
    expect([...decodeEncryptedEnvelope(encodeEncryptedEnvelope(new Uint8Array([1, 2, 3])))])
      .toEqual([1, 2, 3]);
    expect(() => decodeEncryptedEnvelope(new Uint8Array([0, 1, 2, 3, 4]))).toThrow('invalid_encrypted_media_envelope');
  });

  it('distinguishes absent, authenticated valid, and tampered committed artifacts', async () => {
    const base = {
      getOrCreateKey: async () => ({ opaque: true }),
      readCommitted: async () => encodeEncryptedEnvelope(new Uint8Array([9, 8, 7])),
      decryptEnvelope: async () => new Uint8Array([1, 2, 3, 4]),
      sha256: async () => 'a'.repeat(64),
    };
    await expect(verifyReviewedMedia(input, { ...base, readCommitted: async () => null })).resolves.toBe('absent');
    await expect(verifyReviewedMedia(input, base)).resolves.toBe('valid');
    await expect(verifyReviewedMedia(input, {
      ...base,
      decryptEnvelope: async () => { throw new Error('authentication_failed'); },
    })).resolves.toBe('corrupt');
    await expect(verifyReviewedMedia(input, { ...base, sha256: async () => 'b'.repeat(64) })).resolves.toBe('corrupt');
  });
});
