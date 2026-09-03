import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

import { fetchWithTimeout } from '../../pilot-gate-2a/src/network.js';
import type { HostedGateEnvironment } from './environment.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const OBJECT_PATH = /^jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;
const MAX_TRACKED = 32;
const MAX_ISOLATION_ROWS = 16;

export const CLEANUP_OPERATION_IDS = [
  'setup', 'recover_auth', 'recover_sighting', 'storage_remove', 'jobs_delete', 'assets_delete',
  'sightings_delete', 'profiles_delete', 'auth_delete', 'absence_proof', 'connection_close',
] as const;
export type CleanupOperationId = typeof CLEANUP_OPERATION_IDS[number];

export const HOSTED_ISOLATION_STEPS = [
  'isolation_jobs', 'isolation_assets', 'isolation_objects', 'isolation_validation',
] as const;
export type HostedIsolationStep = typeof HOSTED_ISOLATION_STEPS[number];

export class HostedIsolationFailure extends Error {
  constructor(readonly isolationStep: HostedIsolationStep) {
    super('hosted_inspection_failed');
  }
}

export function hostedIsolationStepFromError(error: unknown): HostedIsolationStep | undefined {
  return error instanceof HostedIsolationFailure &&
    (HOSTED_ISOLATION_STEPS as readonly string[]).includes(error.isolationStep)
    ? error.isolationStep
    : undefined;
}

async function atIsolationStep<T>(step: HostedIsolationStep, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new HostedIsolationFailure(step);
  }
}

export class HostedCleanupFailure extends Error {
  readonly operationIds: readonly CleanupOperationId[];

  constructor(operationIds: readonly CleanupOperationId[]) {
    super('hosted_cleanup_failed');
    this.operationIds = CLEANUP_OPERATION_IDS.filter((operation) => operationIds.includes(operation));
  }
}

export function cleanupOperationIdsFromError(error: unknown): readonly CleanupOperationId[] | undefined {
  return error instanceof HostedCleanupFailure ? error.operationIds : undefined;
}

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

export type HostedIsolationInspectionInput = Readonly<{
  ownerId: string;
  strangerId: string;
  ownerSightingId: string;
  strangerSightingId: string;
  mediaIds: readonly string[];
  observedObjectPaths: readonly string[];
}>;

type HostedIsolationJob = Readonly<{
  id: string; uploaderId: string | null; sightingId: string; mediaId: string;
  sha256: string; byteLength: number; width: number; height: number;
  objectPath: string; status: string; mediaAssetId: string | null;
}>;

type HostedIsolationAsset = Readonly<{
  id: string; uploaderId: string | null; sightingId: string | null; clientMediaId: string | null;
  storageBucket: string; storagePath: string; sha256: string; byteLength: number | null;
  width: number | null; height: number | null; status: string; deletedAt: string | null;
}>;

export type HostedIsolationInspection = Readonly<{
  jobs: readonly HostedIsolationJob[];
  assets: readonly HostedIsolationAsset[];
  objectExists: readonly boolean[];
}>;

type HostedIsolationAdapter = Readonly<{
  inspectIsolation(input: HostedIsolationInspectionInput): Promise<unknown>;
}>;

type HostedInspectionSessionAdapter = HostedMaintenanceAdapter & HostedIsolationAdapter;

export type HostedInspectionSession = Readonly<{
  inspectMedia(input: HostedInspectionInput, signal?: AbortSignal): Promise<HostedInspection>;
  inspectIsolation(input: HostedIsolationInspectionInput, signal?: AbortSignal): Promise<HostedIsolationInspection>;
  cleanup(scenario: PartialHostedScenario): Promise<void>;
  close(): Promise<void>;
}>;

export type PartialHostedScenario = Readonly<{
  createdAuthRecoveryIds?: readonly string[];
  createdUserIds?: readonly string[];
  sightingRecoveryReferences?: readonly Readonly<{ reporterId: string; clientDedupeKey: string }>[];
  createdSightingIds?: readonly string[];
  createdMediaIds?: readonly string[];
  createdJobIds?: readonly string[];
  createdAssetIds?: readonly string[];
  createdObjectPaths?: readonly string[];
}>;

