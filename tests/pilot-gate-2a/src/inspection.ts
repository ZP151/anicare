import { createHash } from 'node:crypto';

import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

import type { LocalStackEnvironment } from './environment.js';
import { fetchWithTimeout } from './network.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export type FinalizedMediaInspectionInput = Readonly<{
  ownerId: string;
  sightingId: string;
  mediaId: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  mediaAssetId: string;
}>;

export type FinalizedMediaInspection = Readonly<{
  assetCountForMediaId: number;
  matchingQuarantinedAssetCount: number;
  jobCountForMediaId: number;
  matchingFinalizedJobCount: number;
}>;

export type StoredStagingObjectInspectionInput = Readonly<{
  jobId: string;
  sha256: string;
  byteLength: number;
}>;

export type StoredStagingObjectInspection = Readonly<{
  objectHashMatches: boolean;
  objectLengthMatches: boolean;
}>;

export type MediaLifecycleTimeControlInput = Readonly<{
  operation: 'expire_reservation' | 'schedule_cleanup_now';
  jobId: string;
  ownerId: string;
  mediaId: string;
}>;

export type MediaLifecycleInspectionInput = Readonly<{
  jobId: string;
  ownerId: string;
  mediaId: string;
}>;

export type MediaLifecycleInspection = Readonly<{
  jobCount: number;
  assetCount: number;
  jobStatus: 'missing' | 'reserved' | 'finalized' | 'deletion_pending';
  reservationExpired: boolean;
  uploadCredentialWatermarkInFuture: boolean;
  cleanupScheduledInFuture: boolean;
  cleanupClaimed: boolean;
  assetTombstoned: boolean;
  stagingObjectExists: boolean;
}>;

export type MediaConcurrencyInspectionInput = Readonly<{
  jobId: string;
  ownerId: string;
  sightingId: string;
  mediaId: string;
}>;

export type MediaConcurrencyInspection = Readonly<{
  jobCountForMediaId: number;
  matchingOwnerJobCount: number;
  distinctOwnerCount: number;
  distinctObjectPathCount: number;
  canonicalObjectPathCount: number;
  assetCountForMediaId: number;
  matchingOwnerSightingAssetCount: number;
  matchingJobAssetCount: number;
  activeQuarantinedAssetCount: number;
  tombstonedAssetCount: number;
  jobStatus: 'missing' | 'reserved' | 'finalized' | 'deletion_pending';
  cleanupClaimed: boolean;
  stagingObjectExists: boolean;
}>;

type InspectionRow = Readonly<{
  asset_count_for_media_id: number;
  matching_quarantined_asset_count: number;
  job_count_for_media_id: number;
  matching_finalized_job_count: number;
}>;

type TimestampUpdateRow = Readonly<{ updated_count: number }>;

type MediaLifecycleJobInspectionRow = Readonly<{
  job_count: number;
  job_status: string;
  reservation_expired: boolean;
  upload_credential_watermark_in_future: boolean;
  cleanup_scheduled_in_future: boolean;
  cleanup_claimed: boolean;
}>;

type MediaLifecycleAssetInspectionRow = Readonly<{
  asset_count: number;
  asset_tombstoned: boolean;
}>;

type MediaConcurrencyJobInspectionRow = Readonly<{
  job_count_for_media_id: number;
  matching_owner_job_count: number;
  distinct_owner_count: number;
  distinct_object_path_count: number;
  canonical_object_path_count: number;
  target_job_status: string;
  cleanup_claimed: boolean;
}>;

type MediaConcurrencyAssetInspectionRow = Readonly<{
  asset_count_for_media_id: number;
  matching_owner_sighting_asset_count: number;
  matching_job_asset_count: number;
  active_quarantined_asset_count: number;
  tombstoned_asset_count: number;
}>;

type MediaLifecycleDatabaseInspection = Omit<MediaLifecycleInspection, 'stagingObjectExists'>;
type MediaConcurrencyDatabaseInspection = Omit<MediaConcurrencyInspection, 'stagingObjectExists'>;

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function isMediaLifecycleTimeControlInput(value: unknown): value is MediaLifecycleTimeControlInput {
  if (!exactObject(value, ['operation', 'jobId', 'ownerId', 'mediaId'])) return false;
  return (value.operation === 'expire_reservation' || value.operation === 'schedule_cleanup_now') &&
    typeof value.jobId === 'string' && UUID.test(value.jobId) &&
    typeof value.ownerId === 'string' && UUID.test(value.ownerId) &&
    typeof value.mediaId === 'string' && UUID.test(value.mediaId);
}

