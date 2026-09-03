import { randomBytes, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { edgeEndpointUrl } from '../../pilot-gate-2a/src/edge-endpoints.js';
import { fetchWithTimeout } from '../../pilot-gate-2a/src/network.js';
import type { SyntheticActor } from '../../pilot-gate-2a/src/fixtures.js';
import type { HostedGateEnvironment } from './environment.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS = 8_000;

export type HostedScenario = Readonly<{
  owner: SyntheticActor;
  stranger: SyntheticActor;
  ownerSightingId: string;
  strangerSightingId: string;
  createdUserIds: readonly string[];
  createdObjectPaths: readonly string[];
}>;

type Role = 'owner' | 'stranger';

export type HostedFixtureAdapter = Readonly<{
  createAuthUser(input: Readonly<{ role: Role; email: string; password: string; emailConfirmed: true }>): Promise<string>;
  signIn(input: Readonly<{ role: Role; email: string; password: string }>): Promise<SyntheticActor>;
  createAdultProfile(input: Readonly<{
    role: Role; userId: string; publicName: string; adultConfirmedAt: string;
  }>): Promise<void>;
  createSighting(input: Readonly<{
    role: Role; actor: SyntheticActor; latitude: number; longitude: number; synthetic: true;
    clientDedupeKey: string;
  }>): Promise<string>;
  recoverSightingIds(references: readonly Readonly<{ reporterId: string; clientDedupeKey: string }>[])
    : Promise<readonly string[]>;
  deleteSightings(ids: readonly string[]): Promise<void>;
  deleteProfiles(ids: readonly string[]): Promise<void>;
  deleteAuthUsers(ids: readonly string[]): Promise<void>;
  assertFixturesAbsent(input: Readonly<{
    sightingIds: readonly string[]; profileIds: readonly string[]; userIds: readonly string[];
  }>): Promise<boolean>;
}>;

function credentials(role: Role): Readonly<{ email: string; password: string }> {
  const suffix = randomUUID().replaceAll('-', '');
  return {
    email: `pilot-gate-2b-${role}-${suffix}@example.invalid`,
    password: randomBytes(32).toString('base64url'),
  };
}

function adminClient(env: HostedGateEnvironment) {
  return createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetchWithTimeout(input, init, REQUEST_TIMEOUT_MS) },
  });
}

function publicClient(env: HostedGateEnvironment) {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetchWithTimeout(input, init, REQUEST_TIMEOUT_MS) },
  });
}

function defaultAdapter(env: HostedGateEnvironment): HostedFixtureAdapter {
  const admin = adminClient(env);
  return {
    async createAuthUser(input) {
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email, password: input.password, email_confirm: input.emailConfirmed,
      });
      if (error || !data.user?.id || !UUID.test(data.user.id)) throw new Error('create_failed');
      return data.user.id;
    },
    async signIn(input) {
      const { data, error } = await publicClient(env).auth.signInWithPassword({
        email: input.email, password: input.password,
      });
      const id = data.user?.id;
      const accessToken = data.session?.access_token;
      if (error || !id || !UUID.test(id) || !accessToken || /[\r\n]/.test(accessToken)) {
        throw new Error('sign_in_failed');
      }
      return { id, accessToken };
    },
    async createAdultProfile(input) {
      const { error } = await admin.from('user_profiles').insert({
        id: input.userId,
        public_name: input.publicName,
        adult_confirmed_at: input.adultConfirmedAt,
      });
      if (error) throw new Error('profile_failed');
    },
    async createSighting(input) {
      const response = await fetchWithTimeout(edgeEndpointUrl(env.apiUrl, 'createSighting'), {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${input.actor.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: input.latitude,
          longitude: input.longitude,
          occurredAt: new Date().toISOString(),
          risk: 'normal',
          traits: { synthetic: input.synthetic, gate: '2b' },
          notes: null,
          clientDedupeKey: input.clientDedupeKey,
        }),
      }, REQUEST_TIMEOUT_MS);
      const value = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (response.status !== 201 || response.redirected || !value || !UUID.test(String(value.sightingId)) ||
          value.visibility !== 'public' || typeof value.visibleAt !== 'string') throw new Error('sighting_failed');
      return value.sightingId as string;
    },
    async recoverSightingIds(references) {
      const ids: string[] = [];
      for (const reference of references) {
        const { data, error } = await admin.from('sightings').select('id')
          .eq('reporter_id', reference.reporterId)
          .eq('client_dedupe_key', reference.clientDedupeKey)
          .limit(1);
        if (error || !Array.isArray(data) || data.length > 1 ||
            data.some((row) => !row || typeof row.id !== 'string' || !UUID.test(row.id))) {
          throw new Error('sighting_recovery_failed');
        }
        if (data[0]?.id) ids.push(data[0].id);
      }
      return ids;
    },
    async deleteSightings(ids) {
      if (ids.length === 0) return;
      const { error } = await admin.from('sightings').delete().in('id', [...ids]);
      if (error) throw new Error('sighting_cleanup_failed');
    },
    async deleteProfiles(ids) {
      if (ids.length === 0) return;
      const { error } = await admin.from('user_profiles').delete().in('id', [...ids]);
      if (error) throw new Error('profile_cleanup_failed');
    },
    async deleteAuthUsers(ids) {
      let failed = false;
      for (const id of ids) {
        const { error } = await admin.auth.admin.deleteUser(id).catch(() => ({ error: new Error('delete_failed') }));
        if (error) failed = true;
      }
      if (failed) throw new Error('auth_cleanup_failed');
    },
    async assertFixturesAbsent(input) {
      const [sightings, profiles] = await Promise.all([
        input.sightingIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : admin.from('sightings').select('id').in('id', [...input.sightingIds]),
        input.profileIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : admin.from('user_profiles').select('id').in('id', [...input.profileIds]),
      ]);
      if (sightings.error || profiles.error || sightings.data?.length !== 0 || profiles.data?.length !== 0) return false;
      for (const id of input.userIds) {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (data.user !== null || error?.status !== 404 || error.code !== 'user_not_found') return false;
      }
      return true;
    },
  };
}

