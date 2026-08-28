import { describe, expect, it } from 'vitest';

import { readLocalStackEnvironment } from './environment.js';
import { sanitizeDiagnostic } from './diagnostics.js';
import { createSyntheticScenario, destroySyntheticScenario } from './fixtures.js';

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
  request: () => Promise<Response>,
  isReady: (response: Response) => boolean,
): Promise<Response> {
  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    try {
      const response = await request();
      if (isReady(response)) return response;
    } catch {
      // The distinct failure below identifies local infrastructure readiness.
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  throw infrastructureFailure(env, stage);
}

describe('local stack readiness', () => {
  it('reaches Health, Auth, and the configured create-sighting Edge runtime', async () => {
    const env = readLocalStackEnvironment(process.env);
    const health = await eventually(env, 'health', () => fetch(`${env.apiUrl}/rest/v1/`, {
      headers: { apikey: env.anonKey },
    }), (response) => response.ok);
    expect(health.status).toBe(200);

    const auth = await eventually(env, 'auth', () => fetch(`${env.apiUrl}/auth/v1/health`, {
      headers: { apikey: env.anonKey },
    }), (response) => response.ok);
    expect(auth.status).toBe(200);

    const edge = await eventually(env, 'edge', () => fetch(`${env.apiUrl}/functions/v1/create-sighting`, {
      method: 'POST',
      headers: { apikey: env.anonKey, 'Content-Type': 'application/json' },
      body: '{}',
    }), (response) => response.status === 401);
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
