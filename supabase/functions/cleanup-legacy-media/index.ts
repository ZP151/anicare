import { createClient } from '@supabase/supabase-js';

import { processLegacyMediaDeletionJobs } from '../_shared/legacy-media-cleanup.ts';

const MAX_CLEANUP_JOBS = 25;

function bearerToken(request: Request): string | null {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+([^\s]{1,8192})$/i);
  return match?.[1] ?? null;
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  if ((request.headers.get('content-length') ?? '0') !== '0' || request.headers.has('content-type')) {
    return response({ error: 'invalid_request' }, 415);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = bearerToken(request);
  if (!supabaseUrl || !serviceRoleKey) return response({ error: 'service_unavailable' }, 503);
  if (!token || token.length !== serviceRoleKey.length || token !== serviceRoleKey) {
    return response({ error: 'authentication_required' }, 401);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await service.rpc('claim_legacy_media_deletion_jobs', { p_limit: MAX_CLEANUP_JOBS });
  if (error || !Array.isArray(data)) return response({ error: 'service_unavailable' }, 503);

  const outcome = await processLegacyMediaDeletionJobs(data, {
    remove: async (bucket, paths) => service.storage.from(bucket).remove(paths),
    complete: async (args) => service.rpc('complete_legacy_media_deletion_job', args),
  });
  return response(outcome, 200);
});
