import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { inspectJpeg } from '../_shared/jpeg-policy.ts';

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 8 * 1024;
const stableId = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;
const sha256 = /^[a-f0-9]{64}$/;

const requestSchema = z.object({
  sightingId: z.string().regex(stableId),
  mediaId: z.string().regex(stableId),
  sha256: z.string().regex(sha256),
}).strict();

type FinalizationJob = Readonly<{
  job_id: string;
  object_path: string;
  sha256: string;
  byte_length: number;
  width: number;
  height: number;
  recipe_version: string;
  detector_versions: Readonly<{ cats: 'unavailable'; people: 'unavailable'; plates: 'unavailable' }>;
  confirmed_at_local: string;
  expires_at: string;
  status: 'reserved' | 'cleanup_pending' | 'expired' | 'finalized';
  media_asset_id: string | null;
}>;

function allowedCors(request: Request): HeadersInit | null {
  const configuredOrigin = Deno.env.get('MEDIA_ALLOWED_ORIGIN');
  const origin = request.headers.get('origin');
  if (!configuredOrigin || (origin !== null && origin !== configuredOrigin)) return null;
  return {
    'Access-Control-Allow-Origin': origin ?? configuredOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(request: Request, body: unknown, status: number): Response {
  const cors = allowedCors(request);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(cors ?? {}), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function bearerToken(request: Request): string | null {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+([^\s]{1,8192})$/i);
  return match?.[1] ?? null;
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) {
    throw new Error('invalid_request');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_request');
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_REQUEST_BYTES) throw new Error('invalid_request');
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function isExactUnavailableDetectorMap(value: unknown): value is FinalizationJob['detector_versions'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const map = value as Record<string, unknown>;
  return Object.keys(map).length === 3 && map.cats === 'unavailable' && map.people === 'unavailable' && map.plates === 'unavailable';
}

function finalizationJob(value: unknown): FinalizationJob | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const job = value as Partial<FinalizationJob>;
  const validStatus = job.status === 'reserved' || job.status === 'cleanup_pending' || job.status === 'expired' || job.status === 'finalized';
  return typeof job.job_id === 'string' && stableId.test(job.job_id) &&
    typeof job.object_path === 'string' && job.object_path === `jobs/${job.job_id}.jpg` &&
    typeof job.sha256 === 'string' && sha256.test(job.sha256) &&
    typeof job.byte_length === 'number' && Number.isInteger(job.byte_length) && job.byte_length > 0 && job.byte_length <= MAX_MEDIA_BYTES &&
    typeof job.width === 'number' && Number.isInteger(job.width) && job.width > 0 && job.width <= 2048 &&
    typeof job.height === 'number' && Number.isInteger(job.height) && job.height > 0 && job.height <= 2048 &&
    job.recipe_version === 'jpeg-srgb-2048-q88.v1' && isExactUnavailableDetectorMap(job.detector_versions) &&
    typeof job.confirmed_at_local === 'string' && Number.isFinite(Date.parse(job.confirmed_at_local)) &&
    typeof job.expires_at === 'string' && Number.isFinite(Date.parse(job.expires_at)) && validStatus &&
    (job.media_asset_id === null || typeof job.media_asset_id === 'string')
    ? job as FinalizationJob
    : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  const cors = allowedCors(request);
  if (!cors) return new Response(null, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json(request, { error: 'invalid_request' }, 415);
  }

  const token = bearerToken(request);
  if (!token) return json(request, { error: 'authentication_required' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(request, { error: 'service_unavailable' }, 503);

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await readBoundedJson(request));
  } catch {
    return json(request, { error: 'invalid_request' }, 400);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: callerData, error: callerError } = await caller.auth.getUser(token);
  if (callerError || !callerData.user) return json(request, { error: 'authentication_required' }, 401);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await service
    .from('user_profiles')
    .select('id, adult_confirmed_at')
    .eq('id', callerData.user.id)
    .maybeSingle();
  const { data: sighting, error: sightingError } = await service
    .from('sightings')
    .select('id, reporter_id')
    .eq('id', payload.sightingId)
    .maybeSingle();
  if (profileError || !profile?.adult_confirmed_at || sightingError || sighting?.reporter_id !== callerData.user.id) {
    return json(request, { error: 'media_not_found_or_forbidden' }, 403);
  }

  const { data: jobData, error: jobError } = await service
    .rpc('get_media_upload_job_for_finalization', {
      p_uploader_id: callerData.user.id,
      p_sighting_id: payload.sightingId,
      p_media_id: payload.mediaId,
      p_sha256: payload.sha256,
    })
    .maybeSingle();
  const job = finalizationJob(jobData);
  if (jobError || !job) return json(request, { error: 'media_not_found_or_forbidden' }, 403);
  if (job.status === 'finalized' && job.media_asset_id) {
    return json(request, { mediaAssetId: job.media_asset_id, status: 'quarantined' }, 200);
  }
  if (job.status !== 'reserved' || Date.parse(job.expires_at) <= Date.now()) {
    return json(request, { error: 'media_finalization_conflict' }, 409);
  }

  const { data: blob, error: downloadError } = await service.storage.from('media-staging').download(job.object_path);
  if (downloadError || !blob || blob.size !== job.byte_length || blob.size > MAX_MEDIA_BYTES) {
    return json(request, { error: 'media_finalization_conflict' }, 409);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength !== job.byte_length || await sha256Hex(bytes) !== job.sha256) {
    return json(request, { error: 'media_finalization_conflict' }, 409);
  }
  try {
    const dimensions = inspectJpeg(bytes);
    if (dimensions.width !== job.width || dimensions.height !== job.height) {
      return json(request, { error: 'media_finalization_conflict' }, 409);
    }
  } catch {
    return json(request, { error: 'media_finalization_conflict' }, 409);
  }

  const { data: mediaAssetId, error: finalizeError } = await service.rpc('finalize_media_upload_job', {
    p_job_id: job.job_id,
    p_uploader_id: callerData.user.id,
    p_sighting_id: payload.sightingId,
    p_media_id: payload.mediaId,
    p_sha256: payload.sha256,
  });
  if (finalizeError || typeof mediaAssetId !== 'string') {
    return json(request, { error: 'media_finalization_conflict' }, 409);
  }
  return json(request, { mediaAssetId, status: 'quarantined' }, 200);
});
