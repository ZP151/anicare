import { describe, expect, it } from 'vitest';

import { edgeEndpointUrl, type Gate2AEdgeEndpoint } from './edge-endpoints.js';

describe('Gate 2A Edge endpoint manifest builder', () => {
  it.each([
    ['cleanupMediaStaging', 'cleanup-media-staging'],
    ['createSighting', 'create-sighting'],
    ['deleteMedia', 'delete-media'],
    ['finalizeMediaUpload', 'finalize-media-upload'],
    ['reserveMediaUpload', 'reserve-media-upload'],
  ] as const)('builds the reviewed %s endpoint', (name, slug) => {
    const endpoint = new URL(edgeEndpointUrl('http://127.0.0.1:54321', name));

    expect(endpoint.origin).toBe('http://127.0.0.1:54321');
    expect(endpoint.pathname.split('/')).toEqual(['', 'functions', 'v1', slug]);
    expect(endpoint.search).toBe('');
    expect(endpoint.hash).toBe('');
  });

  it('rejects an unknown runtime manifest key', () => {
    expect(() => edgeEndpointUrl(
      'http://127.0.0.1:54321',
      'unreviewedEndpoint' as Gate2AEdgeEndpoint,
    )).toThrow('Unknown Pilot Gate 2A Edge endpoint.');
  });
});
