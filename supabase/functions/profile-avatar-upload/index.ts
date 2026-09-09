import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { inspectJpeg } from '../_shared/jpeg-policy.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const hash = /^[a-f0-9]{64}$/;
const reserveSchema = z.object({ action: z.literal('reserve'), sha256: z.string().regex(hash), byteLength: z.number().int().min(1).max(MAX_BYTES), width: z.number().int().min(1).max(512), height: z.number().int().min(1).max(512) }).strict();
const finalizeSchema = z.object({ action: z.literal('finalize'), jobId: z.string().uuid() }).strict();
const reservationSchema = z.object({ job_id: z.string().uuid(), object_path: z.string().regex(/^avatars\/[0-9a-f-]{36}\.jpg$/), reservation_expires_at: z.string().datetime({ offset: true }) });
const jobSchema = z.object({ status: z.literal('reserved'), object_path: z.string().regex(/^avatars\/[0-9a-f-]{36}\.jpg$/), byte_length: z.number().int().min(1).max(MAX_BYTES), sha256: z.string().regex(hash), width: z.number().int().min(1).max(512), height: z.number().int().min(1).max(512) });
const requestSchema = z.union([reserveSchema, finalizeSchema]);
async function readInput(request: Request): Promise<unknown> {
 const reader=request.body?.getReader(); if(!reader) throw new Error('body_required');
 const chunks: Uint8Array[]=[]; let size=0;
 try { for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){await reader.cancel();throw new Error('body_too_large');}chunks.push(part.value);} } finally {reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

function headers(request: Request): HeadersInit | null {
  const allowed = Deno.env.get('MEDIA_ALLOWED_ORIGIN'); const origin = request.headers.get('origin');
  return !allowed || (origin !== null && origin !== allowed) ? null : { 'Access-Control-Allow-Origin': origin ?? allowed, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
function reply(cors: HeadersInit, body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } }); }
function token(request: Request) { return request.headers.get('authorization')?.match(/^Bearer\s+([^\s]{1,8192})$/i)?.[1] ?? null; }

Deno.serve(async request => {
  const cors = headers(request); if (!cors) return new Response(null, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST' || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(cors, { error: 'invalid_request' }, 415);
  const accessToken = token(request); const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!accessToken) return reply(cors, { error: 'authentication_required' }, 401);
  if (!url || !anon || !serviceKey) return reply(cors, { error: 'service_unavailable' }, 503);
  let input: z.infer<typeof requestSchema>; try { input = requestSchema.parse(await readInput(request)); } catch { return reply(cors, { error: 'invalid_request' }, 400); }
  const caller = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user } = await caller.auth.getUser(accessToken); if (!user.user) return reply(cors, { error: 'authentication_required' }, 401);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (input.action === 'reserve') {
    const { data, error } = await service.rpc('reserve_profile_avatar_upload', { p_owner_id: user.user.id, p_sha256: input.sha256, p_byte_length: input.byteLength, p_width: input.width, p_height: input.height }).maybeSingle();
    const parsed = reservationSchema.safeParse(data);
    if (error || !parsed.success) return reply(cors, { error: 'avatar_not_available' }, 403);
    const reservation = parsed.data;
    if (Date.parse(reservation.reservation_expires_at) <= Date.now()) return reply(cors, { error: 'avatar_not_available' }, 409);
    const signed = await service.storage.from('profile-avatars').createSignedUploadUrl(reservation.object_path, { upsert: false });
    if (signed.error || !signed.data?.signedUrl || !signed.data.token) return reply(cors, { error: 'service_unavailable' }, 503);
    return reply(cors, { jobId: reservation.job_id, reservationExpiresAt: reservation.reservation_expires_at, upload: { signedUrl: signed.data.signedUrl, token: signed.data.token } }, 201);
  }
  const { data: jobData } = await service.rpc('get_profile_avatar_upload_job', { p_owner_id: user.user.id, p_job_id: input.jobId }).maybeSingle();
  const parsedJob = jobSchema.safeParse(jobData);
  if (!parsedJob.success) return reply(cors, { error: 'avatar_not_available' }, 403);
  const job = parsedJob.data;
  const downloaded = await service.storage.from('profile-avatars').download(job.object_path);
  if (downloaded.error || !downloaded.data || downloaded.data.size !== job.byte_length || downloaded.data.size > MAX_BYTES) return reply(cors, { error: 'invalid_avatar' }, 409);
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  try { const dimensions = inspectJpeg(bytes); if (digest !== job.sha256 || dimensions.width !== job.width || dimensions.height !== job.height) throw new Error('mismatch'); } catch { return reply(cors, { error: 'invalid_avatar' }, 409); }
  const finished = await service.rpc('finalize_profile_avatar_upload', { p_owner_id: user.user.id, p_job_id: input.jobId });
  return finished.error || typeof finished.data !== 'string' ? reply(cors, { error: 'avatar_not_available' }, 409) : reply(cors, { avatarPath: finished.data }, 200);
});
