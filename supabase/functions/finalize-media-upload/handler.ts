import { z } from 'zod';

import { inspectJpeg } from '../_shared/jpeg-policy.ts';

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_REQUEST_BYTES = 8 * 1024;
const stableId = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;
const sha256 = /^[a-f0-9]{64}$/;

const requestSchema = z.object({
  sightingId: z.string().regex(stableId),
  mediaId: z.string().regex(stableId),
  sha256: z.string().regex(sha256),
}).strict();

export type FinalizeInput = Readonly<z.infer<typeof requestSchema>>;

type FinalizationJob = Readonly<{
  job_id: string;
  object_path: string;
  sha256: string;
  byte_length: number;
  width: number;
  height: number;
  recipe_version: string;
  detector_versions: Readonly<{ cats: 'unavailable'; people: 'unavailable'; plates: 'unavailable' }>;
  confirmed_at_local: string;
  reservation_expires_at: string;
  status: 'reserved' | 'finalized' | 'deletion_pending';
  media_asset_id: string | null;
  media_deleted_at: string | null;
}>;

export type FinalizeOutcome =
  | 'success'
  | 'authentication_denied'
  | 'authorization_denied'
  | 'conflict'
  | 'internal_failure';

export type FinalizeTimingEvent = Readonly<{
  outcome: FinalizeOutcome;
  request_parse_ms: number;
  auth_ms: number;
  db_preflight_ms: number;
  storage_download_ms: number;
  media_validation_ms: number;
  finalize_rpc_ms: number;
  total_ms: number;
}>;

export type FinalizeMediaUploadDependencies = Readonly<{
  allowedOrigin: string | null;
  serviceAvailable: boolean;
  authenticate(token: string): Promise<string | null>;
  preflight(userId: string, input: FinalizeInput): Promise<unknown>;
  download(objectPath: string): Promise<Blob | null>;
  finalize(jobId: string, userId: string, input: FinalizeInput): Promise<string | null>;
  now(): number;
  onTiming(event: FinalizeTimingEvent): void;
}>;

type TimingLabel = Exclude<keyof FinalizeTimingEvent, 'outcome' | 'total_ms'>;

function duration(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(value));
}

class TimingCollector {
  readonly #durations = new Map<TimingLabel, number>();
  readonly #startedAt: number;

  constructor(private readonly now: () => number) {
    this.#startedAt = now();
  }

  async measure<T>(label: TimingLabel, work: () => Promise<T>): Promise<T> {
    const startedAt = this.now();
    try {
      return await work();
    } finally {
      this.#durations.set(label, duration(this.now() - startedAt));
    }
  }

