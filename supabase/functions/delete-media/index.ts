import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return Response.json({ error: 'authentication_required' }, { status: 401 });
  }

  const { mediaId } = await request.json().catch(() => ({ mediaId: null }));
  if (typeof mediaId !== 'string') {
    return Response.json({ error: 'invalid_media_id' }, { status: 400 });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: 'server_configuration_error' }, { status: 500 });
  }

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const { data: userData, error: userError } = token ? await userClient.auth.getUser(token) : { data: null, error: true };
  if (userError || !userData?.user) {
    return Response.json({ error: 'authentication_required' }, { status: 401 });
  }

  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await serviceClient.rpc('server_request_media_deletion', {
    p_actor_id: userData.user.id,
    p_media_id: mediaId,
  });
  const target = data?.[0];
  if (error || !target) {
    return Response.json({ error: 'media_not_found_or_forbidden' }, { status: 403 });
  }

  const { error: storageError } = await serviceClient.storage
    .from(target.storage_bucket)
    .remove([target.storage_path]);

  if (storageError) {
    return Response.json({ error: 'storage_deletion_pending' }, { status: 503 });
  }

  return Response.json({ deleted: true });
});
