import {
  buildFinalizeMediaRequest,
  buildReserveMediaRequest,
  parseMediaReservationResponse,
  parseTrustedSupabaseOrigin,
  type FinalizeMediaInput as MobileFinalizeMediaInput,
  type ValidatedUploadCapability,
} from '../../../apps/mobile/src/api/media.js';
import { isStableMediaId } from '../../../apps/mobile/src/media/media-reference.js';

import { edgeEndpointUrl } from './edge-endpoints.js';
import type { SyntheticActor } from './fixtures.js';
import { fetchWithTimeout } from './network.js';

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const UPLOAD_CREDENTIAL_SAFETY_BUFFER_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR_TOKEN = /^\S{1,8192}$/;
const HOSTED_MEDIA_ORIGIN = 'https://fhugdtpjbgiatqhvjioy.supabase.co';
const EDGE_ERROR_CODES = new Set([
  'authentication_required',
  'invalid_request',
  'media_not_found_or_forbidden',
  'media_reservation_conflict',
  'media_finalization_conflict',
  'service_unavailable',
  'storage_deletion_pending',
]);

export type MediaActorEnvironment = Readonly<{ apiUrl: string }>;

export type ActorRequestOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMs?: 5_000 | 10_000 | 12_000 | 15_000 | 30_000;
}>;

type DetectorVersions = Readonly<{
  cats: 'unavailable';
  people: 'unavailable';
  plates: 'unavailable';
}>;

export type ReserveInput = Readonly<{
  sightingId: string;
  mediaId: string;
  sha256: string;
  byteLength: number;
  review: Readonly<{
    recipeVersion: 'jpeg-srgb-2048-q88.v1';
    detectorVersions: DetectorVersions;
    width: number;
    height: number;
    confirmedAtLocal: string;
  }>;
}>;

export type FinalizeInput = MobileFinalizeMediaInput;

export type Reservation = Readonly<ValidatedUploadCapability & {
  mediaId: string;
  origin: string;
}>;

type ActorStage = 'reserve' | 'upload' | 'finalize' | 'delete';
type ActorFailure = Readonly<{
  stage: ActorStage;
  kind: 'network' | 'http' | 'invalid_response';
  status: number | null;
  code: string;
}>;

export type ActorResult =
  | Readonly<{ ok: true; status: number; mediaAssetId?: string; deleted?: true }>
  | Readonly<{ ok: false } & ActorFailure>;

function failure(
  stage: ActorStage,
  kind: ActorFailure['kind'],
  status: number | null,
  code: string,
): ActorFailure {
  return { stage, kind, status, code };
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validActor(actor: SyntheticActor): boolean {
  return UUID.test(actor.id) && ACTOR_TOKEN.test(actor.accessToken);
}

function serializeRequest(value: unknown): string | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return null;
  }
  return new TextEncoder().encode(serialized).byteLength <= MAX_REQUEST_BYTES ? serialized : null;
}

function reservationRequest(input: ReserveInput): string | null {
  if (!exactObject(input, ['sightingId', 'mediaId', 'sha256', 'byteLength', 'review']) ||
      !exactObject(input.review, [
        'recipeVersion', 'detectorVersions', 'width', 'height', 'confirmedAtLocal',
      ])) return null;
  try {
    const request = buildReserveMediaRequest({
      sightingId: input.sightingId,
      mediaId: input.mediaId,
      receipt: {
        sanitizedSha256: input.sha256,
        recipeVersion: input.review.recipeVersion,
        detectorVersions: input.review.detectorVersions,
        width: input.review.width,
        height: input.review.height,
        byteLength: input.byteLength,
        confirmedAtLocal: input.review.confirmedAtLocal,
      },
    });
    return serializeRequest(request);
  } catch {
    return null;
  }
}

function finalizationRequest(input: FinalizeInput): string | null {
  try {
    return serializeRequest(buildFinalizeMediaRequest(input));
  } catch {
    return null;
  }
}

