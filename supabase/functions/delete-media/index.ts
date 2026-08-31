import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const MAX_REQUEST_BYTES = 8 * 1024;
const requestSchema = z.object({ mediaId: z.string().uuid() }).strict();

type DeletionTarget = Readonly<{
  storage_bucket: string;
  storage_path: string;
  remove_immediately: boolean;
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
    const { done, value } = await reader.read();
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

function deletionTarget(value: unknown): DeletionTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const target = value as Partial<DeletionTarget>;
  return typeof target.storage_bucket === 'string' &&
    typeof target.storage_path === 'string' &&
    typeof target.remove_immediately === 'boolean'
    ? target as DeletionTarget
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
  const { data, error } = await service.rpc('server_request_media_deletion', {
    p_actor_id: callerData.user.id,
    p_media_id: payload.mediaId,
  });
  const target = deletionTarget(Array.isArray(data) ? data[0] : null);
  if (error || !target) return json(request, { error: 'media_not_found_or_forbidden' }, 403);

  // A staged, finalized object must remain present until its non-upsert signed
  // upload token expires; otherwise a replay could recreate it after deletion.
  if (target.remove_immediately) {
    const { error: storageError } = await service.storage
      .from(target.storage_bucket)
      .remove([target.storage_path]);
    if (storageError) return json(request, { error: 'storage_deletion_pending' }, 503);
  }

  return json(request, { deleted: true }, 200);
});