type CleanupTable = 'media_upload_jobs' | 'media_assets' | 'sightings' | 'user_profiles';

export type HostedMaintenanceAdapter = Readonly<{
  inspect(input: HostedInspectionInput): Promise<unknown>;
  recoverAuthUserIds(recoveryIds: readonly string[]): Promise<readonly string[]>;
  recoverSightingIds(references: readonly Readonly<{ reporterId: string; clientDedupeKey: string }>[])
    : Promise<readonly string[]>;
  removeObjects(paths: readonly string[]): Promise<void>;
  deleteRows(
    table: CleanupTable,
    ids: readonly string[],
    mediaIds?: readonly string[],
    ownerIds?: readonly string[],
  ): Promise<void>;
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

function validIsolationInput(value: unknown): value is HostedIsolationInspectionInput {
  if (!exactObject(value, [
    'ownerId', 'strangerId', 'ownerSightingId', 'strangerSightingId', 'mediaIds', 'observedObjectPaths',
  ])) return false;
  if (![value.ownerId, value.strangerId, value.ownerSightingId, value.strangerSightingId]
    .every((item) => typeof item === 'string' && UUID.test(item))) return false;
  if (value.ownerId === value.strangerId || value.ownerSightingId === value.strangerSightingId) return false;
  if (!Array.isArray(value.mediaIds) || value.mediaIds.length < 1 || value.mediaIds.length > 4 ||
      value.mediaIds.some((item) => typeof item !== 'string' || !UUID.test(item)) ||
      new Set(value.mediaIds).size !== value.mediaIds.length) return false;
  return Array.isArray(value.observedObjectPaths) && value.observedObjectPaths.length === 2 &&
    value.observedObjectPaths.every((item) => typeof item === 'string' && OBJECT_PATH.test(item)) &&
    new Set(value.observedObjectPaths).size === value.observedObjectPaths.length;
}

function sortedUniqueIds(rows: readonly unknown[]): boolean {
  const ids = rows.map((row) => row && typeof row === 'object' && 'id' in row ? (row as { id?: unknown }).id : null);
  return ids.every((id) => typeof id === 'string' && UUID.test(id)) &&
    new Set(ids).size === ids.length && ids.every((id, index) => index === 0 || String(ids[index - 1]) < String(id));
}

function validIsolationJob(value: unknown): value is HostedIsolationJob {
  if (!exactObject(value, [
    'id', 'uploaderId', 'sightingId', 'mediaId', 'sha256', 'byteLength', 'width', 'height',
    'objectPath', 'status', 'mediaAssetId',
  ])) return false;
  return UUID.test(String(value.id)) && (value.uploaderId === null || UUID.test(String(value.uploaderId))) &&
    UUID.test(String(value.sightingId)) && UUID.test(String(value.mediaId)) && SHA256.test(String(value.sha256)) &&
    Number.isInteger(value.byteLength) && Number(value.byteLength) > 0 && Number(value.byteLength) <= 20 * 1024 * 1024 &&
    Number.isInteger(value.width) && Number(value.width) > 0 && Number(value.width) <= 2048 &&
    Number.isInteger(value.height) && Number(value.height) > 0 && Number(value.height) <= 2048 &&
    OBJECT_PATH.test(String(value.objectPath)) && ['reserved', 'finalized', 'deletion_pending'].includes(String(value.status)) &&
    (value.mediaAssetId === null || UUID.test(String(value.mediaAssetId)));
}

function validIsolationAsset(value: unknown): value is HostedIsolationAsset {
  if (!exactObject(value, [
    'id', 'uploaderId', 'sightingId', 'clientMediaId', 'storageBucket', 'storagePath', 'sha256',
    'byteLength', 'width', 'height', 'status', 'deletedAt',
  ])) return false;
  return UUID.test(String(value.id)) && (value.uploaderId === null || UUID.test(String(value.uploaderId))) &&
    (value.sightingId === null || UUID.test(String(value.sightingId))) &&
    (value.clientMediaId === null || UUID.test(String(value.clientMediaId))) &&
    ['public-media', 'private-evidence', 'media-staging'].includes(String(value.storageBucket)) &&
    typeof value.storagePath === 'string' && value.storagePath.length > 0 && value.storagePath.length <= 256 &&
    SHA256.test(String(value.sha256)) &&
    (value.byteLength === null || (Number.isInteger(value.byteLength) && Number(value.byteLength) > 0 && Number(value.byteLength) <= 20 * 1024 * 1024)) &&
    (value.width === null || (Number.isInteger(value.width) && Number(value.width) > 0 && Number(value.width) <= 2048)) &&
    (value.height === null || (Number.isInteger(value.height) && Number(value.height) > 0 && Number(value.height) <= 2048)) &&
    value.status === 'quarantined' && (value.deletedAt === null || typeof value.deletedAt === 'string');
}

function validIsolationInspection(value: unknown, expectedObjects: number): value is HostedIsolationInspection {
  if (!exactObject(value, ['jobs', 'assets', 'objectExists']) || !Array.isArray(value.jobs) ||
      !Array.isArray(value.assets) || !Array.isArray(value.objectExists)) return false;
  return value.jobs.length <= MAX_ISOLATION_ROWS && value.assets.length <= MAX_ISOLATION_ROWS &&
    value.jobs.every(validIsolationJob) && value.assets.every(validIsolationAsset) &&
    sortedUniqueIds(value.jobs) && sortedUniqueIds(value.assets) && value.objectExists.length === expectedObjects &&
    value.objectExists.every((item) => typeof item === 'boolean');
}

function normalizeScenario(value: PartialHostedScenario): Required<PartialHostedScenario> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('hosted_cleanup_failed');
  const allowed = new Set([
    'createdAuthRecoveryIds', 'createdUserIds', 'sightingRecoveryReferences',
    'createdSightingIds', 'createdMediaIds',
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
  const references = value.sightingRecoveryReferences ?? [];
  if (!Array.isArray(references) || references.length > MAX_TRACKED || references.some((item) =>
    !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 2 ||
    !UUID.test(item.reporterId) || !/^pilot-gate-2b-(?:owner|stranger)-[a-f0-9]{32}$/i.test(item.clientDedupeKey)) ||
    new Set(references.map((item) => `${item.reporterId}:${item.clientDedupeKey}`)).size !== references.length) {
    throw new Error('hosted_cleanup_failed');
  }
  return {
    createdAuthRecoveryIds: uuidList(value.createdAuthRecoveryIds),
    createdUserIds: uuidList(value.createdUserIds),
    sightingRecoveryReferences: references.map((item) => ({ ...item })),
    createdSightingIds: uuidList(value.createdSightingIds),
    createdMediaIds: uuidList(value.createdMediaIds),
    createdJobIds: uuidList(value.createdJobIds),
    createdAssetIds: uuidList(value.createdAssetIds),
    createdObjectPaths: [...paths],
  };
}

function alreadyAbsentAuthUser(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' &&
    (error as Record<string, unknown>).status === 404 && (error as Record<string, unknown>).code === 'user_not_found');
}

function isStorageObjectAbsence(data: unknown, error: unknown): boolean {
  if (data !== false || !error || typeof error !== 'object' || Array.isArray(error)) return false;
  const storageError = error as Record<string, unknown>;
  if (storageError.__isStorageError !== true || storageError.name !== 'StorageUnknownError') return false;
  const originalError = storageError.originalError;
  if (!originalError || typeof originalError !== 'object' || Array.isArray(originalError)) return false;
  const status = (originalError as Record<string, unknown>).status;
  return status === 400 || status === 404;
}

export function createHostedMaintenanceAdapter(env: HostedGateEnvironment): HostedMaintenanceAdapter & HostedIsolationAdapter {
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
    async recoverAuthUserIds(recoveryIds) {
      if (recoveryIds.length === 0) return [];
      const rows = await sql<Array<{ id: string }>>`
        select id::text as id from auth.users
        where raw_user_meta_data ->> 'pilot_gate_2b_recovery_id' = any(${recoveryIds}::text[])
        order by id
      `;
      return rows.map((row) => row.id);
    },
    async recoverSightingIds(references) {
      if (references.length === 0) return [];
      const rows = await sql<Array<{ id: string }>>`
        select sighting.id::text as id
        from public.sightings as sighting
        join jsonb_to_recordset(${JSON.stringify(references)}::jsonb)
          as recovery("reporterId" text, "clientDedupeKey" text)
          on sighting.reporter_id = recovery."reporterId"::uuid
         and sighting.client_dedupe_key = recovery."clientDedupeKey"
        order by sighting.id
      `;
      return rows.map((row) => row.id);
    },
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
          from private.media_upload_jobs
          where media_id = ${input.mediaId} and uploader_id = ${input.ownerId}::uuid
        ), asset_counts as (
          select count(*)::integer as asset_count,
            count(*) filter (where id = ${input.mediaAssetId}::uuid
              and uploader_id = ${input.ownerId}::uuid and sighting_id = ${input.sightingId}::uuid
              and sha256 = ${input.sha256} and byte_length = ${input.byteLength}
              and width = ${input.width} and height = ${input.height}
              and status = 'quarantined' and deleted_at is null
            )::integer as matching_quarantined_asset_count
          from public.media_assets
          where client_media_id = ${input.mediaId} and uploader_id = ${input.ownerId}::uuid
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
    async inspectIsolation(input) {
      const userIds = [input.ownerId, input.strangerId];
      const sightingIds = [input.ownerSightingId, input.strangerSightingId];
      const jobs = await atIsolationStep('isolation_jobs', () => sql<HostedIsolationJob[]>`
        select id::text as id, uploader_id::text as "uploaderId", sighting_id::text as "sightingId",
          media_id as "mediaId", sha256, byte_length as "byteLength", width, height,
          object_path as "objectPath", status::text as status, media_asset_id::text as "mediaAssetId"
        from private.media_upload_jobs
        where sighting_id = any(${sightingIds}::uuid[])
           or (uploader_id = any(${userIds}::uuid[]) and media_id = any(${input.mediaIds}::text[]))
        order by id
        limit ${MAX_ISOLATION_ROWS + 1}
      `);
      const assets = await atIsolationStep('isolation_assets', () => sql<HostedIsolationAsset[]>`
        select id::text as id, uploader_id::text as "uploaderId", sighting_id::text as "sightingId",
          client_media_id as "clientMediaId", storage_bucket as "storageBucket", storage_path as "storagePath",
          sha256, byte_length as "byteLength", width, height, status, deleted_at::text as "deletedAt"
        from public.media_assets
        where sighting_id = any(${sightingIds}::uuid[])
           or (uploader_id = any(${userIds}::uuid[]) and client_media_id = any(${input.mediaIds}::text[]))
        order by id
        limit ${MAX_ISOLATION_ROWS + 1}
      `);
      const objectExists = await atIsolationStep('isolation_objects', async () => {
        const results: boolean[] = [];
        for (const objectPath of input.observedObjectPaths) {
          const { data, error } = await admin.storage.from('media-staging').exists(objectPath);
          if (data === true && error === null) results.push(true);
          else if (isStorageObjectAbsence(data, error)) results.push(false);
          else throw new Error('inspect_failed');
        }
        return results;
      });
      return { jobs, assets, objectExists };
    },
    async removeObjects(paths) {
      if (paths.length === 0) return;
      const { error } = await admin.storage.from('media-staging').remove([...paths]);
      if (error) throw new Error('object_cleanup_failed');
    },
    async deleteRows(table, ids, mediaIds = [], ownerIds = []) {
      if (ids.length === 0 && mediaIds.length === 0) return;
      if (table === 'media_upload_jobs') {
        await sql`delete from private.media_upload_jobs
          where id = any(${ids}::uuid[])
             or (media_id = any(${mediaIds}::text[]) and uploader_id = any(${ownerIds}::uuid[]))`;
      } else if (table === 'media_assets') {
        await sql`delete from public.media_assets
          where id = any(${ids}::uuid[])
             or (client_media_id = any(${mediaIds}::text[]) and uploader_id = any(${ownerIds}::uuid[]))`;
      }
      else if (table === 'sightings') await sql`delete from public.sightings where id = any(${ids}::uuid[])`;
      else if (table === 'user_profiles') await sql`delete from public.user_profiles where id = any(${ids}::uuid[])`;
      else throw new Error('invalid_cleanup_table');
    },
    async deleteAuthUsers(ids) {
      let failed = false;
      for (const id of ids) {
        const { error } = await admin.auth.admin.deleteUser(id).catch(() => ({ error: new Error('delete_failed') }));
        if (error && !alreadyAbsentAuthUser(error)) failed = true;
      }
      if (failed) throw new Error('auth_cleanup_failed');
    },
    async assertAbsent(scenario) {
      const rows = await sql<Array<{ tracked_count: number }>>`
        select (
          (select count(*) from private.media_upload_jobs where id = any(${scenario.createdJobIds}::uuid[])
            or (media_id = any(${scenario.createdMediaIds}::text[]) and uploader_id = any(${scenario.createdUserIds}::uuid[]))) +
          (select count(*) from public.media_assets where id = any(${scenario.createdAssetIds}::uuid[])
            or (client_media_id = any(${scenario.createdMediaIds}::text[]) and uploader_id = any(${scenario.createdUserIds}::uuid[]))) +
          (select count(*) from public.sightings where id = any(${scenario.createdSightingIds}::uuid[])) +
          (select count(*) from public.user_profiles where id = any(${scenario.createdUserIds}::uuid[])) +
          (select count(*) from auth.users where id = any(${scenario.createdUserIds}::uuid[])
            or raw_user_meta_data ->> 'pilot_gate_2b_recovery_id' = any(${scenario.createdAuthRecoveryIds}::text[])) +
          (select count(*) from storage.objects
            where bucket_id = 'media-staging' and name = any(${scenario.createdObjectPaths}::text[]))
        )::integer as tracked_count
      `;
      if (rows.length !== 1 || rows[0]?.tracked_count !== 0) return false;
      for (const reference of scenario.sightingRecoveryReferences) {
        const sightings = await sql<Array<{ tracked_count: number }>>`
          select count(*)::integer as tracked_count from public.sightings
          where reporter_id = ${reference.reporterId}::uuid
            and client_dedupe_key = ${reference.clientDedupeKey}
        `;
        if (sightings.length !== 1 || sightings[0]?.tracked_count !== 0) return false;
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
  const adapter = providedAdapter ?? createHostedMaintenanceAdapter(env);
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

export async function inspectHostedIsolationState(
  env: HostedGateEnvironment,
  input: HostedIsolationInspectionInput,
  providedAdapter?: HostedIsolationAdapter,
): Promise<HostedIsolationInspection> {
  if (!validIsolationInput(input)) throw new Error('hosted_inspection_failed');
  const adapter = providedAdapter ?? createHostedMaintenanceAdapter(env);
  try {
    const result = await adapter.inspectIsolation(input);
    if (!validIsolationInspection(result, input.observedObjectPaths.length)) {
      throw new HostedIsolationFailure('isolation_validation');
    }
    return result;
  } catch (error) {
    if (hostedIsolationStepFromError(error) !== undefined) throw error;
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
  let adapter: HostedMaintenanceAdapter | undefined = providedAdapter;
  const failed = new Set<CleanupOperationId>();
  const fail = (operation: CleanupOperationId) => { failed.add(operation); };
  try {
    const tracked = normalizeScenario(scenario);
    const proofSightingRecoveryReferences = tracked.sightingRecoveryReferences.map((reference) => ({
      reporterId: reference.reporterId,
      clientDedupeKey: reference.clientDedupeKey,
    }));
    const recoverySightingReferences = proofSightingRecoveryReferences.map((reference) => ({
      reporterId: reference.reporterId,
      clientDedupeKey: reference.clientDedupeKey,
    }));
    adapter ??= createHostedMaintenanceAdapter(env);
    let recoveredUserIds: readonly string[] = [];
    let recoveredSightingIds: readonly string[] = [];
    let provisionalSightingRecoveryFailure = false;
    try {
      const candidate = await adapter.recoverAuthUserIds(tracked.createdAuthRecoveryIds);
      if (!Array.isArray(candidate)) throw new Error('invalid_recovery_result');
      const count = candidate.length;
      if (!Number.isInteger(count) || count < 0 || count > MAX_TRACKED) {
        throw new Error('invalid_recovery_result');
      }
      const sanitized: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const id = candidate[index];
        if (typeof id !== 'string' || !UUID.test(id)) throw new Error('invalid_recovery_result');
        sanitized.push(id);
      }
      recoveredUserIds = sanitized;
    } catch {
      fail('recover_auth');
      recoveredUserIds = [];
    }
    try {
      const candidate = await adapter.recoverSightingIds(recoverySightingReferences);
      if (!Array.isArray(candidate)) throw new Error('invalid_recovery_result');
      const count = candidate.length;
      if (!Number.isInteger(count) || count < 0 || count > MAX_TRACKED) {
        throw new Error('invalid_recovery_result');
      }
      const sanitized: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const id = candidate[index];
        if (typeof id !== 'string' || !UUID.test(id)) throw new Error('invalid_recovery_result');
        sanitized.push(id);
      }
      recoveredSightingIds = sanitized;
    } catch {
      provisionalSightingRecoveryFailure = true;
      fail('recover_sighting');
      recoveredSightingIds = [];
    }
    const userIds = [...new Set([
      ...tracked.createdUserIds,
      ...recoveredUserIds.filter((id) => UUID.test(id)),
    ])].slice(0, MAX_TRACKED);
    const sightingIds = [...new Set([
      ...tracked.createdSightingIds,
      ...recoveredSightingIds.filter((id) => UUID.test(id)),
    ])].slice(0, MAX_TRACKED);
    const recovered = {
      ...tracked,
      createdUserIds: userIds,
      createdSightingIds: sightingIds,
      sightingRecoveryReferences: proofSightingRecoveryReferences,
    };
    const attempt = async (operationId: CleanupOperationId, operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch {
        fail(operationId);
      }
    };
    await attempt('storage_remove', () => adapter!.removeObjects(recovered.createdObjectPaths));
    await attempt('jobs_delete', () => adapter!.deleteRows(
      'media_upload_jobs', recovered.createdJobIds, recovered.createdMediaIds, recovered.createdUserIds,
    ));
    await attempt('assets_delete', () => adapter!.deleteRows(
      'media_assets', recovered.createdAssetIds, recovered.createdMediaIds, recovered.createdUserIds,
    ));
    await attempt('sightings_delete', () => adapter!.deleteRows('sightings', recovered.createdSightingIds));
    await attempt('profiles_delete', () => adapter!.deleteRows('user_profiles', recovered.createdUserIds));
    await attempt('auth_delete', () => adapter!.deleteAuthUsers(recovered.createdUserIds));
    try {
      if (await adapter.assertAbsent(recovered) === true) {
        if (provisionalSightingRecoveryFailure) failed.delete('recover_sighting');
      } else {
        fail('absence_proof');
      }
    } catch {
      fail('absence_proof');
    }
  } catch {
    fail('setup');
  } finally {
    try {
      await adapter?.close();
    } catch {
      fail('connection_close');
    }
  }
  if (failed.size > 0) {
    throw new HostedCleanupFailure(CLEANUP_OPERATION_IDS.filter((operation) => failed.has(operation)));
  }
}

export function createHostedInspectionSession(
  env: HostedGateEnvironment,
  providedAdapter?: HostedInspectionSessionAdapter,
): HostedInspectionSession {
  const adapter = providedAdapter ?? createHostedMaintenanceAdapter(env);
  let closed = false;
  const closeAdapter = async () => {
    if (closed) return;
    closed = true;
    await adapter.close();
  };
  const withinPhase = async <T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> => {
    if (!signal) return await operation();
    if (signal.aborted) {
      await closeAdapter().catch(() => undefined);
      throw new Error('hosted_inspection_failed');
    }
    let rejectAborted: ((error: Error) => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
    const onAbort = () => {
      void closeAdapter().catch(() => undefined);
      rejectAborted?.(new Error('hosted_inspection_failed'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await Promise.race([operation(), aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };
  return {
    inspectMedia: (input, signal) => withinPhase(signal, () => inspectHostedMedia(env, input, adapter)),
    inspectIsolation: (input, signal) => withinPhase(signal, () => inspectHostedIsolationState(env, input, adapter)),
    cleanup: async (scenario) => {
      try {
        await cleanupHostedScenario(env, scenario, adapter);
      } finally {
        closed = true;
      }
    },
    close: closeAdapter,
  };
}
