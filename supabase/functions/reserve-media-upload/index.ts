import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  canonicalizeTimestamp,
  deriveConservativeUploadCredentialUsableUntil,
  rewriteVerifiedSignedUploadUrl,
} from '../_shared/media-staging-lifecycle.ts';

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 32 * 1024;
const stableId = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;
const sha256 = /^[a-f0-9]{64}$/;

const requestSchema = z.object({
  sightingId: z.string().regex(stableId),
  mediaId: z.string().regex(stableId),
  sha256: z.string().regex(sha256),
  byteLength: z.number().int().min(1).max(MAX_MEDIA_BYTES),
  review: z.object({
    recipeVersion: z.literal('jpeg-srgb-2048-q88.v1'),
    detectorVersions: z.object({
      cats: z.literal('unavailable'),
      people: z.literal('unavailable'),
      plates: z.literal('unavailable'),
    }).strict(),
    width: z.number().int().min(1).max(2048),
    height: z.number().int().min(1).max(2048),
    confirmedAtLocal: z.iso.datetime({ offset: true }),
  }).strict(),
}).strict();

type ReservationRow = Readonly<{
  job_id: string;
  object_path: string;
  reservation_expires_at: string;
  finalized_media_asset_id: string | null;
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

function reservationRow(value: unknown): ReservationRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Partial<ReservationRow>;
  const reservationExpiresAt = canonicalizeTimestamp(row.reservation_expires_at);
  return typeof row.job_id === 'string' && stableId.test(row.job_id) &&
    typeof row.object_path === 'string' && row.object_path === `jobs/${row.job_id}.jpg` &&
    reservationExpiresAt !== null &&
    (row.finalized_media_asset_id === null || typeof row.finalized_media_asset_id === 'string')
    ? { ...row, reservation_expires_at: reservationExpiresAt } as ReservationRow
    : null;
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
  const mediaAllowedOrigin = Deno.env.get('MEDIA_ALLOWED_ORIGIN');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !mediaAllowedOrigin) {
    return json(request, { error: 'service_unavailable' }, 503);
  }

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
  if (profileError || !profile?.adult_confirmed_at) return json(request, { error: 'media_not_found_or_forbidden' }, 403);

  const { data: sighting, error: sightingError } = await service
    .from('sightings')
    .select('id, reporter_id')
    .eq('id', payload.sightingId)
    .maybeSingle();
  if (sightingError || sighting?.reporter_id !== callerData.user.id) {
    return json(request, { error: 'media_not_found_or_forbidden' }, 403);
  }

  const { data: reservation, error: reservationError } = await service
    .rpc('reserve_media_upload_job', {
      p_uploader_id: callerData.user.id,
      p_sighting_id: payload.sightingId,
      p_media_id: payload.mediaId,
      p_sha256: payload.sha256,
      p_byte_length: payload.byteLength,
      p_width: payload.review.width,
      p_height: payload.review.height,
      p_recipe_version: payload.review.recipeVersion,
      p_detector_versions: payload.review.detectorVersions,
      p_confirmed_at_local: payload.review.confirmedAtLocal,
    })
    .maybeSingle();
  const row = reservationRow(reservation);
  if (reservationError || !row || row.finalized_media_asset_id !== null) {
    return json(request, { error: 'media_reservation_conflict' }, 409);
  }

  const signedUploadRequestStartedAt = new Date();
  const { data: signedUpload, error: signedUploadError } = await service.storage
    .from('media-staging')
    .createSignedUploadUrl(row.object_path, { upsert: false });
  if (signedUploadError || !signedUpload?.signedUrl || !signedUpload.token) {
    return json(request, { error: 'service_unavailable' }, 503);
  }
  const clientSignedUploadUrl = rewriteVerifiedSignedUploadUrl({
    internalSupabaseUrl: supabaseUrl,
    allowedOrigin: mediaAllowedOrigin,
    objectPath: row.object_path,
    signedUrl: signedUpload.signedUrl,
    token: signedUpload.token,
  });
  if (clientSignedUploadUrl === null) {
    return json(request, { error: 'service_unavailable' }, 503);
  }

  // Storage's fixed token lifetime starts during this call but the API does
  // not report the precise mint instant. The pre-call lower bound is safe to
  // return and record because it can never outlive the actual token.
  const uploadCredentialUsableUntil = deriveConservativeUploadCredentialUsableUntil(signedUploadRequestStartedAt).toISOString();
  const { data: recordedExpiry, error: recordError } = await service.rpc('record_media_upload_token_expiry', {
    p_job_id: row.job_id,
    p_uploader_id: callerData.user.id,
    p_upload_token_expires_at: uploadCredentialUsableUntil,
  });
  if (recordError || canonicalizeTimestamp(recordedExpiry) === null) {
    return json(request, { error: 'service_unavailable' }, 503);
  }

  return json(request, {
    jobId: row.job_id,
    mediaId: payload.mediaId,
    reservationExpiresAt: row.reservation_expires_at,
    // This response is deliberately this request's pre-mint bound, not the
    // monotonic cleanup watermark returned by the recording RPC.
    uploadCredentialUsableUntil,
    upload: { signedUrl: clientSignedUploadUrl, token: signedUpload.token },
  }, 201);
});
