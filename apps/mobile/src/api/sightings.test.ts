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
  const supabaseUrl = 'https://example.invalid';
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
      supabaseUrl,
      accessToken,
      draft,
    })).resolves.toEqual({
      sightingId: '00000000-0000-4000-8000-000000000911',
      visibility: 'public',
      visibleAt: '2026-08-27T10:00:00.123Z',
      requestId: '00000000-0000-4000-8000-000000000912',
    });
    expect(fetchMock).toHaveBeenCalledWith(`${supabaseUrl}/functions/v1/create-sighting`, expect.objectContaining({ method: 'POST' }));
  });

  it('constructs the exact create-sighting endpoint from a trusted origin and rejects redirects', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(validResponse), { status: 201 }));
    await expect(submitSighting({
      supabaseUrl: 'https://example.invalid/', accessToken, draft,
    } as never)).resolves.toEqual(validResponse);

    expect(fetchMock).toHaveBeenCalledWith('https://example.invalid/functions/v1/create-sighting', {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: 1.3521, longitude: 103.8198, occurredAt: '2026-08-27T08:00:00.000Z',
        risk: 'normal', traits: {}, notes: null, clientDedupeKey: 'draft-12345678',
      }),
    });
  });

  it('allows only an explicitly injected local origin for development transport', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(validResponse), { status: 201 }));
    await expect(submitSighting({
      supabaseUrl: 'http://127.0.0.1:54321', insecureOrigins: ['http://127.0.0.1:54321'], accessToken, draft,
    })).resolves.toEqual(validResponse);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:54321/functions/v1/create-sighting', expect.anything());
  });

  it.each([
    'https://example.invalid/functions/v1/other',
    'https://user@example.invalid',
    'https://example.invalid?redirect=attacker',
    'https://example.invalid/#fragment',
    'https://example.invalid/./',
  ])('rejects a non-literal configured origin before sending coordinates: %s', async (supabaseUrl) => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not run'));
    await expect(submitSighting({ supabaseUrl, accessToken, draft } as never))
      .rejects.toThrow('invalid_sighting_submission_response');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    () => new Response('', { status: 307, headers: { Location: 'https://attacker.invalid' } }),
    () => {
      const response = new Response(JSON.stringify(validResponse), { status: 201 });
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    },
  ])('fails closed when the response redirects', async (createResponse) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(createResponse());
    await expect(submitSighting({ supabaseUrl: 'https://example.invalid', accessToken, draft } as never))
      .rejects.toThrow('invalid_sighting_submission_response');
  });

  it('recovers only by the dedupe key and reports a not-found outcome without creating a sighting', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: 'sighting_submission_not_found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(recoverSightingSubmission({ supabaseUrl, accessToken, clientDedupeKey: 'draft-12345678' }))
      .resolves.toEqual({ kind: 'not_found' });
    expect(fetchMock).toHaveBeenCalledWith(`${supabaseUrl}/functions/v1/create-sighting`, expect.objectContaining({
      body: JSON.stringify({ clientDedupeKey: 'draft-12345678', recoverExisting: true }),
    }));
  });

  it('rejects an oversized submission response before it can become a result', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(64 * 1024 + 1), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(submitSighting({
      supabaseUrl,
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

    await expect(submitSighting({ supabaseUrl, accessToken, draft }))
      .rejects.toThrow('invalid_sighting_submission_response');
  });
});
