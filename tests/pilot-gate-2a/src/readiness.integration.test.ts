import { describe, expect, it } from 'vitest';

import { readLocalStackEnvironment } from './environment.js';
import { edgeEndpointUrl } from './edge-endpoints.js';
import { sanitizeDiagnostic } from './diagnostics.js';
import { createSyntheticScenario, destroySyntheticScenario } from './fixtures.js';
import { fetchWithTimeout } from './network.js';
import { postgrestReadinessRequest } from './readiness.js';

const DEADLINE_MS = 20_000;
const RETRY_DELAY_MS = 250;

function infrastructureFailure(env: ReturnType<typeof readLocalStackEnvironment>, stage: string): Error {
  return new Error(sanitizeDiagnostic(
    { scenario: 'local-stack-readiness', error: `${stage}-unavailable` },
    [env.anonKey, env.serviceRoleKey, env.databaseUrl],
  ));
}

async function eventually(
  env: ReturnType<typeof readLocalStackEnvironment>,
  stage: string,
  request: (remainingMs: number) => Promise<Response>,
  isReady: (response: Response) => boolean,
): Promise<Response> {
  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    try {
      const remaining = deadline - Date.now();
      const response = await request(remaining);
      if (isReady(response)) return response;
    } catch {
      // The distinct failure below identifies local infrastructure readiness.
    }
    const delay = Math.min(RETRY_DELAY_MS, Math.max(0, deadline - Date.now()));
    if (delay === 0) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw infrastructureFailure(env, stage);
}

describe('local stack readiness', () => {
  it('reaches Health, Auth, and the configured create-sighting Edge runtime', async () => {
    const env = readLocalStackEnvironment(process.env);
    const health = await eventually(env, 'health', (remaining) => fetchWithTimeout(
      postgrestReadinessRequest(env.apiUrl, env.anonKey),
      {},
      Math.min(RETRY_DELAY_MS, remaining),
    ), (response) => response.ok);
    expect(health.status).toBe(200);

    const auth = await eventually(env, 'auth', (remaining) => fetchWithTimeout(`${env.apiUrl}/auth/v1/health`, {
      headers: { apikey: env.anonKey },
    }, Math.min(RETRY_DELAY_MS, remaining)), (response) => response.ok);
    expect(auth.status).toBe(200);

    const edge = await eventually(env, 'edge', (remaining) => fetchWithTimeout(edgeEndpointUrl(env.apiUrl, 'createSighting'), {
      method: 'POST',
      headers: { apikey: env.anonKey, 'Content-Type': 'application/json' },
      body: new Uint8Array(),
    }, Math.min(RETRY_DELAY_MS, remaining)), (response) => response.status === 401);
    expect(edge.status).toBe(401);

    const scenario = await createSyntheticScenario(env);
    try {
      expect(scenario.owner.id).not.toBe(scenario.stranger.id);
      expect(scenario.owner.accessToken).not.toBe(scenario.stranger.accessToken);
      expect(scenario.ownerSightingId).not.toBe(scenario.strangerSightingId);
    } finally {
      await destroySyntheticScenario(env, scenario);
    }
  });
});
