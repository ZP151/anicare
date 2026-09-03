import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

import { fetchWithTimeout } from '../../pilot-gate-2a/src/network.js';
import type { HostedGateEnvironment } from './environment.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const OBJECT_PATH = /^jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;
const MAX_TRACKED = 8;

export type HostedInspectionInput = Readonly<{
  ownerId: string;
  sightingId: string;
  mediaId: string;
  jobId: string;
  mediaAssetId: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
}>;

export type HostedInspection = Readonly<{
  jobCount: number;
  matchingFinalizedJobCount: number;
  assetCount: number;
  matchingQuarantinedAssetCount: number;
  stagingObjectExists: boolean;
}>;

export type PartialHostedScenario = Readonly<{
  createdUserIds?: readonly string[];
  createdSightingIds?: readonly string[];
  createdMediaIds?: readonly string[];
  createdJobIds?: readonly string[];
  createdAssetIds?: readonly string[];
  createdObjectPaths?: readonly string[];
}>;

type CleanupTable = 'media_upload_jobs' | 'media_assets' | 'sightings' | 'user_profiles';

export type HostedMaintenanceAdapter = Readonly<{
  inspect(input: HostedInspectionInput): Promise<unknown>;
  removeObjects(paths: readonly string[]): Promise<void>;
  deleteRows(table: CleanupTable, ids: readonly string[]): Promise<void>;
  deleteAuthUsers(ids: readonly string[]): Promise<void>;
  assertAbsent(scenario: Required<PartialHostedScenario>): Promise<boolean>;
  close(): Promise<void>;
}>;

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validInspectionInput(value: unknown): value is HostedInspectionInput {
  if (!exactObject(value, [
    'ownerId', 'sightingId', 'mediaId', 'jobId', 'mediaAssetId',
    'sha256', 'byteLength', 'width', 'height',
  ])) return false;
  return [value.ownerId, value.sightingId, value.mediaId, value.jobId, value.mediaAssetId]
    .every((item) => typeof item === 'string' && UUID.test(item)) &&
    typeof value.sha256 === 'string' && SHA256.test(value.sha256) &&
    typeof value.byteLength === 'number' && Number.isInteger(value.byteLength) &&
    value.byteLength > 0 && value.byteLength <= 20 * 1024 * 1024 &&
    typeof value.width === 'number' && Number.isInteger(value.width) && value.width > 0 && value.width <= 2048 &&
    typeof value.height === 'number' && Number.isInteger(value.height) && value.height > 0 && value.height <= 2048;
}

function validInspection(value: unknown): value is HostedInspection {
  if (!exactObject(value, [
    'jobCount', 'matchingFinalizedJobCount', 'assetCount',
    'matchingQuarantinedAssetCount', 'stagingObjectExists',
  ])) return false;
  return [value.jobCount, value.matchingFinalizedJobCount, value.assetCount, value.matchingQuarantinedAssetCount]
    .every((count) => typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= 1) &&
    typeof value.stagingObjectExists === 'boolean';
}

