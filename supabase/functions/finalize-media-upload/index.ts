import { createClient } from '@supabase/supabase-js';

import { createFinalizeMediaUploadHandler } from './handler.ts';

Deno.serve(async (request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceAvailable = Boolean(supabaseUrl && anonKey && serviceRoleKey);

  const caller = serviceAvailable
    ? createClient(supabaseUrl!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    : null;
  const service = serviceAvailable
    ? createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;

  return await createFinalizeMediaUploadHandler({
    allowedOrigin: Deno.env.get('MEDIA_ALLOWED_ORIGIN') ?? null,
    serviceAvailable,
    authenticate: async (token) => {
      if (!caller) return null;
      const { data, error } = await caller.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    preflight: async (userId, input) => {
      if (!service) return null;
      const { data, error } = await service.rpc('get_media_finalization_preflight', {
        p_uploader_id: userId,
        p_sighting_id: input.sightingId,
        p_media_id: input.mediaId,
        p_sha256: input.sha256,
      }).maybeSingle();
      return error ? null : data;
    },
    download: async (objectPath) => {
      if (!service) return null;
      const { data, error } = await service.storage.from('media-staging').download(objectPath);
      return error ? null : data;
    },
    finalize: async (jobId, userId, input) => {
      if (!service) return null;
      const { data, error } = await service.rpc('finalize_media_upload_job', {
        p_job_id: jobId,
        p_uploader_id: userId,
        p_sighting_id: input.sightingId,
        p_media_id: input.mediaId,
        p_sha256: input.sha256,
      });
      return error || typeof data !== 'string' ? null : data;
    },
    now: () => performance.now(),
    onTiming: (event) => {
      console.log(JSON.stringify({ event: 'finalize_media_upload_timing', ...event }));
    },
  })(request);
});
