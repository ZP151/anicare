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

type InspectionRow = Readonly<{
  asset_count_for_media_id: number;
  matching_quarantined_asset_count: number;
  job_count_for_media_id: number;
  matching_finalized_job_count: number;
}>;

type TimestampUpdateRow = Readonly<{ updated_count: number }>;

type MediaLifecycleInspectionRow = Readonly<{
  job_count: number;
  asset_count: number;
  job_status: string;
  reservation_expired: boolean;
  upload_credential_watermark_in_future: boolean;
  cleanup_scheduled_in_future: boolean;
  cleanup_claimed: boolean;
  asset_tombstoned: boolean;
}>;

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

function lifecycleInspectionRow(value: unknown): value is MediaLifecycleInspectionRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<MediaLifecycleInspectionRow>;
  return boundedSingleCount(row.job_count) && boundedSingleCount(row.asset_count) &&
    lifecycleStatus(row.job_status) && typeof row.reservation_expired === 'boolean' &&
    typeof row.upload_credential_watermark_in_future === 'boolean' &&
    typeof row.cleanup_scheduled_in_future === 'boolean' && typeof row.cleanup_claimed === 'boolean' &&
    typeof row.asset_tombstoned === 'boolean';
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
    const rows = await sql<MediaLifecycleInspectionRow[]>`
      with target_job as (
        select j.*
        from private.media_upload_jobs j
        where j.id = ${input.jobId}::uuid
          and j.uploader_id = ${input.ownerId}::uuid
          and j.media_id = ${input.mediaId}
      )
      select
        count(distinct j.id)::integer as job_count,
        count(distinct m.id)::integer as asset_count,
        coalesce(max(j.status::text), 'missing') as job_status,
        coalesce(bool_or(j.reservation_expires_at <= now()), false) as reservation_expired,
        coalesce(bool_or(j.upload_token_expires_at > now()), false) as upload_credential_watermark_in_future,
        coalesce(bool_or(j.next_cleanup_at > now()), false) as cleanup_scheduled_in_future,
        coalesce(bool_or(j.cleanup_claimed_at is not null or j.cleanup_claim_id is not null), false) as cleanup_claimed,
        coalesce(bool_or(m.deleted_at is not null), false) as asset_tombstoned
      from target_job j
      left join public.media_assets m on m.id = j.media_asset_id
    `;
    const row = rows.length === 1 ? rows[0] : undefined;
    if (!lifecycleInspectionRow(row)) throw new Error('media_inspection_failed');

    const { data: stagingObjectExists } = await inspectionClient(env)
      .storage
      .from('media-staging')
      .exists(`jobs/${input.jobId}.jpg`);
    if (typeof stagingObjectExists !== 'boolean') throw new Error('media_inspection_failed');

    return {
      jobCount: row.job_count,
      assetCount: row.asset_count,
      jobStatus: row.job_status as MediaLifecycleInspection['jobStatus'],
      reservationExpired: row.reservation_expired,
      uploadCredentialWatermarkInFuture: row.upload_credential_watermark_in_future,
      cleanupScheduledInFuture: row.cleanup_scheduled_in_future,
      cleanupClaimed: row.cleanup_claimed,
      assetTombstoned: row.asset_tombstoned,
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
