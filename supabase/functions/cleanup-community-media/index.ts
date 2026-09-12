import { createClient } from '@supabase/supabase-js';

import { COMMUNITY_MEDIA_BUCKET } from '../_shared/community-media-handler.ts';
import { processCommunityMediaCleanup } from '../_shared/community-media-cleanup.ts';
import { authorizeCleanupRequest, validCleanupBody } from '../_shared/community-cleanup-request.ts';

function response(body: unknown, status: number): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }

Deno.serve(async request => {
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return response({ error: 'service_unavailable' }, 503);
  if (!await authorizeCleanupRequest(request, key, Deno.env.get('COMMUNITY_MEDIA_CLEANUP_TOKEN'))) return response({ error: 'authentication_required' }, 401);
  if (!await validCleanupBody(request)) return response({ error: 'invalid_request' }, 415);
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.rpc('claim_community_media_cleanup_jobs', { p_limit: 25 });
  if (error || !Array.isArray(data)) return response({ error: 'service_unavailable' }, 503);
  const outcome = await processCommunityMediaCleanup(data, {
    remove: async paths => !(await service.storage.from(COMMUNITY_MEDIA_BUCKET).remove([...paths])).error,
    complete: async (jobId, claimId) => !(await service.rpc('complete_community_media_cleanup_job', { p_job_id: jobId, p_claim_id: claimId })).error,
  });
  return response(outcome, 200);
});