  finish(outcome: FinalizeOutcome): FinalizeTimingEvent {
    const value = (label: TimingLabel) => this.#durations.get(label) ?? 0;
    return {
      outcome,
      request_parse_ms: value('request_parse_ms'),
      auth_ms: value('auth_ms'),
      db_preflight_ms: value('db_preflight_ms'),
      storage_download_ms: value('storage_download_ms'),
      media_validation_ms: value('media_validation_ms'),
      finalize_rpc_ms: value('finalize_rpc_ms'),
      total_ms: duration(this.now() - this.#startedAt),
    };
  }
}

function allowedCors(request: Request, configuredOrigin: string | null): HeadersInit | null {
  const origin = request.headers.get('origin');
  if (!configuredOrigin || (origin !== null && origin !== configuredOrigin)) return null;
  return {
    'Access-Control-Allow-Origin': origin ?? configuredOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(request: Request, configuredOrigin: string | null, body: unknown, status: number): Response {
  const cors = allowedCors(request, configuredOrigin);
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
    const { value, done } = await reader.read();
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

function isExactUnavailableDetectorMap(value: unknown): value is FinalizationJob['detector_versions'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const map = value as Record<string, unknown>;
  return Object.keys(map).length === 3 && map.cats === 'unavailable' &&
    map.people === 'unavailable' && map.plates === 'unavailable';
}

function finalizationJob(value: unknown): FinalizationJob | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const job = value as Partial<FinalizationJob>;
  const validStatus = job.status === 'reserved' || job.status === 'finalized' || job.status === 'deletion_pending';
  return typeof job.job_id === 'string' && stableId.test(job.job_id) &&
    typeof job.object_path === 'string' && job.object_path === `jobs/${job.job_id}.jpg` &&
    typeof job.sha256 === 'string' && sha256.test(job.sha256) &&
    typeof job.byte_length === 'number' && Number.isInteger(job.byte_length) &&
    job.byte_length > 0 && job.byte_length <= MAX_MEDIA_BYTES &&
    typeof job.width === 'number' && Number.isInteger(job.width) && job.width > 0 && job.width <= 2048 &&
    typeof job.height === 'number' && Number.isInteger(job.height) && job.height > 0 && job.height <= 2048 &&
    job.recipe_version === 'jpeg-srgb-2048-q88.v1' && isExactUnavailableDetectorMap(job.detector_versions) &&
    typeof job.confirmed_at_local === 'string' && Number.isFinite(Date.parse(job.confirmed_at_local)) &&
    typeof job.reservation_expires_at === 'string' && Number.isFinite(Date.parse(job.reservation_expires_at)) &&
    validStatus && (job.media_asset_id === null || typeof job.media_asset_id === 'string') &&
    (job.media_deleted_at === null || typeof job.media_deleted_at === 'string' &&
      Number.isFinite(Date.parse(job.media_deleted_at)))
    ? job as FinalizationJob
    : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createFinalizeMediaUploadHandler(
  dependencies: FinalizeMediaUploadDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const timing = new TimingCollector(dependencies.now);
    let outcome: FinalizeOutcome = 'internal_failure';
    try {
      const cors = allowedCors(request, dependencies.allowedOrigin);
      if (!cors) {
        outcome = 'authorization_denied';
        return new Response(null, { status: 403 });
      }
      if (request.method === 'OPTIONS') {
        outcome = 'success';
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method !== 'POST') {
        return json(request, dependencies.allowedOrigin, { error: 'method_not_allowed' }, 405);
      }
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return json(request, dependencies.allowedOrigin, { error: 'invalid_request' }, 415);
      }

      const token = bearerToken(request);
      if (!token) {
        outcome = 'authentication_denied';
        return json(request, dependencies.allowedOrigin, { error: 'authentication_required' }, 401);
      }
      if (!dependencies.serviceAvailable) {
        return json(request, dependencies.allowedOrigin, { error: 'service_unavailable' }, 503);
      }

      let payload: FinalizeInput;
      try {
        payload = await timing.measure('request_parse_ms', async () =>
          requestSchema.parse(await readBoundedJson(request)));
      } catch {
        return json(request, dependencies.allowedOrigin, { error: 'invalid_request' }, 400);
      }

      const userId = await timing.measure('auth_ms', () => dependencies.authenticate(token));
      if (!userId) {
        outcome = 'authentication_denied';
        return json(request, dependencies.allowedOrigin, { error: 'authentication_required' }, 401);
      }

      const job = finalizationJob(await timing.measure(
        'db_preflight_ms',
        () => dependencies.preflight(userId, payload),
      ));
      if (!job) {
        outcome = 'authorization_denied';
        return json(request, dependencies.allowedOrigin, { error: 'media_not_found_or_forbidden' }, 403);
      }
      if (job.status === 'finalized' && job.media_asset_id && job.media_deleted_at === null) {
        outcome = 'success';
        return json(request, dependencies.allowedOrigin, {
          mediaAssetId: job.media_asset_id,
          status: 'quarantined',
        }, 200);
      }
      if (job.status !== 'reserved' || Date.parse(job.reservation_expires_at) <= Date.now()) {
        outcome = 'conflict';
        return json(request, dependencies.allowedOrigin, { error: 'media_finalization_conflict' }, 409);
      }

      const blob = await timing.measure('storage_download_ms', () => dependencies.download(job.object_path));
      if (!blob || blob.size !== job.byte_length || blob.size > MAX_MEDIA_BYTES) {
        outcome = 'conflict';
        return json(request, dependencies.allowedOrigin, { error: 'media_finalization_conflict' }, 409);
      }

      const validMedia = await timing.measure('media_validation_ms', async () => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.byteLength !== job.byte_length || await sha256Hex(bytes) !== job.sha256) return false;
        try {
          const dimensions = inspectJpeg(bytes);
          return dimensions.width === job.width && dimensions.height === job.height;
        } catch {
          return false;
        }
      });
      if (!validMedia) {
        outcome = 'conflict';
        return json(request, dependencies.allowedOrigin, { error: 'media_finalization_conflict' }, 409);
      }

      const mediaAssetId = await timing.measure(
        'finalize_rpc_ms',
        () => dependencies.finalize(job.job_id, userId, payload),
      );
      if (!mediaAssetId) {
        outcome = 'conflict';
        return json(request, dependencies.allowedOrigin, { error: 'media_finalization_conflict' }, 409);
      }
      outcome = 'success';
      return json(request, dependencies.allowedOrigin, { mediaAssetId, status: 'quarantined' }, 200);
    } finally {
      try {
        dependencies.onTiming(timing.finish(outcome));
      } catch {
        // Observability must not change the finalization response.
      }
    }
  };
}