function validMediaLifecycleInspectionInput(value: unknown): value is MediaLifecycleInspectionInput {
  if (!exactObject(value, ['jobId', 'ownerId', 'mediaId'])) return false;
  return typeof value.jobId === 'string' && UUID.test(value.jobId) &&
    typeof value.ownerId === 'string' && UUID.test(value.ownerId) &&
    typeof value.mediaId === 'string' && UUID.test(value.mediaId);
}

function validMediaConcurrencyInspectionInput(value: unknown): value is MediaConcurrencyInspectionInput {
  if (!exactObject(value, ['jobId', 'ownerId', 'sightingId', 'mediaId'])) return false;
  return typeof value.jobId === 'string' && UUID.test(value.jobId) &&
    typeof value.ownerId === 'string' && UUID.test(value.ownerId) &&
    typeof value.sightingId === 'string' && UUID.test(value.sightingId) &&
    typeof value.mediaId === 'string' && UUID.test(value.mediaId);
}

function validInput(input: FinalizedMediaInspectionInput): boolean {
  return UUID.test(input.ownerId) && UUID.test(input.sightingId) && UUID.test(input.mediaId) &&
    UUID.test(input.mediaAssetId) && SHA256.test(input.sha256) &&
    Number.isInteger(input.byteLength) && input.byteLength > 0 && input.byteLength <= 20 * 1024 * 1024 &&
    Number.isInteger(input.width) && input.width > 0 && input.width <= 2048 &&
    Number.isInteger(input.height) && input.height > 0 && input.height <= 2048;
}

function boundedCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2;
}

function boundedSingleCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1;
}

function lifecycleStatus(value: unknown): value is MediaLifecycleInspection['jobStatus'] {
  return value === 'missing' || value === 'reserved' || value === 'finalized' || value === 'deletion_pending';
}

function lifecycleJobInspectionRow(value: unknown): value is MediaLifecycleJobInspectionRow {
  if (!exactObject(value, [
    'job_count', 'job_status', 'reservation_expired', 'upload_credential_watermark_in_future',
    'cleanup_scheduled_in_future', 'cleanup_claimed',
  ])) return false;
  return boundedSingleCount(value.job_count) && lifecycleStatus(value.job_status) &&
    typeof value.reservation_expired === 'boolean' &&
    typeof value.upload_credential_watermark_in_future === 'boolean' &&
    typeof value.cleanup_scheduled_in_future === 'boolean' && typeof value.cleanup_claimed === 'boolean';
}

function lifecycleAssetInspectionRow(value: unknown): value is MediaLifecycleAssetInspectionRow {
  if (!exactObject(value, ['asset_count', 'asset_tombstoned'])) return false;
  return boundedSingleCount(value.asset_count) && typeof value.asset_tombstoned === 'boolean' &&
    (value.asset_count === 1 || value.asset_tombstoned === false);
}

function mediaConcurrencyJobInspectionRow(value: unknown): value is MediaConcurrencyJobInspectionRow {
  if (!exactObject(value, [
    'job_count_for_media_id', 'matching_owner_job_count', 'distinct_owner_count',
    'distinct_object_path_count', 'canonical_object_path_count', 'target_job_status', 'cleanup_claimed',
  ])) return false;
  if (!boundedCount(value.job_count_for_media_id) || !boundedCount(value.matching_owner_job_count) ||
      !boundedCount(value.distinct_owner_count) || !boundedCount(value.distinct_object_path_count) ||
      !boundedCount(value.canonical_object_path_count) || !lifecycleStatus(value.target_job_status) ||
      typeof value.cleanup_claimed !== 'boolean') return false;
  return value.matching_owner_job_count <= value.job_count_for_media_id &&
    value.distinct_owner_count <= value.job_count_for_media_id &&
    value.distinct_object_path_count <= value.job_count_for_media_id &&
    value.canonical_object_path_count <= value.job_count_for_media_id &&
    (value.matching_owner_job_count > 0 || value.target_job_status === 'missing');
}

function mediaConcurrencyAssetInspectionRow(value: unknown): value is MediaConcurrencyAssetInspectionRow {
  if (!exactObject(value, [
    'asset_count_for_media_id', 'matching_owner_sighting_asset_count', 'matching_job_asset_count',
    'active_quarantined_asset_count', 'tombstoned_asset_count',
  ])) return false;
  if (!boundedCount(value.asset_count_for_media_id) ||
      !boundedCount(value.matching_owner_sighting_asset_count) ||
      !boundedCount(value.matching_job_asset_count) ||
      !boundedCount(value.active_quarantined_asset_count) || !boundedCount(value.tombstoned_asset_count)) return false;
  return value.matching_owner_sighting_asset_count <= value.asset_count_for_media_id &&
    value.matching_job_asset_count <= value.matching_owner_sighting_asset_count &&
    value.active_quarantined_asset_count + value.tombstoned_asset_count <= value.asset_count_for_media_id;
}

