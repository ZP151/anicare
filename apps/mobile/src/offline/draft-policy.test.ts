import { sanitizeDraftForStorage } from './draft-policy';

describe('offline draft privacy', () => {
  it('never persists precise coordinates or access tokens', () => {
    expect(
      sanitizeDraftForStorage({
        id: 'draft-001',
        notes: 'white paws',
        risk: 'sensitive',
        latitude: 1.3521,
        longitude: 103.8198,
        accessToken: 'secret',
      }),
    ).toEqual({
      id: 'draft-001',
      notes: 'white paws',
      risk: 'sensitive',
    });
  });

  it('normalises notes and rejects unknown risk values', () => {
    expect(
      sanitizeDraftForStorage({ id: 'draft-002', notes: '  tabby  ', risk: 'unknown' }),
    ).toEqual({
      id: 'draft-002',
      notes: 'tabby',
      risk: 'normal',
    });
  });

  it('does not persist a raw selected-image URI', () => {
    expect(sanitizeDraftForStorage({ id: 'draft-003', photoUri: 'file:///raw.jpg', latitude: 1, accessToken: 'x' })).not.toHaveProperty('photoUri');
  });

  it('keeps only a validated encrypted reviewed-media reference and bounded retry state', () => {
    expect(sanitizeDraftForStorage({
      id: 'draft-12345678',
      notes: 'tabby',
      risk: 'normal',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
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
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      sightingId: 'sighting-12345678',
      uploadJob: { state: 'waiting', attempts: 2, lastError: 'network' },
    });
  });

  it('rejects partial or non-encrypted reviewed-media state', () => {
    expect(() => sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'file:///raw.jpg',
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
      encryptedReviewedRef: 'reviewed-media/media-87654321.commit-12345678.agcm',
      receipt,
    })).toThrow('invalid_reviewed_media_draft');
  });

  it.each([
    'file:///attacker/reviewed-media/media-12345678.commit-12345678.agcm',
    'reviewed-media/../media-12345678.commit-12345678.agcm',
    '../reviewed-media/media-12345678.commit-12345678.agcm',
    'content://gallery/media-12345678.commit-12345678.agcm',
  ])('rejects non-app-owned reviewed media reference %s', (encryptedReviewedRef) => {
    expect(() => sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef,
      receipt: {
        sanitizedSha256: 'a'.repeat(64),
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 100,
        height: 100,
        byteLength: 100,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
    })).toThrow('invalid_reviewed_media_draft');
  });

  it.each([undefined, null, '', 'short', '../draft-12345678'])('rejects invalid draft ID %s', (id) => {
    expect(() => sanitizeDraftForStorage({ id })).toThrow('invalid_draft_id');
  });

  it.each([null, '', 'not-a-date'])('rejects waiting retry state without a valid schedule: %s', (nextAttemptAt) => {
    expect(() => sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      receipt: {
        sanitizedSha256: 'a'.repeat(64),
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 100,
        height: 100,
        byteLength: 100,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
      uploadJob: { state: 'waiting', attempts: 1, nextAttemptAt, lastError: 'network' },
    })).toThrow('invalid_reviewed_media_draft');
  });

  it('clears a schedule from non-waiting states', () => {
    expect(sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      receipt: {
        sanitizedSha256: 'a'.repeat(64),
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 100,
        height: 100,
        byteLength: 100,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
      uploadJob: { state: 'complete', attempts: 1, nextAttemptAt: '2026-08-27T01:00:00.000Z', lastError: null },
    }).uploadJob?.nextAttemptAt).toBeNull();
  });

  it('retains the bounded hostile-input retry error for user recovery', () => {
    expect(sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      receipt: {
        sanitizedSha256: 'a'.repeat(64),
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 100,
        height: 100,
        byteLength: 100,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
      uploadJob: { state: 'needs_user', attempts: 0, nextAttemptAt: null, lastError: 'invalid_upload_attempt' },
    }).uploadJob?.lastError).toBe('invalid_upload_attempt');
  });

  it('persists a bounded local_persisting journal without source paths', () => {
    expect(sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      receipt: {
        sanitizedSha256: 'a'.repeat(64),
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 100,
        height: 100,
        byteLength: 100,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
      uploadJob: { state: 'local_persisting', attempts: 0, nextAttemptAt: null, lastError: null },
      sourceUri: 'file:///gallery/raw.heic',
      canonicalUri: 'file:///cache/canonical.jpg',
    })).toMatchObject({
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      uploadJob: { state: 'local_persisting', attempts: 0 },
    });
  });

  it('rejects a receipt whose canonical plaintext exceeds the 20 MiB local-media bound', () => {
    expect(() => sanitizeDraftForStorage({
      id: 'draft-12345678',
      mediaId: 'media-12345678',
      encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
      receipt: {
        sanitizedSha256: 'a'.repeat(64),
        recipeVersion: 'jpeg-srgb-2048-q88.v1',
        detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
        width: 2048,
        height: 2048,
        byteLength: 20 * 1024 * 1024 + 1,
        confirmedAtLocal: '2026-08-27T00:00:00.000Z',
      },
    })).toThrow('invalid_reviewed_media_draft');
  });
});