function normalizeScenario(value: PartialHostedScenario): Required<PartialHostedScenario> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('hosted_cleanup_failed');
  const allowed = new Set([
    'createdUserIds', 'createdSightingIds', 'createdMediaIds',
    'createdJobIds', 'createdAssetIds', 'createdObjectPaths',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error('hosted_cleanup_failed');
  const uuidList = (candidate: readonly string[] | undefined): readonly string[] => {
    const list = candidate ?? [];
    if (!Array.isArray(list) || list.length > MAX_TRACKED || list.some((item) => typeof item !== 'string' || !UUID.test(item)) ||
        new Set(list).size !== list.length) throw new Error('hosted_cleanup_failed');
    return [...list];
  };
  const paths = value.createdObjectPaths ?? [];
  if (!Array.isArray(paths) || paths.length > MAX_TRACKED || paths.some((item) => typeof item !== 'string' || !OBJECT_PATH.test(item)) ||
      new Set(paths).size !== paths.length) throw new Error('hosted_cleanup_failed');
  return {
    createdUserIds: uuidList(value.createdUserIds),
    createdSightingIds: uuidList(value.createdSightingIds),
    createdMediaIds: uuidList(value.createdMediaIds),
    createdJobIds: uuidList(value.createdJobIds),
    createdAssetIds: uuidList(value.createdAssetIds),
    createdObjectPaths: [...paths],
  };
}

function createAdapter(env: HostedGateEnvironment): HostedMaintenanceAdapter {
  const sql = postgres(env.databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 15,
    prepare: false,
    ssl: 'require',
    debug: false,
    onnotice: () => undefined,
    connection: { statement_timeout: 8_000, lock_timeout: 1_000 },
  });
  const admin = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetchWithTimeout(input, init, 8_000) },
  });

  return {
    async inspect(input) {
      const rows = await sql<Array<{
        job_count: number; matching_finalized_job_count: number;
        asset_count: number; matching_quarantined_asset_count: number;
      }>>`
        with job_counts as (
          select count(*)::integer as job_count,
            count(*) filter (where uploader_id = ${input.ownerId}::uuid
              and sighting_id = ${input.sightingId}::uuid and id = ${input.jobId}::uuid
              and sha256 = ${input.sha256} and byte_length = ${input.byteLength}
              and width = ${input.width} and height = ${input.height}
              and status = 'finalized' and media_asset_id = ${input.mediaAssetId}::uuid
            )::integer as matching_finalized_job_count
          from private.media_upload_jobs where media_id = ${input.mediaId}
        ), asset_counts as (
          select count(*)::integer as asset_count,
            count(*) filter (where id = ${input.mediaAssetId}::uuid
              and uploader_id = ${input.ownerId}::uuid and sighting_id = ${input.sightingId}::uuid
              and sha256 = ${input.sha256} and byte_length = ${input.byteLength}
              and width = ${input.width} and height = ${input.height}
              and status = 'quarantined' and deleted_at is null
            )::integer as matching_quarantined_asset_count
          from public.media_assets where client_media_id = ${input.mediaId}
        )
        select * from job_counts cross join asset_counts
      `;
      const row = rows.length === 1 ? rows[0] : undefined;
      if (!row) throw new Error('inspect_failed');
      const { data: stagingObjectExists, error } = await admin.storage
        .from('media-staging').exists(`jobs/${input.jobId}.jpg`);
      if (error || typeof stagingObjectExists !== 'boolean') throw new Error('inspect_failed');
      return {
        jobCount: row.job_count,
        matchingFinalizedJobCount: row.matching_finalized_job_count,
        assetCount: row.asset_count,
        matchingQuarantinedAssetCount: row.matching_quarantined_asset_count,
        stagingObjectExists,
      };
    },
    async removeObjects(paths) {
      if (paths.length === 0) return;
      const { error } = await admin.storage.from('media-staging').remove([...paths]);
      if (error) throw new Error('object_cleanup_failed');
    },
    async deleteRows(table, ids) {
      if (ids.length === 0) return;
      if (table === 'media_upload_jobs') await sql`delete from private.media_upload_jobs where id = any(${ids}::uuid[])`;
      else if (table === 'media_assets') await sql`delete from public.media_assets where id = any(${ids}::uuid[])`;
      else if (table === 'sightings') await sql`delete from public.sightings where id = any(${ids}::uuid[])`;
      else if (table === 'user_profiles') await sql`delete from public.user_profiles where id = any(${ids}::uuid[])`;
      else throw new Error('invalid_cleanup_table');
    },
    async deleteAuthUsers(ids) {
      let failed = false;
      for (const id of ids) {
        const { error } = await admin.auth.admin.deleteUser(id).catch(() => ({ error: new Error('delete_failed') }));
        if (error) failed = true;
      }
      if (failed) throw new Error('auth_cleanup_failed');
    },
    async assertAbsent(scenario) {
      const rows = await sql<Array<{ tracked_count: number }>>`
        select (
          (select count(*) from private.media_upload_jobs where id = any(${scenario.createdJobIds}::uuid[]) or media_id = any(${scenario.createdMediaIds}::text[])) +
          (select count(*) from public.media_assets where id = any(${scenario.createdAssetIds}::uuid[]) or client_media_id = any(${scenario.createdMediaIds}::text[])) +
          (select count(*) from public.sightings where id = any(${scenario.createdSightingIds}::uuid[])) +
          (select count(*) from public.user_profiles where id = any(${scenario.createdUserIds}::uuid[]))
        )::integer as tracked_count
      `;
      if (rows.length !== 1 || rows[0]?.tracked_count !== 0) return false;
      for (const path of scenario.createdObjectPaths) {
        const { data, error } = await admin.storage.from('media-staging').exists(path);
        if (error || data !== false) return false;
      }
      for (const id of scenario.createdUserIds) {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data.user !== null) return false;
      }
      return true;
    },
    async close() {
      await sql.end({ timeout: 2 });
    },
  };
}

export async function inspectHostedMedia(
  env: HostedGateEnvironment,
  input: HostedInspectionInput,
  providedAdapter?: Pick<HostedMaintenanceAdapter, 'inspect'>,
): Promise<HostedInspection> {
  if (!validInspectionInput(input)) throw new Error('hosted_inspection_failed');
  const adapter = providedAdapter ?? createAdapter(env);
  try {
    const result = await adapter.inspect(input);
    if (!validInspection(result)) throw new Error('invalid');
    return result;
  } catch {
    throw new Error('hosted_inspection_failed');
  } finally {
    if (!providedAdapter && 'close' in adapter && typeof adapter.close === 'function') {
      await adapter.close().catch(() => undefined);
    }
  }
}

export async function cleanupHostedScenario(
  env: HostedGateEnvironment,
  scenario: PartialHostedScenario,
  providedAdapter?: HostedMaintenanceAdapter,
): Promise<void> {
  let adapter: HostedMaintenanceAdapter | undefined;
  try {
    const tracked = normalizeScenario(scenario);
    adapter = providedAdapter ?? createAdapter(env);
    await adapter.removeObjects(tracked.createdObjectPaths);
    await adapter.deleteRows('media_upload_jobs', tracked.createdJobIds);
    await adapter.deleteRows('media_assets', tracked.createdAssetIds);
    await adapter.deleteRows('sightings', tracked.createdSightingIds);
    await adapter.deleteRows('user_profiles', tracked.createdUserIds);
    await adapter.deleteAuthUsers(tracked.createdUserIds);
    if (!await adapter.assertAbsent(tracked)) throw new Error('absence_not_proven');
  } catch {
    throw new Error('hosted_cleanup_failed');
  } finally {
    await adapter?.close().catch(() => undefined);
  }
}