export function combineMediaConcurrencyDatabaseInspection(
  jobValue: unknown,
  assetValue: unknown,
): MediaConcurrencyDatabaseInspection | null {
  if (!mediaConcurrencyJobInspectionRow(jobValue) || !mediaConcurrencyAssetInspectionRow(assetValue)) return null;
  return {
    jobCountForMediaId: jobValue.job_count_for_media_id,
    matchingOwnerJobCount: jobValue.matching_owner_job_count,
    distinctOwnerCount: jobValue.distinct_owner_count,
    distinctObjectPathCount: jobValue.distinct_object_path_count,
    canonicalObjectPathCount: jobValue.canonical_object_path_count,
    assetCountForMediaId: assetValue.asset_count_for_media_id,
    matchingOwnerSightingAssetCount: assetValue.matching_owner_sighting_asset_count,
    matchingJobAssetCount: assetValue.matching_job_asset_count,
    activeQuarantinedAssetCount: assetValue.active_quarantined_asset_count,
    tombstonedAssetCount: assetValue.tombstoned_asset_count,
    jobStatus: jobValue.target_job_status as MediaConcurrencyInspection['jobStatus'],
    cleanupClaimed: jobValue.cleanup_claimed,
  };
}

export function combineMediaLifecycleDatabaseInspection(
  jobValue: unknown,
  assetValue: unknown,
): MediaLifecycleDatabaseInspection | null {
  if (!lifecycleJobInspectionRow(jobValue) || !lifecycleAssetInspectionRow(assetValue)) return null;
  return {
    jobCount: jobValue.job_count,
    assetCount: assetValue.asset_count,
    jobStatus: jobValue.job_status as MediaLifecycleInspection['jobStatus'],
    reservationExpired: jobValue.reservation_expired,
    uploadCredentialWatermarkInFuture: jobValue.upload_credential_watermark_in_future,
    cleanupScheduledInFuture: jobValue.cleanup_scheduled_in_future,
    cleanupClaimed: jobValue.cleanup_claimed,
    assetTombstoned: assetValue.asset_tombstoned,
  };
}

function validStoredObjectInput(input: StoredStagingObjectInspectionInput): boolean {
  return UUID.test(input.jobId) && SHA256.test(input.sha256) &&
    Number.isInteger(input.byteLength) && input.byteLength > 0 && input.byteLength <= 20 * 1024 * 1024;
}

function inspectionClient(env: LocalStackEnvironment) {
  return createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetchWithTimeout(input, init, 5_000) },
  });
}