async function cleanupPartial(
  adapter: HostedFixtureAdapter,
  sightingReferences: readonly Readonly<{ reporterId: string; clientDedupeKey: string }>[],
  sightingIds: readonly string[],
  profileIds: readonly string[],
  userIds: readonly string[],
): Promise<void> {
  let failed = false;
  let recoveredIds: readonly string[] = [];
  await adapter.recoverSightingIds(sightingReferences).then((ids) => { recoveredIds = ids; })
    .catch(() => { failed = true; });
  const exactSightingIds = [...new Set([...sightingIds, ...recoveredIds])];
  await adapter.deleteSightings(exactSightingIds).catch(() => { failed = true; });
  await adapter.deleteProfiles(profileIds).catch(() => { failed = true; });
  await adapter.deleteAuthUsers(userIds).catch(() => { failed = true; });
  await adapter.assertFixturesAbsent({ sightingIds: exactSightingIds, profileIds, userIds })
    .then((absent) => { if (!absent) failed = true; })
    .catch(() => { failed = true; });
  if (failed) throw new Error('hosted_fixture_cleanup_failed');
}

export async function createHostedScenario(
  env: HostedGateEnvironment,
  adapter: HostedFixtureAdapter = defaultAdapter(env),
): Promise<HostedScenario> {
  const userIds: string[] = [];
  const profileIds: string[] = [];
  const sightingIds: string[] = [];
  const sightingReferences: Array<{ reporterId: string; clientDedupeKey: string }> = [];
  try {
    const actors = {} as Record<Role, SyntheticActor>;
    for (const role of ['owner', 'stranger'] as const) {
      const secret = credentials(role);
      const id = await adapter.createAuthUser({ ...secret, role, emailConfirmed: true });
      if (!UUID.test(id) || userIds.includes(id)) throw new Error('invalid_actor');
      userIds.push(id);
      const actor = await adapter.signIn({ ...secret, role });
      if (actor.id !== id || actor.accessToken.length === 0 || /[\s]/.test(actor.accessToken)) {
        throw new Error('invalid_session');
      }
      actors[role] = actor;
      profileIds.push(id);
      await adapter.createAdultProfile({
        role, userId: id, publicName: `Synthetic ${role}`, adultConfirmedAt: new Date().toISOString(),
      });
    }
    if (actors.owner.accessToken === actors.stranger.accessToken) throw new Error('invalid_isolation');
    const createTrackedSighting = async (role: Role, actor: SyntheticActor, latitude: number, longitude: number) => {
      const clientDedupeKey = `pilot-gate-2b-${role}-${randomUUID()}`;
      sightingReferences.push({ reporterId: actor.id, clientDedupeKey });
      const id = await adapter.createSighting({ role, actor, latitude, longitude, synthetic: true, clientDedupeKey });
      sightingIds.push(id);
      return id;
    };
    const ownerSightingId = await createTrackedSighting('owner', actors.owner, 1.3001, 103.8001);
    const strangerSightingId = await createTrackedSighting('stranger', actors.stranger, 1.3002, 103.8002);
    if (!UUID.test(ownerSightingId) || !UUID.test(strangerSightingId) || ownerSightingId === strangerSightingId) {
      throw new Error('invalid_sightings');
    }
    return {
      owner: actors.owner,
      stranger: actors.stranger,
      ownerSightingId,
      strangerSightingId,
      createdUserIds: [...userIds],
      createdObjectPaths: [],
    };
  } catch {
    await cleanupPartial(
      adapter,
      [...sightingReferences].reverse(),
      [...sightingIds].reverse(),
      [...profileIds].reverse(),
      [...userIds].reverse(),
    ).catch(() => {
      throw new Error('hosted_fixture_cleanup_failed');
    });
    throw new Error('hosted_fixture_failed');
  }
}
