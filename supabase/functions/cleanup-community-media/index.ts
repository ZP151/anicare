import { createClient } from '@supabase/supabase-js';

import { COMMUNITY_MEDIA_BUCKET } from '../_shared/community-media-handler.ts';
import { processCommunityMediaCleanup } from '../_shared/community-media-cleanup.ts';

function response(body: unknown, status: number): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
function bearer(request: Request): string | null { return request.headers.get('authorization')?.match(/^Bearer\s+([^\s]{1,8192})$/i)?.[1] ?? null; }

Deno.serve(async request => {
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  if ((request.headers.get('content-length') ?? '0') !== '0' || request.headers.has('content-type')) return response({ error: 'invalid_request' }, 415);
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return response({ error: 'service_unavailable' }, 503);
  const supplied = bearer(request); if (!supplied || supplied.length !== key.length || supplied !== key) return response({ error: 'authentication_required' }, 401);
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.rpc('claim_community_media_cleanup_jobs', { p_limit: 25 });
  if (error || !Array.isArray(data)) return response({ error: 'service_unavailable' }, 503);
  const outcome = await processCommunityMediaCleanup(data, {
    remove: async paths => !(await service.storage.from(COMMUNITY_MEDIA_BUCKET).remove([...paths])).error,
    complete: async (jobId, claimId) => !(await service.rpc('complete_community_media_cleanup_job', { p_job_id: jobId, p_claim_id: claimId })).error,
  });
  return response(outcome, 200);
});