export async function inspectStoredStagingObject(
  env: LocalStackEnvironment,
  input: StoredStagingObjectInspectionInput,
): Promise<StoredStagingObjectInspection> {
  if (!validStoredObjectInput(input)) throw new Error('media_inspection_failed');
  try {
    const { data, error } = await inspectionClient(env)
      .storage
      .from('media-staging')
      .download(`jobs/${input.jobId}.jpg`);
    if (error || !data || data.size < 1 || data.size > 20 * 1024 * 1024) {
      throw new Error('media_inspection_failed');
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    const observedHash = createHash('sha256').update(bytes).digest('hex');
    return {
      objectHashMatches: observedHash === input.sha256,
      objectLengthMatches: bytes.byteLength === input.byteLength,
    };
  } catch {
    throw new Error('media_inspection_failed');
  }
}

export async function controlMediaLifecycleTimestamps(
  env: LocalStackEnvironment,
  input: MediaLifecycleTimeControlInput,
): Promise<void> {
  if (!isMediaLifecycleTimeControlInput(input)) throw new Error('media_time_control_failed');
  const sql = postgres(env.databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 10,
    prepare: false,
    debug: false,
    onnotice: () => undefined,
    connection: { statement_timeout: 5_000, lock_timeout: 1_000 },
  });
  try {
    const rows = input.operation === 'expire_reservation'
      ? await sql<TimestampUpdateRow[]>`
          update private.media_upload_jobs
          set reserved_at = now() - interval '2 minutes',
              reservation_expires_at = now() - interval '1 minute',
              next_cleanup_at = now() - interval '1 minute',
              updated_at = now()
          where id = ${input.jobId}::uuid
            and uploader_id = ${input.ownerId}::uuid
            and media_id = ${input.mediaId}
          returning 1::integer as updated_count
        `
      : await sql<TimestampUpdateRow[]>`
          update private.media_upload_jobs
          set next_cleanup_at = now() - interval '1 minute',
              updated_at = now()
          where id = ${input.jobId}::uuid
            and uploader_id = ${input.ownerId}::uuid
            and media_id = ${input.mediaId}
          returning 1::integer as updated_count
        `;
    if (rows.length !== 1 || rows[0]?.updated_count !== 1) throw new Error('media_time_control_failed');
  } catch {
    throw new Error('media_time_control_failed');
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

export async function inspectMediaConcurrency(
  env: LocalStackEnvironment,
  input: MediaConcurrencyInspectionInput,
): Promise<MediaConcurrencyInspection> {
  if (!validMediaConcurrencyInspectionInput(input)) throw new Error('media_inspection_failed');
  const sql = postgres(env.databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 10,
    prepare: false,
    debug: false,
    onnotice: () => undefined,
    connection: { statement_timeout: 5_000, lock_timeout: 1_000 },
  });
  try {
    const jobRows = await sql<MediaConcurrencyJobInspectionRow[]>`
      with media_jobs as (
        select j.*
        from private.media_upload_jobs j
        where j.media_id = ${input.mediaId}
      ), target_job as (
        select j.*
        from media_jobs j
        where j.id = ${input.jobId}::uuid
          and j.uploader_id = ${input.ownerId}::uuid
      )
      select
        count(j.id)::integer as job_count_for_media_id,
        count(j.id) filter (where j.uploader_id = ${input.ownerId}::uuid)::integer as matching_owner_job_count,
        count(distinct j.uploader_id)::integer as distinct_owner_count,
        count(distinct j.object_path)::integer as distinct_object_path_count,
        count(j.id) filter (where j.object_path = 'jobs/' || j.id::text || '.jpg')::integer as canonical_object_path_count,
        coalesce((select max(t.status::text) from target_job t), 'missing') as target_job_status,
        coalesce((select bool_or(t.cleanup_claimed_at is not null or t.cleanup_claim_id is not null) from target_job t), false) as cleanup_claimed
      from media_jobs j
    `;
    const assetRows = await sql<MediaConcurrencyAssetInspectionRow[]>`
      with target_job as (
        select j.*
        from private.media_upload_jobs j
        where j.id = ${input.jobId}::uuid
          and j.uploader_id = ${input.ownerId}::uuid
          and j.media_id = ${input.mediaId}
      )
      select
        count(m.id)::integer as asset_count_for_media_id,
        count(m.id) filter (where
          m.uploader_id = ${input.ownerId}::uuid
          and m.sighting_id = ${input.sightingId}::uuid
        )::integer as matching_owner_sighting_asset_count,
        count(m.id) filter (where exists (
          select 1 from target_job j
          where j.media_asset_id = m.id
            and m.storage_bucket = 'media-staging'
            and m.storage_path = j.object_path
        ))::integer as matching_job_asset_count,
        count(m.id) filter (where m.status = 'quarantined' and m.deleted_at is null)::integer as active_quarantined_asset_count,
        count(m.id) filter (where m.deleted_at is not null)::integer as tombstoned_asset_count
      from public.media_assets m
      where m.client_media_id = ${input.mediaId}
    `;
    const databaseInspection = combineMediaConcurrencyDatabaseInspection(
      jobRows.length === 1 ? jobRows[0] : undefined,
      assetRows.length === 1 ? assetRows[0] : undefined,
    );
    if (!databaseInspection) throw new Error('media_inspection_failed');

    const { data: stagingObjectExists } = await inspectionClient(env)
      .storage
      .from('media-staging')
      .exists(`jobs/${input.jobId}.jpg`);
    if (typeof stagingObjectExists !== 'boolean') throw new Error('media_inspection_failed');
    return { ...databaseInspection, stagingObjectExists };
  } catch {
    throw new Error('media_inspection_failed');
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

export async function inspectMediaLifecycle(
  env: LocalStackEnvironment,
  input: MediaLifecycleInspectionInput,
): Promise<MediaLifecycleInspection> {
  if (!validMediaLifecycleInspectionInput(input)) throw new Error('media_inspection_failed');
  const sql = postgres(env.databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 10,
    prepare: false,
    debug: false,
    onnotice: () => undefined,
    connection: { statement_timeout: 5_000, lock_timeout: 1_000 },
  });
  try {
    const jobRows = await sql<MediaLifecycleJobInspectionRow[]>`
      with target_job as (
        select j.*
        from private.media_upload_jobs j
        where j.id = ${input.jobId}::uuid
          and j.uploader_id = ${input.ownerId}::uuid
          and j.media_id = ${input.mediaId}
      )
      select
        count(j.id)::integer as job_count,
        coalesce(max(j.status::text), 'missing') as job_status,
        coalesce(bool_or(j.reservation_expires_at <= now()), false) as reservation_expired,
        coalesce(bool_or(j.upload_token_expires_at > now()), false) as upload_credential_watermark_in_future,
        coalesce(bool_or(j.next_cleanup_at > now()), false) as cleanup_scheduled_in_future,
        coalesce(bool_or(j.cleanup_claimed_at is not null or j.cleanup_claim_id is not null), false) as cleanup_claimed
      from target_job j
    `;
    const assetRows = await sql<MediaLifecycleAssetInspectionRow[]>`
      select
        count(m.id)::integer as asset_count,
        coalesce(bool_or(m.deleted_at is not null), false) as asset_tombstoned
      from public.media_assets m
      where m.uploader_id = ${input.ownerId}::uuid
        and m.client_media_id = ${input.mediaId}
    `;
    const databaseInspection = combineMediaLifecycleDatabaseInspection(
      jobRows.length === 1 ? jobRows[0] : undefined,
      assetRows.length === 1 ? assetRows[0] : undefined,
    );
    if (!databaseInspection) throw new Error('media_inspection_failed');

    const { data: stagingObjectExists } = await inspectionClient(env)
      .storage
      .from('media-staging')
      .exists(`jobs/${input.jobId}.jpg`);
    if (typeof stagingObjectExists !== 'boolean') throw new Error('media_inspection_failed');

    return {
      ...databaseInspection,
      stagingObjectExists,
    };
  } catch {
    throw new Error('media_inspection_failed');
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

export async function inspectFinalizedMedia(
  env: LocalStackEnvironment,
  input: FinalizedMediaInspectionInput,
): Promise<FinalizedMediaInspection> {
  if (!validInput(input)) throw new Error('media_inspection_failed');
  const sql = postgres(env.databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 10,
    prepare: false,
    debug: false,
    onnotice: () => undefined,
    connection: { statement_timeout: 5_000, lock_timeout: 1_000 },
  });
  try {
    const rows = await sql<InspectionRow[]>`
      with asset_counts as (
        select
          count(*)::integer as asset_count_for_media_id,
          count(*) filter (where
            id = ${input.mediaAssetId}::uuid
            and uploader_id = ${input.ownerId}::uuid
            and sighting_id = ${input.sightingId}::uuid
            and sha256 = ${input.sha256}
            and byte_length = ${input.byteLength}
            and width = ${input.width}
            and height = ${input.height}
            and recipe_version = 'jpeg-srgb-2048-q88.v1'
            and detector_versions = '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb
            and status = 'quarantined'
            and deleted_at is null
          )::integer as matching_quarantined_asset_count
        from public.media_assets
        where client_media_id = ${input.mediaId}
          and uploader_id = ${input.ownerId}::uuid
      ), job_counts as (
        select
          count(*)::integer as job_count_for_media_id,
          count(*) filter (where
            uploader_id = ${input.ownerId}::uuid
            and sighting_id = ${input.sightingId}::uuid
            and sha256 = ${input.sha256}
            and byte_length = ${input.byteLength}
            and width = ${input.width}
            and height = ${input.height}
            and recipe_version = 'jpeg-srgb-2048-q88.v1'
            and detector_versions = '{"cats":"unavailable","people":"unavailable","plates":"unavailable"}'::jsonb
            and status = 'finalized'
            and media_asset_id = ${input.mediaAssetId}::uuid
          )::integer as matching_finalized_job_count
        from private.media_upload_jobs
        where media_id = ${input.mediaId}
          and uploader_id = ${input.ownerId}::uuid
      )
      select
        asset_count_for_media_id,
        matching_quarantined_asset_count,
        job_count_for_media_id,
        matching_finalized_job_count
      from asset_counts cross join job_counts
    `;
    const row = rows.length === 1 ? rows[0] : undefined;
    if (!row || !boundedCount(row.asset_count_for_media_id) ||
        !boundedCount(row.matching_quarantined_asset_count) ||
        !boundedCount(row.job_count_for_media_id) ||
        !boundedCount(row.matching_finalized_job_count)) {
      throw new Error('media_inspection_failed');
    }
    return {
      assetCountForMediaId: row.asset_count_for_media_id,
      matchingQuarantinedAssetCount: row.matching_quarantined_asset_count,
      jobCountForMediaId: row.job_count_for_media_id,
      matchingFinalizedJobCount: row.matching_finalized_job_count,
    };
  } catch {
    throw new Error('media_inspection_failed');
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}
