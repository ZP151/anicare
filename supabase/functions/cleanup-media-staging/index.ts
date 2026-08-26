import { createClient } from '@supabase/supabase-js';

const MAX_CLEANUP_JOBS = 25;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CleanupJob = Readonly<{ job_id: string; object_path: string; cleanup_claim_id: string }>;

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

function cleanupJob(value: unknown): CleanupJob | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const job = value as Partial<CleanupJob>;
  return typeof job.job_id === 'string' && uuid.test(job.job_id) &&
    typeof job.object_path === 'string' && job.object_path === `jobs/${job.job_id}.jpg` &&
    typeof job.cleanup_claim_id === 'string' && uuid.test(job.cleanup_claim_id)
    ? job as CleanupJob
    : null;
}

Deno.serve(async (request) => {
  const cors = allowedCors(request);
  if (!cors) return new Response(null, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  if ((request.headers.get('content-length') ?? '0') !== '0' || request.headers.has('content-type')) {
    return json(request, { error: 'invalid_request' }, 415);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = bearerToken(request);
  if (!supabaseUrl || !serviceRoleKey) return json(request, { error: 'service_unavailable' }, 503);
  if (!token || token.length !== serviceRoleKey.length || token !== serviceRoleKey) {
    return json(request, { error: 'authentication_required' }, 401);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await service.rpc('claim_expired_media_staging_jobs', { p_limit: MAX_CLEANUP_JOBS });
  if (error || !Array.isArray(data)) return json(request, { error: 'service_unavailable' }, 503);

  let removed = 0;
  for (const candidate of data) {
    const job = cleanupJob(candidate);
    if (!job) continue;
    const expectedPath = `jobs/${job.job_id}.jpg`;
    if (job.object_path !== expectedPath) continue;
    const { error: removeError } = await service.storage.from('media-staging').remove([expectedPath]);
    if (removeError) continue;
    const { error: completeError } = await service.rpc('complete_media_staging_cleanup', {
      p_job_id: job.job_id,
      p_object_path: expectedPath,
      p_cleanup_claim_id: job.cleanup_claim_id,
    });
    if (!completeError) removed += 1;
  }

  return json(request, { processed: data.length, removed }, 200);
});
