import { z } from 'zod';

import { inspectJpeg } from './jpeg-policy.ts';

const sha256 = /^[a-f0-9]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const thumb = z.object({
  sha256: z.string().regex(sha256),
  byteLength: z.number().int().min(1).max(512 * 1024),
  width: z.number().int().min(1).max(480),
  height: z.number().int().min(1).max(480),
}).strict();
const display = z.object({
  sha256: z.string().regex(sha256),
  byteLength: z.number().int().min(1).max(4 * 1024 * 1024),
  width: z.number().int().min(1).max(2048),
  height: z.number().int().min(1).max(2048),
}).strict();
const request = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reserve'), requestId: z.string().regex(uuid), thumb, display }).strict(),
  z.object({ action: z.literal('finalize'), jobId: z.string().regex(uuid) }).strict(),
]);

export type CommunityMediaRequest = Readonly<z.infer<typeof request>>;
export type CommunityMediaVariant = Readonly<z.infer<typeof thumb>>;

export function parseCommunityMediaRequest(value: unknown): CommunityMediaRequest {
  const parsed = request.safeParse(value);
  if (!parsed.success) throw new Error('invalid_community_media_request');
  return parsed.data;
}

export const COMMUNITY_MEDIA_BUCKET = 'community-media';
export function communityMediaPath(jobId: string, variant: 'thumb' | 'display'): string {
  if (!uuid.test(jobId)) throw new Error('invalid_community_media_path');
  return `media/${jobId}/${variant}.jpg`;
}

type StoredVariant = Readonly<CommunityMediaVariant & { path: string }>;
type StoredJob = Readonly<{ status: 'reserved' | 'finalized' | 'attached' | 'deletion_pending' | 'completed'; reservationExpiresAt: string; thumb: StoredVariant; display: StoredVariant }>;
type Reservation = Readonly<{ jobId: string; reservationExpiresAt: string; thumbPath: string; displayPath: string }>;

export type CommunityMediaDependencies = Readonly<{
  allowedOrigin: string | null;
  serviceAvailable: boolean;
  authenticate(token: string): Promise<string | null>;
  reserve(ownerId: string, input: Extract<CommunityMediaRequest, { action: 'reserve' }>): Promise<Reservation | null>;
  createSignedUpload(path: string): Promise<{ signedUrl: string; token: string } | null>;
  getJob(ownerId: string, jobId: string): Promise<StoredJob | null>;
  download(path: string): Promise<Blob | null>;
  finalize(ownerId: string, jobId: string): Promise<string | null>;
  resolve(postId: string, mediaId: string, variant: 'thumb' | 'display', actorId: string | null): Promise<string | null>;
}>;

function cors(request: Request, origin: string | null, methods: string): HeadersInit | null {
  const supplied = request.headers.get('origin');
  if (!origin || supplied !== null && supplied !== origin) return null;
  return { 'Access-Control-Allow-Origin': supplied ?? origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': methods, Vary: 'Origin' };
}
function json(headers: HeadersInit, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function token(request: Request): string | null { return request.headers.get('authorization')?.match(/^Bearer\s+([^\s]{1,8192})$/i)?.[1] ?? null; }
async function body(request: Request): Promise<unknown> {
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/.test(claimed) || Number(claimed) > 16 * 1024)) throw new Error('invalid_community_media_request');
  const reader = request.body?.getReader(); if (!reader) throw new Error('invalid_community_media_request');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const next = await reader.read(); if (next.done) break; length += next.value.byteLength; if (length > 16 * 1024) throw new Error('invalid_community_media_request'); chunks.push(next.value); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer)), value => value.toString(16).padStart(2, '0')).join('');
}
async function validVariant(blob: Blob | null, expected: StoredVariant): Promise<boolean> {
  if (!blob || blob.size !== expected.byteLength || blob.size > 4 * 1024 * 1024) return false;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try { const dimensions = inspectJpeg(bytes); return await digest(bytes) === expected.sha256 && dimensions.width === expected.width && dimensions.height === expected.height; } catch { return false; }
}

export function createCommunityMediaHandler(dependencies: CommunityMediaDependencies): (request: Request) => Promise<Response> {
  return async request => {
    const headers = cors(request, dependencies.allowedOrigin, 'GET, POST, OPTIONS');
    if (!headers) return new Response(null, { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!dependencies.serviceAvailable) return json(headers, { error: 'service_unavailable' }, 503);
    const suppliedToken = token(request);
    if (request.method === 'GET') {
      let actor: string | null = null;
      if (request.headers.has('authorization')) {
        if (!suppliedToken || !(actor = await dependencies.authenticate(suppliedToken))) return json(headers, { error: 'authentication_required' }, 401);
      }
      const url = new URL(request.url); const postId = url.searchParams.get('postId'); const mediaId = url.searchParams.get('mediaId'); const variant = url.searchParams.get('variant');
      if (!postId || !mediaId || !uuid.test(postId) || !uuid.test(mediaId) || variant !== 'thumb' && variant !== 'display') return json(headers, { error: 'invalid_request' }, 400);
      const path = await dependencies.resolve(postId, mediaId, variant, actor);
      if (!path) return json(headers, { error: 'media_not_available' }, 404);
      const bytes = await dependencies.download(path);
      if (!bytes) return json(headers, { error: 'media_not_available' }, 404);
      return new Response(bytes, { status: 200, headers: { ...headers, 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (request.method !== 'POST') return json(headers, { error: 'method_not_allowed' }, 405);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json(headers, { error: 'invalid_request' }, 415);
    if (!suppliedToken) return json(headers, { error: 'authentication_required' }, 401);
    const actor = await dependencies.authenticate(suppliedToken); if (!actor) return json(headers, { error: 'authentication_required' }, 401);
    let input: CommunityMediaRequest; try { input = parseCommunityMediaRequest(await body(request)); } catch { return json(headers, { error: 'invalid_request' }, 400); }
    if (input.action === 'reserve') {
      const reservation = await dependencies.reserve(actor, input); if (!reservation || Date.parse(reservation.reservationExpiresAt) <= Date.now()) return json(headers, { error: 'community_media_not_available' }, 403);
      const [thumb, display] = await Promise.all([dependencies.createSignedUpload(reservation.thumbPath), dependencies.createSignedUpload(reservation.displayPath)]);
      if (!thumb || !display) return json(headers, { error: 'service_unavailable' }, 503);
      return json(headers, { jobId: reservation.jobId, reservationExpiresAt: reservation.reservationExpiresAt, uploads: { thumb, display } }, 201);
    }
    const job = await dependencies.getJob(actor, input.jobId); if (!job) return json(headers, { error: 'community_media_not_available' }, 403);
    if (job.status === 'finalized' || job.status === 'attached') return json(headers, { mediaId: input.jobId }, 200);
    if (job.status !== 'reserved' || Date.parse(job.reservationExpiresAt) <= Date.now() || !(await validVariant(await dependencies.download(job.thumb.path), job.thumb)) || !(await validVariant(await dependencies.download(job.display.path), job.display))) return json(headers, { error: 'invalid_community_media' }, 409);
    const mediaId = await dependencies.finalize(actor, input.jobId); return mediaId ? json(headers, { mediaId }, 200) : json(headers, { error: 'community_media_not_available' }, 409);
  };
}
