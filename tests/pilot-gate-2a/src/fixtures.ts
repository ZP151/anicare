import { randomBytes, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import type { LocalStackEnvironment } from './environment.js';
import { sanitizeDiagnostic } from './diagnostics.js';

export type SyntheticActor = Readonly<{ id: string; accessToken: string }>;
export type SyntheticScenario = Readonly<{
  owner: SyntheticActor;
  stranger: SyntheticActor;
  ownerSightingId: string;
  strangerSightingId: string;
}>;

type CreatedActor = Readonly<SyntheticActor & { email: string; password: string }>;
type NormalizedSightingResponse = Readonly<{
  sightingId: string;
  visibility: 'public' | 'hidden';
  visibleAt: string | null;
  requestId: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_ENCRYPTION_KEY_BYTES = 32;
const TEST_ENCRYPTION_KEY_BASE64_LENGTH = 44;

function fixtureFailure(scenario: string, error: string, secrets: readonly string[], count?: number): Error {
  return new Error(sanitizeDiagnostic({ scenario, error, count }, secrets));
}

function uniqueCredentials(role: 'owner' | 'stranger'): Readonly<{ email: string; password: string }> {
  const suffix = randomUUID().replaceAll('-', '');
  return {
    email: ['pilot', 'gate', '2a', role, suffix].join('-').concat('@example.invalid'),
    password: randomBytes(24).toString('base64url'),
  };
}

function fixtureClient(env: LocalStackEnvironment) {
  return createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function actorClient(env: LocalStackEnvironment) {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function requireTestEncryptionKey(): void {
  const key = process.env.PRECISE_LOCATION_ENCRYPTION_KEY;
  if (typeof key !== 'string' || key.length !== TEST_ENCRYPTION_KEY_BASE64_LENGTH) {
    throw new Error('fixture_encryption_key_not_configured');
  }
  try {
    if (Buffer.from(key, 'base64').byteLength !== TEST_ENCRYPTION_KEY_BYTES) throw new Error('invalid');
  } catch {
    throw new Error('fixture_encryption_key_not_configured');
  }
}

async function createActor(env: LocalStackEnvironment, role: 'owner' | 'stranger'): Promise<CreatedActor> {
  const { email, password } = uniqueCredentials(role);
  const admin = fixtureClient(env);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user?.id) {
    throw fixtureFailure('fixture-auth-create', 'auth-user-create-failed', [env.serviceRoleKey, password]);
  }

  const { data: signedIn, error: signInError } = await actorClient(env).auth.signInWithPassword({ email, password });
  const accessToken = signedIn.session?.access_token;
  if (signInError || !signedIn.user?.id || !accessToken || signedIn.user.id !== created.user.id) {
    const failures = await deleteUsers(env, [{ id: created.user.id, accessToken: accessToken ?? '' }]);
    if (failures > 0) {
      throw fixtureFailure('fixture-auth-cleanup', 'auth-user-delete-failed', [env.serviceRoleKey, password, accessToken ?? ''], failures);
    }
    throw fixtureFailure('fixture-auth-sign-in', 'auth-user-sign-in-failed', [env.serviceRoleKey, password, accessToken ?? '']);
  }

  const { error: profileError } = await admin.from('user_profiles').insert({
    id: created.user.id,
    public_name: ['Synthetic', role].join(' '),
    adult_confirmed_at: new Date().toISOString(),
  });
  if (profileError) {
    const failures = await deleteUsers(env, [{ id: created.user.id, accessToken }]);
    if (failures > 0) {
      throw fixtureFailure('fixture-profile-cleanup', 'auth-user-delete-failed', [env.serviceRoleKey, password, accessToken], failures);
    }
    throw fixtureFailure('fixture-profile-create', 'adult-profile-create-failed', [env.serviceRoleKey, password, accessToken]);
  }

  return { id: created.user.id, accessToken, email, password };
}

function normalizedSightingResponse(value: unknown): NormalizedSightingResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (
    Object.keys(response).length !== 4 ||
    !UUID.test(String(response.sightingId)) ||
    (response.visibility !== 'public' && response.visibility !== 'hidden') ||
    (response.visibleAt !== null && typeof response.visibleAt !== 'string') ||
    !UUID.test(String(response.requestId))
  ) {
    return null;
  }
  return {
    sightingId: response.sightingId as string,
    visibility: response.visibility,
    visibleAt: response.visibleAt as string | null,
    requestId: response.requestId as string,
  };
}

async function createSighting(env: LocalStackEnvironment, actor: SyntheticActor, role: 'owner' | 'stranger'): Promise<string> {
  const coordinates = role === 'owner'
    ? { latitude: 1.3001, longitude: 103.8001 }
    : { latitude: 1.3002, longitude: 103.8002 };
  const response = await fetch(`${env.apiUrl}/functions/v1/create-sighting`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${actor.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...coordinates,
      occurredAt: new Date().toISOString(),
      risk: 'normal',
      traits: { synthetic: true },
      notes: null,
      clientDedupeKey: ['pilot', role, randomUUID()].join('-'),
    }),
  });
  const normalized = normalizedSightingResponse(await response.json().catch(() => null));
  if (response.status !== 201 || !normalized || normalized.visibility !== 'public' || normalized.visibleAt === null) {
    throw fixtureFailure('fixture-sighting-create', 'edge-sighting-create-failed', [actor.accessToken, env.anonKey, env.serviceRoleKey]);
  }
  return normalized.sightingId;
}

async function deleteUsers(env: LocalStackEnvironment, actors: readonly SyntheticActor[]): Promise<number> {
  const admin = fixtureClient(env);
  let failures = 0;
  for (const actor of actors) {
    const { error } = await admin.auth.admin.deleteUser(actor.id);
    if (error) failures += 1;
  }
  return failures;
}

export async function createSyntheticScenario(env: LocalStackEnvironment): Promise<SyntheticScenario> {
  requireTestEncryptionKey();
  const owner = await createActor(env, 'owner');
  let stranger: CreatedActor | undefined;
  try {
    stranger = await createActor(env, 'stranger');
    if (owner.id === stranger.id || owner.accessToken === stranger.accessToken) {
      throw fixtureFailure('fixture-auth-isolation', 'auth-actors-not-distinct', [owner.accessToken, stranger.accessToken]);
    }
    const ownerSightingId = await createSighting(env, owner, 'owner');
    const strangerSightingId = await createSighting(env, stranger, 'stranger');
    return {
      owner: { id: owner.id, accessToken: owner.accessToken },
      stranger: { id: stranger.id, accessToken: stranger.accessToken },
      ownerSightingId,
      strangerSightingId,
    };
  } catch (error) {
    const failures = await deleteUsers(env, [owner, ...(stranger ? [stranger] : [])]);
    if (failures > 0) {
      throw fixtureFailure('fixture-create-cleanup', 'auth-user-delete-failed', [env.serviceRoleKey, owner.accessToken, stranger?.accessToken ?? ''], failures);
    }
    throw error;
  }
}

export async function destroySyntheticScenario(env: LocalStackEnvironment, scenario: SyntheticScenario): Promise<void> {
  const failures = await deleteUsers(env, [scenario.owner, scenario.stranger]);
  if (failures > 0) {
    throw fixtureFailure(
      'fixture-destroy',
      'auth-user-delete-failed',
      [env.serviceRoleKey, scenario.owner.accessToken, scenario.stranger.accessToken],
      failures,
    );
  }
}
