import { sanitizeDraftForStorage } from './draft-policy';

describe('offline draft privacy', () => {
  it('never persists precise coordinates or access tokens', () => {
    expect(
      sanitizeDraftForStorage({
        id: 'draft-1',
        notes: 'white paws',
        risk: 'sensitive',
        latitude: 1.3521,
        longitude: 103.8198,
        accessToken: 'secret',
      }),
    ).toEqual({
      id: 'draft-1',
      notes: 'white paws',
      risk: 'sensitive',
    });
  });

  it('normalises notes and rejects unknown risk values', () => {
    expect(
      sanitizeDraftForStorage({ id: 'draft-2', notes: '  tabby  ', risk: 'unknown' }),
    ).toEqual({
      id: 'draft-2',
      notes: 'tabby',
      risk: 'normal',
    });
  });

  it('does not persist a raw selected-image URI', () => {
    expect(sanitizeDraftForStorage({ id: 'd1', photoUri: 'file:///raw.jpg', latitude: 1, accessToken: 'x' })).not.toHaveProperty('photoUri');
  });

  it('keeps only a validated encrypted reviewed-media reference and bounded retry state', () => {
    expect(sanitizeDraftForStorage({
      id: 'draft-12345678',
      notes: 'tabby',
      risk: 'normal',
      mediaId: 'media-12345678',
      encryptedReviewedPath: 'file:///documents/reviewed-media/media-12345678.agcm',
      receipt: {
        sanitizedSha256: 'a'.repeat(64),
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 1200,
        height: 800,
        byteLength: 50_000,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
      uploadJob: { state: 'waiting', attempts: 2, nextAttemptAt: '2026-08-27T00:00:02.000Z', lastError: 'network' },
      sightingId: 'sighting-12345678',
      sourceUri: 'file:///raw.heic',
      canonicalUri: 'file:///cache/canonical.jpg',
      latitude: 1.3,
      accessToken: 'secret',
    })).toMatchObject({
      mediaId: 'media-12345678',
      encryptedReviewedPath: 'file:///documents/reviewed-media/media-12345678.agcm',
      sightingId: 'sighting-12345678',
      uploadJob: { state: 'waiting', attempts: 2, lastError: 'network' },
    });
  });

  it('rejects partial or non-encrypted reviewed-media state', () => {
    expect(() => sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedPath: 'file:///raw.jpg',
    })).toThrow('invalid_reviewed_media_draft');
  });

  it('rejects a reviewed path for a different media ID and inherited detector statuses', () => {
    const inheritedVersions = Object.create({ cats: 'unavailable', people: 'unavailable', plates: 'unavailable' });
    inheritedVersions.one = 'unavailable';
    inheritedVersions.two = 'unavailable';
    inheritedVersions.three = 'unavailable';
    const receipt = {
      sanitizedSha256: 'a'.repeat(64),
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: inheritedVersions,
      width: 100,
      height: 100,
      byteLength: 100,
      confirmedAtLocal: '2026-08-27T00:00:00.000Z',
    };
    expect(() => sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedPath: 'file:///documents/reviewed-media/media-87654321.agcm',
      receipt,
    })).toThrow('invalid_reviewed_media_draft');
  });
});
