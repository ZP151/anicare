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

type InspectionRow = Readonly<{
  asset_count_for_media_id: number;
  matching_quarantined_asset_count: number;
  job_count_for_media_id: number;
  matching_finalized_job_count: number;
}>;

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
