import type { LocalStackEnvironment } from './environment.js';
import type { SyntheticActor } from './fixtures.js';
import { fetchWithTimeout } from './network.js';

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const ACTOR_TOKEN = /^\S{1,8192}$/;
const EDGE_ERROR_CODES = new Set([
  'authentication_required',
  'invalid_request',
  'media_not_found_or_forbidden',
  'media_reservation_conflict',
  'media_finalization_conflict',
  'service_unavailable',
  'storage_deletion_pending',
]);

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

export type FinalizeInput = Readonly<{
  sightingId: string;
  mediaId: string;
  sha256: string;
}>;

export type Reservation = Readonly<{
  jobId: string;
  mediaId: string;
  path: string;
  reservationExpiresAt: string;
  uploadCredentialUsableUntil: string;
  signedUploadUrl: string;
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

function exactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validActor(actor: SyntheticActor): boolean {
  return UUID.test(actor.id) && ACTOR_TOKEN.test(actor.accessToken);
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
  body: Record<string, unknown>,
): Promise<Response | ActorFailure> {
  if (!validActor(actor)) return failure(stage, 'invalid_response', null, 'invalid_response');
  try {
    return await fetchWithTimeout(endpoint, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${actor.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, REQUEST_TIMEOUT_MS);
  } catch {
    return failure(stage, 'network', null, 'network_error');
  }
}

async function httpFailure(stage: ActorStage, response: Response): Promise<ActorFailure> {
  return failure(stage, 'http', response.status, edgeError(await boundedJson(response)));
}

function parseReservation(value: unknown, input: ReserveInput, env: LocalStackEnvironment): Reservation | null {
  if (!exactObject(value, [
    'jobId',
    'mediaId',
    'reservationExpiresAt',
    'uploadCredentialUsableUntil',
    'upload',
  ]) || !UUID.test(String(value.jobId)) || value.mediaId !== input.mediaId ||
      !exactIsoTimestamp(value.reservationExpiresAt) || !exactIsoTimestamp(value.uploadCredentialUsableUntil) ||
      !exactObject(value.upload, ['signedUrl', 'token']) ||
      typeof value.upload.signedUrl !== 'string' || typeof value.upload.token !== 'string' ||
      !ACTOR_TOKEN.test(value.upload.token)) {
    return null;
  }

  const reservationExpiresAt = Date.parse(value.reservationExpiresAt);
  const usableUntil = Date.parse(value.uploadCredentialUsableUntil);
  if (reservationExpiresAt <= Date.now() || usableUntil <= reservationExpiresAt) return null;

  let signedUrl: URL;
  try {
    signedUrl = new URL(value.upload.signedUrl);
  } catch {
    return null;
  }
  const path = `jobs/${String(value.jobId)}.jpg`;
  const expectedPathname = `/storage/v1/object/upload/sign/media-staging/${path}`;
  const expectedOrigin = new URL(env.apiUrl).origin;
  if (signedUrl.origin !== expectedOrigin || signedUrl.protocol !== 'http:' || signedUrl.hostname !== '127.0.0.1' ||
      signedUrl.username !== '' || signedUrl.password !== '' || signedUrl.pathname !== expectedPathname ||
      signedUrl.hash !== '' || signedUrl.searchParams.size !== 1 ||
      signedUrl.searchParams.get('token') !== value.upload.token) {
    return null;
  }

  return {
    jobId: value.jobId as string,
    mediaId: value.mediaId as string,
    path,
    reservationExpiresAt: value.reservationExpiresAt,
    uploadCredentialUsableUntil: value.uploadCredentialUsableUntil,
    signedUploadUrl: signedUrl.toString(),
  };
}

export async function reserveMedia(
  actor: SyntheticActor,
  input: ReserveInput,
  env: LocalStackEnvironment,
): Promise<Reservation> {
  const response = await actorPost('reserve', `${env.apiUrl}/functions/v1/reserve-media-upload`, actor, {
    sightingId: input.sightingId,
    mediaId: input.mediaId,
    sha256: input.sha256,
    byteLength: input.byteLength,
    review: input.review,
  });
  if (!(response instanceof Response)) throw response;
  if (!response.ok) throw await httpFailure('reserve', response);
  if (response.status !== 201 || response.redirected) {
    throw failure('reserve', 'invalid_response', null, 'invalid_response');
  }
  const reservation = parseReservation(await boundedJson(response), input, env);
  if (!reservation) throw failure('reserve', 'invalid_response', null, 'invalid_response');
  return reservation;
}

function validReservationCapability(reservation: Reservation): boolean {
  if (!UUID.test(reservation.jobId) || reservation.path !== `jobs/${reservation.jobId}.jpg` ||
      !exactIsoTimestamp(reservation.reservationExpiresAt) ||
      !exactIsoTimestamp(reservation.uploadCredentialUsableUntil)) return false;
  const reservationExpiresAt = Date.parse(reservation.reservationExpiresAt);
  const usableUntil = Date.parse(reservation.uploadCredentialUsableUntil);
  if (reservationExpiresAt <= Date.now() || usableUntil <= reservationExpiresAt) return false;
  try {
    const url = new URL(reservation.signedUploadUrl);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.username === '' && url.password === '' &&
      url.pathname === `/storage/v1/object/upload/sign/media-staging/${reservation.path}` && url.hash === '' &&
      url.searchParams.size === 1 && ACTOR_TOKEN.test(url.searchParams.get('token') ?? '');
  } catch {
    return false;
  }
}

export async function putSignedMedia(reservation: Reservation, bytes: Uint8Array): Promise<ActorResult> {
  if (!validReservationCapability(reservation) || bytes.byteLength < 1 || bytes.byteLength > MAX_MEDIA_BYTES ||
      bytes.byteOffset !== 0 || bytes.byteLength !== bytes.buffer.byteLength) {
    return { ok: false, ...failure('upload', 'invalid_response', null, 'invalid_response') };
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(reservation.signedUploadUrl, {
      method: 'PUT',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
        'Cache-Control': 'no-cache',
      },
      body: bytes.buffer as ArrayBuffer,
    }, REQUEST_TIMEOUT_MS);
  } catch {
    return { ok: false, ...failure('upload', 'network', null, 'network_error') };
  }
  if (!response.ok) return { ok: false, ...await httpFailure('upload', response) };
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
  env: LocalStackEnvironment,
): Promise<ActorResult> {
  const response = await actorPost('finalize', `${env.apiUrl}/functions/v1/finalize-media-upload`, actor, {
    sightingId: input.sightingId,
    mediaId: input.mediaId,
    sha256: input.sha256,
  });
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
  env: LocalStackEnvironment,
): Promise<ActorResult> {
  const response = await actorPost('delete', `${env.apiUrl}/functions/v1/delete-media`, actor, { mediaId: mediaAssetId });
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
