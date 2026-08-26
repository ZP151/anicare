import {
  buildFinalizeMediaRequest,
  buildReserveMediaRequest,
  parseMediaReservationResponse,
  type ReserveMediaInput,
} from './media';

const receipt = {
  sanitizedSha256: 'a'.repeat(64),
  recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
  width: 640,
  height: 480,
  byteLength: 42,
  confirmedAtLocal: '2026-08-27T00:00:00.000Z',
} as const;

const input: ReserveMediaInput = {
  sightingId: 'sighting-123456',
  mediaId: 'media-123456',
  receipt,
};

describe('reviewed media API mapping', () => {
  it('sends the reviewed SHA and only the receipt-bound reservation contract', () => {
    expect(buildReserveMediaRequest(input)).toEqual({
      sightingId: 'sighting-123456',
      mediaId: 'media-123456',
      sha256: 'a'.repeat(64),
      byteLength: 42,
      review: {
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 640,
        height: 480,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
    });
  });

  it('rejects source paths, coordinates, tokens, and storage paths instead of serializing them', () => {
    for (const unsafeField of ['sourceUri', 'photoUri', 'canonicalUri', 'coordinates', 'accessToken', 'storagePath']) {
      expect(() => buildReserveMediaRequest({ ...input, [unsafeField]: 'secret' } as unknown as ReserveMediaInput))
        .toThrow('invalid_media_reservation');
    }
  });

  it('maps finalization to opaque identifiers and the reviewed SHA only', () => {
    expect(buildFinalizeMediaRequest({
      sightingId: 'sighting-123456',
      mediaId: 'media-123456',
      sha256: 'a'.repeat(64),
    })).toEqual({
      sightingId: 'sighting-123456',
      mediaId: 'media-123456',
      sha256: 'a'.repeat(64),
    });
  });

  it('accepts a distinct conservative signed-upload usable-until without exposing a path', () => {
    expect(parseMediaReservationResponse({
      jobId: 'job-12345678',
      mediaId: 'media-123456',
      reservationExpiresAt: '2026-08-27T00:10:00.000Z',
      uploadCredentialUsableUntil: '2026-08-27T02:00:00.000Z',
      upload: { signedUrl: 'https://storage.example.invalid/object', token: 'opaque-token' },
    })).toEqual({
      jobId: 'job-12345678',
      mediaId: 'media-123456',
      reservationExpiresAt: '2026-08-27T00:10:00.000Z',
      uploadCredentialUsableUntil: '2026-08-27T02:00:00.000Z',
      upload: { signedUrl: 'https://storage.example.invalid/object', token: 'opaque-token' },
    });
  });

  it('normalizes PostgREST microsecond offset timestamps to canonical millisecond UTC', () => {
    expect(parseMediaReservationResponse({
      jobId: 'job-12345678',
      mediaId: 'media-123456',
      reservationExpiresAt: '2026-08-27T12:34:56.123456+00:00',
      uploadCredentialUsableUntil: '2026-08-27T14:34:56.987654+00:00',
      upload: { signedUrl: 'https://storage.example.invalid/object', token: 'opaque-token' },
    })).toMatchObject({
      reservationExpiresAt: '2026-08-27T12:34:56.123Z',
      uploadCredentialUsableUntil: '2026-08-27T14:34:56.987Z',
    });
  });

  it('rejects legacy single expiry and raw storage-path response fields', () => {
    expect(() => parseMediaReservationResponse({
      jobId: 'job-12345678',
      mediaId: 'media-123456',
      expiresAt: '2026-08-27T00:10:00.000Z',
      upload: { signedUrl: 'https://storage.example.invalid/object', token: 'opaque-token' },
    })).toThrow('invalid_media_reservation_response');
    expect(() => parseMediaReservationResponse({
      jobId: 'job-12345678',
      mediaId: 'media-123456',
      reservationExpiresAt: '2026-08-27T00:10:00.000Z',
      uploadCredentialUsableUntil: '2026-08-27T02:00:00.000Z',
      storagePath: 'jobs/private.jpg',
      upload: { signedUrl: 'https://storage.example.invalid/object', token: 'opaque-token' },
    })).toThrow('invalid_media_reservation_response');
    expect(() => parseMediaReservationResponse({
      jobId: 'job-12345678',
      mediaId: 'media-123456',
      reservationExpiresAt: '2026-08-27T12:34:56.1234567+00:00',
      uploadCredentialUsableUntil: '2026-08-27T14:34:56.000000+00:00',
      upload: { signedUrl: 'https://storage.example.invalid/object', token: 'opaque-token' },
    })).toThrow('invalid_media_reservation_response');
  });
});
