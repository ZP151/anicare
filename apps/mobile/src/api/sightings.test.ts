import {
  buildSightingPayload,
  recoverSightingSubmission,
  submitSighting,
} from './sightings';

describe('buildSightingPayload', () => {
  it('includes precise input for the protected endpoint but never client-controlled exposure fields', () => {
    const payload = buildSightingPayload({
      latitude: 1.3521,
      longitude: 103.8198,
      occurredAt: new Date('2026-08-26T08:00:00.000Z'),
      risk: 'normal',
      traits: { coat: 'tortoiseshell', earTip: true },
      notes: 'Seen drinking water.',
      clientDedupeKey: 'draft-12345678',
    });

    expect(payload).toEqual({
      latitude: 1.3521,
      longitude: 103.8198,
      occurredAt: '2026-08-26T08:00:00.000Z',
      risk: 'normal',
      traits: { coat: 'tortoiseshell', earTip: true },
      notes: 'Seen drinking water.',
      clientDedupeKey: 'draft-12345678',
    });
    expect(payload).not.toHaveProperty('publicCellId');
    expect(payload).not.toHaveProperty('visibility');
    expect(payload).not.toHaveProperty('visibleAt');
  });
});

describe('sighting submission transport', () => {
  const endpoint = 'https://example.invalid/functions/v1/create-sighting';
  const accessToken = 'access-token';
  const draft = {
    latitude: 1.3521,
    longitude: 103.8198,
    occurredAt: new Date('2026-08-27T08:00:00.000Z'),
    risk: 'normal' as const,
    traits: {},
    notes: null,
    clientDedupeKey: 'draft-12345678',
  };
  const validResponse = {
    sightingId: '00000000-0000-4000-8000-000000000911',
    visibility: 'public',
    visibleAt: '2026-08-27T10:00:00.000Z',
    requestId: '00000000-0000-4000-8000-000000000912',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns only the stored submission response with a canonical visibility timestamp', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      sightingId: '00000000-0000-4000-8000-000000000911',
      visibility: 'public',
      visibleAt: '2026-08-27T10:00:00.123456+00:00',
      requestId: '00000000-0000-4000-8000-000000000912',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

    await expect(submitSighting({
      endpoint,
      accessToken,
      draft,
    })).resolves.toEqual({
      sightingId: '00000000-0000-4000-8000-000000000911',
      visibility: 'public',
      visibleAt: '2026-08-27T10:00:00.123Z',
      requestId: '00000000-0000-4000-8000-000000000912',
    });
    expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: 'POST' }));
  });

  it('recovers only by the dedupe key and reports a not-found outcome without creating a sighting', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: 'sighting_submission_not_found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(recoverSightingSubmission({ endpoint, accessToken, clientDedupeKey: 'draft-12345678' }))
      .resolves.toEqual({ kind: 'not_found' });
    expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.objectContaining({
      body: JSON.stringify({ clientDedupeKey: 'draft-12345678', recoverExisting: true }),
    }));
  });

  it('rejects an oversized submission response before it can become a result', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(64 * 1024 + 1), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(submitSighting({
      endpoint,
      accessToken,
      draft,
    })).rejects.toThrow('invalid_sighting_submission_response');
  });

  it.each([
    ['an unexpected response key', { ...validResponse, publicCellId: '89652636d87ffff' }],
    ['an invalid sighting ID', { ...validResponse, sightingId: 'sighting-12345678' }],
    ['an invalid request ID', { ...validResponse, requestId: 'request-12345678' }],
    ['an unsupported visibility', { ...validResponse, visibility: 'limited' }],
    ['an invalid visibility timestamp', { ...validResponse, visibleAt: 'not-a-timestamp' }],
  ])('rejects %s in a successful submission response', async (_name, responseBody) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(responseBody), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(submitSighting({ endpoint, accessToken, draft }))
      .rejects.toThrow('invalid_sighting_submission_response');
  });
});
