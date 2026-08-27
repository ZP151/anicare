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
  const trustedSupabaseUrl = 'https://storage.example.invalid';
  const parserOptions = {
    expectedMediaId: 'media-123456',
    supabaseUrl: trustedSupabaseUrl,
    now: new Date('2026-08-27T00:00:00.000Z'),
    insecureOrigins: [] as const,
  };
  const validReservationResponse = {
    jobId: 'job-12345678',
    mediaId: 'media-123456',
    reservationExpiresAt: '2026-08-27T00:10:00.000Z',
    uploadCredentialUsableUntil: '2026-08-27T02:00:00.000Z',
    upload: {
      signedUrl: 'https://storage.example.invalid/storage/v1/object/upload/sign/media-staging/jobs/job-12345678.jpg?token=opaque-token',
      token: 'opaque-token',
    },
  };

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

  it('returns only a validated capability after binding the response to the expected media and trusted URL', () => {
    expect(parseMediaReservationResponse(validReservationResponse, parserOptions)).toEqual({
      jobId: 'job-12345678',
      path: 'jobs/job-12345678.jpg',
      token: 'opaque-token',
      usableUntil: '2026-08-27T02:00:00.000Z',
    });
  });

  it('normalizes PostgREST microsecond offset timestamps to canonical millisecond UTC', () => {
    expect(parseMediaReservationResponse({
      jobId: 'job-12345678',
      mediaId: 'media-123456',
      reservationExpiresAt: '2026-08-27T12:10:00.123456+00:00',
      uploadCredentialUsableUntil: '2026-08-27T14:00:00.987654+00:00',
      upload: validReservationResponse.upload,
    }, {
      ...parserOptions,
      now: new Date('2026-08-27T12:00:00.987Z'),
    })).toMatchObject({
      usableUntil: '2026-08-27T14:00:00.987Z',
    });
  });

  it('rejects legacy single expiry and raw storage-path response fields', () => {
    expect(() => parseMediaReservationResponse({
      jobId: 'job-12345678',
      mediaId: 'media-123456',
      expiresAt: '2026-08-27T00:10:00.000Z',
      upload: validReservationResponse.upload,
    }, parserOptions)).toThrow('invalid_media_reservation_response');
    expect(() => parseMediaReservationResponse({
      ...validReservationResponse,
      storagePath: 'jobs/private.jpg',
    }, parserOptions)).toThrow('invalid_media_reservation_response');
    expect(() => parseMediaReservationResponse({
      ...validReservationResponse,
      reservationExpiresAt: '2026-08-27T12:34:56.1234567+00:00',
    }, parserOptions)).toThrow('invalid_media_reservation_response');
  });

  it.each([
    ['a response media ID mismatch', { mediaId: 'other-media-123456' }],
    ['an expired credential', { uploadCredentialUsableUntil: '2026-08-26T23:59:59.999Z' }],
    ['a near-expiry credential', { uploadCredentialUsableUntil: '2026-08-27T00:04:59.999Z' }],
    ['a credential beyond its bounded lifetime', { uploadCredentialUsableUntil: '2026-08-27T02:00:00.001Z' }],
    ['a foreign origin', { upload: { ...validReservationResponse.upload, signedUrl: 'https://attacker.invalid/storage/v1/object/upload/sign/media-staging/jobs/job-12345678.jpg?token=opaque-token' } }],
    ['URL userinfo', { upload: { ...validReservationResponse.upload, signedUrl: 'https://trusted@storage.example.invalid/storage/v1/object/upload/sign/media-staging/jobs/job-12345678.jpg?token=opaque-token' } }],
    ['a URL fragment', { upload: { ...validReservationResponse.upload, signedUrl: `${validReservationResponse.upload.signedUrl}#fragment` } }],
    ['a wrong storage bucket', { upload: { ...validReservationResponse.upload, signedUrl: 'https://storage.example.invalid/storage/v1/object/upload/sign/private-bucket/jobs/job-12345678.jpg?token=opaque-token' } }],
    ['a wrong job path', { upload: { ...validReservationResponse.upload, signedUrl: 'https://storage.example.invalid/storage/v1/object/upload/sign/media-staging/jobs/other-job-123456.jpg?token=opaque-token' } }],
    ['a duplicate token query', { upload: { ...validReservationResponse.upload, signedUrl: `${validReservationResponse.upload.signedUrl}&token=opaque-token` } }],
    ['a mismatched token query', { upload: { ...validReservationResponse.upload, signedUrl: 'https://storage.example.invalid/storage/v1/object/upload/sign/media-staging/jobs/job-12345678.jpg?token=other-token' } }],
    ['an extra query parameter', { upload: { ...validReservationResponse.upload, signedUrl: `${validReservationResponse.upload.signedUrl}&x=1` } }],
    ['encoded traversal in the URL path', { upload: { ...validReservationResponse.upload, signedUrl: 'https://storage.example.invalid/storage/v1/object/upload/sign/media-staging/jobs/%2e%2e/job-12345678.jpg?token=opaque-token' } }],
  ])('rejects %s instead of accepting an untrusted capability', (_name, mutation) => {
    expect(() => parseMediaReservationResponse({ ...validReservationResponse, ...mutation }, parserOptions))
      .toThrow('invalid_media_reservation_response');
  });

  it('allows HTTP only when the exact configured local origin is allow-listed', () => {
    const localUrl = 'http://localhost:54321';
    const localResponse = {
      ...validReservationResponse,
      upload: {
        ...validReservationResponse.upload,
        signedUrl: 'http://localhost:54321/storage/v1/object/upload/sign/media-staging/jobs/job-12345678.jpg?token=opaque-token',
      },
    };

    expect(() => parseMediaReservationResponse(localResponse, {
      ...parserOptions,
      supabaseUrl: localUrl,
    })).toThrow('invalid_media_reservation_response');
    expect(parseMediaReservationResponse(localResponse, {
      ...parserOptions,
      supabaseUrl: localUrl,
      insecureOrigins: [localUrl],
    })).toEqual(expect.objectContaining({ path: 'jobs/job-12345678.jpg' }));
  });

  it('rejects a configured base that is not literally an origin', () => {
    expect(() => parseMediaReservationResponse(validReservationResponse, {
      ...parserOptions,
      supabaseUrl: 'https://storage.example.invalid/./',
    })).toThrow('invalid_media_reservation_response');
  });
});
