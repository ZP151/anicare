import { readLocalStackEnvironment } from './environment.js';
import { isApprovedGate2AEdgePath } from './edge-endpoints.js';

type FetchTarget = { fetch: typeof fetch };

const REMOTE_TARGET_MESSAGE = 'Pilot Gate 2A fetch target must be loopback HTTP(S).';
const UNAPPROVED_EDGE_ENDPOINT_MESSAGE = 'Pilot Gate 2A Edge endpoint is not approved.';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function fetchUrl(input: RequestInfo | URL): URL {
  try {
    if (typeof input === 'string') return new URL(input);
    if (input instanceof URL) return new URL(input.toString());
    if (input instanceof Request) return new URL(input.url);
  } catch {
    throw new Error(REMOTE_TARGET_MESSAGE);
  }
  throw new Error(REMOTE_TARGET_MESSAGE);
}

function assertLoopbackHttpTarget(input: RequestInfo | URL): void {
  const url = fetchUrl(input);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new Error(REMOTE_TARGET_MESSAGE);
  }
  let decodedPath = url.pathname;
  for (let pass = 0; pass < 4; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decodedPath);
    } catch {
      break;
    }
    if (next === decodedPath) break;
    decodedPath = next;
  }
  const normalizedPath = decodedPath.replace(/\/{2,}/g, '/').toLowerCase();
  const edgePrefix = `/${['functions', 'v1', ''].join('/')}`;
  if (normalizedPath.startsWith(edgePrefix) && !isApprovedGate2AEdgePath(url.pathname)) {
    throw new Error(UNAPPROVED_EDGE_ENDPOINT_MESSAGE);
  }
}

export function installPilotGate2AFetchBoundary(
  source: NodeJS.ProcessEnv,
  target: FetchTarget = globalThis,
): void {
  readLocalStackEnvironment(source);
  if (typeof target.fetch !== 'function') throw new Error('Pilot Gate 2A fetch is unavailable.');
  const dispatch = target.fetch.bind(target);
  target.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assertLoopbackHttpTarget(input);
    return dispatch(input, { ...init, redirect: 'error' });
  }) as typeof fetch;
}
