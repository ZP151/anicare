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
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.rpc('request_media_deletion', {
    requested_media_id: mediaId,
  });
  const target = data?.[0];
  if (error || !target) {
    return Response.json({ error: 'media_not_found_or_forbidden' }, { status: 403 });
  }

  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: storageError } = await serviceClient.storage
    .from(target.storage_bucket)
    .remove([target.storage_path]);

  if (storageError) {
    return Response.json({ error: 'storage_deletion_pending' }, { status: 503 });
  }

  return Response.json({ deleted: true });
});
