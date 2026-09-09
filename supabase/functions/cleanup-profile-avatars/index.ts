import { createClient } from '@supabase/supabase-js';

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const url = Deno.env.get('SUPABASE_URL');
  if (!key || !url || request.headers.get('authorization') !== `Bearer ${key}`) return new Response(null, { status: 401 });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error } = await service.rpc('claim_profile_avatar_cleanup_jobs', { p_limit: 25 });
  if (error || !Array.isArray(jobs)) return new Response(null, { status: 503 });
  for (const job of jobs) {
    if (!job || typeof job.object_path !== 'string' || typeof job.job_id !== 'string' || typeof job.claim_id !== 'string' || !/^avatars\/[0-9a-f-]{36}\.jpg$/.test(job.object_path)) continue;
    const removed = await service.storage.from('profile-avatars').remove([job.object_path]);
    if (!removed.error) await service.rpc('complete_profile_avatar_cleanup_job', { p_job_id: job.job_id, p_claim_id: job.claim_id });
  }
  return Response.json({ claimed: jobs.length });
});
