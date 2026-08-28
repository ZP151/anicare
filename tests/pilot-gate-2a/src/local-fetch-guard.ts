import { readLocalStackEnvironment } from './environment.js';

type FetchTarget = { fetch: typeof fetch };

const REMOTE_TARGET_MESSAGE = 'Pilot Gate 2A fetch target must be loopback HTTP(S).';
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