function deletionRequest(mediaAssetId: string): string | null {
  const input: unknown = { mediaAssetId };
  return exactObject(input, ['mediaAssetId']) && typeof input.mediaAssetId === 'string' && UUID.test(input.mediaAssetId)
    ? serializeRequest({ mediaId: input.mediaAssetId })
    : null;
}

async function boundedJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function edgeError(value: unknown): string {
  if (!exactObject(value, ['error']) && !exactObject(value, ['error', 'detail'])) return 'media_transport_failed';
  return typeof value.error === 'string' && EDGE_ERROR_CODES.has(value.error) ? value.error : 'media_transport_failed';
}

async function actorPost(
  stage: 'reserve' | 'finalize' | 'delete',
  endpoint: string,
  actor: SyntheticActor,
  serializedBody: string,
  options: ActorRequestOptions = {},
): Promise<Response | ActorFailure> {
  if (!validActor(actor)) return failure(stage, 'invalid_response', null, 'invalid_response');
  const timeoutResult = Symbol();
  try {
    return await fetchWithTimeout(endpoint, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      ...(options.signal ? { signal: options.signal } : {}),
      headers: {
        Authorization: `Bearer ${actor.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: serializedBody,
    }, options.timeoutMs ?? REQUEST_TIMEOUT_MS, globalThis.fetch, timeoutResult);
  } catch (error) {
    return failure(stage, 'network', null, error === timeoutResult ? 'request_timeout' : 'network_error');
  }
}

async function httpFailure(stage: ActorStage, response: Response): Promise<ActorFailure> {
  return failure(stage, 'http', response.status, edgeError(await boundedJson(response)));
}

export async function reserveMedia(
  actor: SyntheticActor,
  input: ReserveInput,
  env: MediaActorEnvironment,
  options: ActorRequestOptions = {},
): Promise<Reservation> {
  const serializedBody = reservationRequest(input);
  if (serializedBody === null) throw failure('reserve', 'invalid_response', null, 'invalid_response');
  const response = await actorPost(
    'reserve', edgeEndpointUrl(env.apiUrl, 'reserveMediaUpload'), actor, serializedBody, options,
  );
  if (!(response instanceof Response)) throw response;
  if (!response.ok) throw await httpFailure('reserve', response);
  if (response.status !== 201 || response.redirected) {
    throw failure('reserve', 'invalid_response', null, 'invalid_response');
  }
  try {
    const capability = parseMediaReservationResponse(await boundedJson(response), {
      expectedMediaId: input.mediaId,
      supabaseUrl: env.apiUrl,
      now: new Date(),
      insecureOrigins: [env.apiUrl],
    });
    if (!UUID.test(capability.jobId) || capability.path !== `jobs/${capability.jobId}.jpg`) {
      throw new Error('invalid_media_reservation_response');
    }
    const origin = parseTrustedSupabaseOrigin(env.apiUrl, [env.apiUrl]);
    return { ...capability, mediaId: input.mediaId, origin };
  } catch {
    throw failure('reserve', 'invalid_response', null, 'invalid_response');
  }
}

function canonicalUploadUrl(reservation: Reservation): string | null {
  if (!exactObject(reservation, ['jobId', 'path', 'token', 'usableUntil', 'mediaId', 'origin']) ||
      !UUID.test(reservation.jobId) || !isStableMediaId(reservation.mediaId) ||
      reservation.path !== `jobs/${reservation.jobId}.jpg` ||
      typeof reservation.token !== 'string' || reservation.token.length < 1 ||
      reservation.token.length > 8192 || /[\r\n]/.test(reservation.token)) return null;
  const usableUntil = Date.parse(String(reservation.usableUntil));
  if (!Number.isFinite(usableUntil) || usableUntil <= Date.now() + UPLOAD_CREDENTIAL_SAFETY_BUFFER_MS) return null;
  try {
    const origin = parseTrustedSupabaseOrigin(reservation.origin, [reservation.origin]);
    const parsedOrigin = new URL(origin);
    const localOrigin = parsedOrigin.protocol === 'http:' && parsedOrigin.hostname === '127.0.0.1';
    if (!localOrigin && origin !== HOSTED_MEDIA_ORIGIN) return null;
    return `${origin}/storage/v1/object/upload/sign/media-staging/${reservation.path}` +
      `?token=${encodeURIComponent(reservation.token)}`;
  } catch {
    return null;
  }
}

export async function putSignedMedia(
  reservation: Reservation,
  bytes: Uint8Array,
  options: ActorRequestOptions = {},
): Promise<ActorResult> {
  const uploadUrl = canonicalUploadUrl(reservation);
  if (uploadUrl === null || bytes.byteLength < 1 || bytes.byteLength > MAX_MEDIA_BYTES ||
      bytes.byteOffset !== 0 || bytes.byteLength !== bytes.buffer.byteLength) {
    return { ok: false, ...failure('upload', 'invalid_response', null, 'invalid_response') };
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(uploadUrl, {
      method: 'PUT',
      redirect: 'error',
      cache: 'no-store',
      ...(options.signal ? { signal: options.signal } : {}),
      headers: {
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
        'Cache-Control': 'no-cache',
      },
      body: bytes.buffer as ArrayBuffer,
    }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, ...failure('upload', 'network', null, 'network_error') };
  }
  if (!response.ok) {
    return { ok: false, ...failure('upload', 'http', response.status, 'storage_upload_failed') };
  }
  if (response.status !== 200 || response.redirected) {
    return { ok: false, ...failure('upload', 'invalid_response', null, 'invalid_response') };
  }
  const value = await boundedJson(response);
  if (!exactObject(value, ['Key']) || value.Key !== `media-staging/${reservation.path}`) {
    return { ok: false, ...failure('upload', 'invalid_response', null, 'invalid_response') };
  }
  return { ok: true, status: response.status };
}

function finalizationSuccess(value: unknown): string | null {
  return exactObject(value, ['mediaAssetId', 'status']) && UUID.test(String(value.mediaAssetId)) && value.status === 'quarantined'
    ? value.mediaAssetId as string
    : null;
}

export async function finalizeMedia(
  actor: SyntheticActor,
  input: FinalizeInput,
  env: MediaActorEnvironment,
  options: ActorRequestOptions = {},
): Promise<ActorResult> {
  const serializedBody = finalizationRequest(input);
  if (serializedBody === null) {
    return { ok: false, ...failure('finalize', 'invalid_response', null, 'invalid_response') };
  }
  const response = await actorPost(
    'finalize', edgeEndpointUrl(env.apiUrl, 'finalizeMediaUpload'), actor, serializedBody, options,
  );
  if (!(response instanceof Response)) return { ok: false, ...response };
  if (!response.ok) return { ok: false, ...await httpFailure('finalize', response) };
  if (response.status !== 200 || response.redirected) {
    return { ok: false, ...failure('finalize', 'invalid_response', null, 'invalid_response') };
  }
  const mediaAssetId = finalizationSuccess(await boundedJson(response));
  return mediaAssetId
    ? { ok: true, status: response.status, mediaAssetId }
    : { ok: false, ...failure('finalize', 'invalid_response', null, 'invalid_response') };
}

export async function deleteMedia(
  actor: SyntheticActor,
  mediaAssetId: string,
  env: MediaActorEnvironment,
  options: ActorRequestOptions = {},
): Promise<ActorResult> {
  const serializedBody = deletionRequest(mediaAssetId);
  if (serializedBody === null) {
    return { ok: false, ...failure('delete', 'invalid_response', null, 'invalid_response') };
  }
  const response = await actorPost(
    'delete', edgeEndpointUrl(env.apiUrl, 'deleteMedia'), actor, serializedBody, options,
  );
  if (!(response instanceof Response)) return { ok: false, ...response };
  if (!response.ok) return { ok: false, ...await httpFailure('delete', response) };
  if (response.status !== 200 || response.redirected) {
    return { ok: false, ...failure('delete', 'invalid_response', null, 'invalid_response') };
  }
  const value = await boundedJson(response);
  return exactObject(value, ['deleted']) && value.deleted === true
    ? { ok: true, status: response.status, deleted: true }
    : { ok: false, ...failure('delete', 'invalid_response', null, 'invalid_response') };
}
