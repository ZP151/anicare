import manifest from '../edge-endpoints.json';

export type Gate2AEdgeEndpoint = keyof typeof manifest.endpoints;

const endpointManifest: Readonly<Record<string, unknown>> = manifest.endpoints;

export function edgeEndpointUrl(apiUrl: string, endpoint: Gate2AEdgeEndpoint): string {
  const slug = endpointManifest[endpoint];
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Unknown Pilot Gate 2A Edge endpoint.');
  }
  const base = new URL(apiUrl);
  return new URL(`/functions/v1/${slug}`, base.origin).toString();
}
