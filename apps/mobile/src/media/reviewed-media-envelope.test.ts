jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));

import {
  decodeEncryptedEnvelope,
  encodeEncryptedEnvelope,
  MAX_REVIEWED_MEDIA_BYTES,
  verifyReviewedMedia,
} from './draft-media.native';

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
  encryptionVersion: 'aes-256-gcm.v1' as const,
  receipt,
};

describe('authenticated reviewed-media envelope', () => {
  it('round-trips a versioned envelope and rejects corrupt headers', () => {
    const minimumPayload = new Uint8Array(28);
    minimumPayload[27] = 3;
    expect([...decodeEncryptedEnvelope(encodeEncryptedEnvelope(minimumPayload))]).toEqual([...minimumPayload]);
    expect(() => decodeEncryptedEnvelope(new Uint8Array([0, 1, 2, 3, 4]))).toThrow('invalid_encrypted_media_envelope');
    expect(() => encodeEncryptedEnvelope(new Uint8Array(27))).toThrow('invalid_encrypted_media_payload');
    expect(() => encodeEncryptedEnvelope(new Uint8Array(MAX_REVIEWED_MEDIA_BYTES + 29)))
      .toThrow('encrypted_media_too_large');
  });

  it('distinguishes absent, authenticated valid, structurally corrupt, authenticated-tampered, and hash-mismatched artifacts', async () => {
    const base = {
      loadExistingKey: async () => ({ opaque: true }),
      getCommittedSize: async () => 40,
      readCommitted: async () => encodeEncryptedEnvelope(new Uint8Array(32)),
      decryptEnvelope: async () => new Uint8Array([1, 2, 3, 4]),
      sha256: async () => 'a'.repeat(64),
    };
    await expect(verifyReviewedMedia(input, { ...base, getCommittedSize: async () => null })).resolves.toBe('absent');
    await expect(verifyReviewedMedia(input, base)).resolves.toBe('valid');
    await expect(verifyReviewedMedia(input, {
      ...base,
      readCommitted: async () => new Uint8Array(40),
    })).resolves.toBe('corrupt');
    await expect(verifyReviewedMedia(input, {
      ...base,
      decryptEnvelope: async () => {
        throw Object.assign(new Error('AES decryption failed: Tag mismatch!'), { code: 'ERR_DECRYPTION_FAILED' });
      },
    })).resolves.toBe('corrupt');
    await expect(verifyReviewedMedia(input, {
      ...base,
      decryptEnvelope: async () => {
        throw Object.assign(new Error('CryptoKit.CryptoKitError.authenticationFailure'), { code: 'ERR_UNKNOWN' });
      },
    })).resolves.toBe('corrupt');
    await expect(verifyReviewedMedia(input, { ...base, sha256: async () => 'b'.repeat(64) })).resolves.toBe('corrupt');
  });

  it('keeps transient SecureStore and unknown native decrypt failures retryable until a later valid inspection', async () => {
    let keyAvailable = false;
    const base = {
      getCommittedSize: async () => 40,
      readCommitted: async () => encodeEncryptedEnvelope(new Uint8Array(32)),
      loadExistingKey: async () => {
        if (!keyAvailable) throw new Error('secure_media_storage_unavailable');
        return { opaque: true };
      },
      decryptEnvelope: async () => new Uint8Array([1, 2, 3, 4]),
      sha256: async () => 'a'.repeat(64),
    };
    await expect(verifyReviewedMedia(input, base)).resolves.toBe('retryable_unavailable');
    keyAvailable = true;
    await expect(verifyReviewedMedia(input, base)).resolves.toBe('valid');
    await expect(verifyReviewedMedia(input, {
      ...base,
      decryptEnvelope: async () => { throw new Error('native_runtime_temporarily_unavailable'); },
    })).resolves.toBe('retryable_unavailable');
  });

  it('rejects impossible or oversized envelope metadata before reading the whole file', async () => {
    let reads = 0;
    const base = {
      loadExistingKey: async () => ({ opaque: true }),
      getCommittedSize: async () => MAX_REVIEWED_MEDIA_BYTES + 37,
      readCommitted: async () => { reads += 1; return new Uint8Array(); },
      decryptEnvelope: async () => new Uint8Array(),
      sha256: async () => 'a'.repeat(64),
    };
    await expect(verifyReviewedMedia(input, base)).resolves.toBe('corrupt');
    expect(reads).toBe(0);
  });
});
