import {
  buildFinalizeMediaRequest,
  buildReserveMediaRequest,
  parseMediaReservationResponse,
  parseTrustedSupabaseOrigin,
  type FinalizeMediaInput,
  type ReserveMediaInput,
  type ValidatedUploadCapability,
} from './media';
import { isStableMediaId } from '../media/media-reference';

const MAX_EDGE_RESPONSE_BYTES = 64 * 1024;
const UPLOAD_CREDENTIAL_SAFETY_BUFFER_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EDGE_ERROR_CODES = new Set<MediaTransportFailureCode>([
  'authentication_required',
  'invalid_request',
  'media_not_found_or_forbidden',
  'media_reservation_conflict',
  'media_finalization_conflict',
  'service_unavailable',
]);

export type MediaTransportFailureCode =
  | 'authentication_required'
  | 'invalid_request'
  | 'media_not_found_or_forbidden'
  | 'media_reservation_conflict'
  | 'media_finalization_conflict'
  | 'service_unavailable'
  | 'media_transport_failed'
  | 'network_error'
  | 'storage_upload_failed'
  | 'invalid_response';

export type MediaTransportFailure = Readonly<{
  stage: 'reserve' | 'upload' | 'finalize';
  kind: 'network' | 'http' | 'invalid_response';
  status: number | null;
  code: MediaTransportFailureCode;
}>;

export type MediaTransportDependencies = Readonly<{
  fetch: typeof globalThis.fetch;
  supabaseUrl: string;
  now: () => Date;
  insecureOrigins: readonly string[];
}>;

export type ReserveMediaUploadInput = ReserveMediaInput & Readonly<{ accessToken: string }>;
export type FinalizeMediaUploadInput = FinalizeMediaInput & Readonly<{ accessToken: string }>;
export type PutReservedMediaInput = Readonly<{
  capability: ValidatedUploadCapability;
  artifact: Readonly<{ bytes: Uint8Array }>;
}>;

export type MediaFinalizationResponse = Readonly<{
  mediaAssetId: string;
  status: 'quarantined';
}>;

function failure(
  stage: MediaTransportFailure['stage'],
  kind: MediaTransportFailure['kind'],
  status: number | null,
  code: MediaTransportFailureCode,
): MediaTransportFailure {
  return { stage, kind, status, code };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function strictAccessToken(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s]{1,8192}$/.test(value);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_EDGE_RESPONSE_BYTES)) {
    throw new Error('invalid_response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_response');

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_EDGE_RESPONSE_BYTES) throw new Error('invalid_response');
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

function edgeErrorCode(value: unknown): MediaTransportFailureCode {
  return isPlainObject(value) && typeof value.error === 'string' && EDGE_ERROR_CODES.has(value.error as MediaTransportFailureCode)
    ? value.error as MediaTransportFailureCode
    : 'media_transport_failed';
}

async function postEdgeJson(
  stage: 'reserve' | 'finalize',
  endpoint: string,
  accessToken: string,
  body: Record<string, unknown>,
  dependencies: MediaTransportDependencies,
): Promise<unknown> {
  if (!strictAccessToken(accessToken)) throw failure(stage, 'invalid_response', null, 'invalid_response');

  let response: Response;
  try {
    response = await dependencies.fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw failure(stage, 'network', null, 'network_error');
  }
  if (!response.ok) {
    let code: MediaTransportFailureCode = 'media_transport_failed';
    try {
      code = edgeErrorCode(await readBoundedJson(response));
    } catch {
      // Error payloads are optional. Preserve the HTTP result while retaining no body.
    }
    throw failure(stage, 'http', response.status, code);
  }
  if (response.redirected) throw failure(stage, 'invalid_response', null, 'invalid_response');

  try {
    return await readBoundedJson(response);
  } catch {
    throw failure(stage, 'invalid_response', null, 'invalid_response');
  }
}

export function parseMediaFinalizationResponse(value: unknown): MediaFinalizationResponse {
  if (!hasExactKeys(value, ['mediaAssetId', 'status']) || typeof value.mediaAssetId !== 'string' ||
      !UUID.test(value.mediaAssetId) || value.status !== 'quarantined') {
    throw new Error('invalid_media_finalization_response');
  }
  return { mediaAssetId: value.mediaAssetId, status: 'quarantined' };
}

function trustedOrigin(dependencies: MediaTransportDependencies): string {
  try {
    return parseTrustedSupabaseOrigin(dependencies.supabaseUrl, dependencies.insecureOrigins);
  } catch {
    throw failure('reserve', 'invalid_response', null, 'invalid_response');
  }
}

export async function reserveMediaUpload(
  input: ReserveMediaUploadInput,
  dependencies: MediaTransportDependencies,
): Promise<ValidatedUploadCapability> {
  const origin = trustedOrigin(dependencies);
  let request;
  try {
    request = buildReserveMediaRequest({ sightingId: input.sightingId, mediaId: input.mediaId, receipt: input.receipt });
  } catch {
    throw failure('reserve', 'invalid_response', null, 'invalid_response');
  }
  const response = await postEdgeJson(
    'reserve',
    `${origin}/functions/v1/reserve-media-upload`,
    input.accessToken,
    request,
    dependencies,
  );
  try {
    return parseMediaReservationResponse(response, {
      expectedMediaId: input.mediaId,
      supabaseUrl: dependencies.supabaseUrl,
      now: dependencies.now(),
      insecureOrigins: dependencies.insecureOrigins,
    });
  } catch {
    throw failure('reserve', 'invalid_response', null, 'invalid_response');
  }
}

function isExactCapability(value: ValidatedUploadCapability, now: Date): boolean {
  if (!isStableMediaId(value.jobId) || value.path !== `jobs/${value.jobId}.jpg` ||
      typeof value.token !== 'string' || value.token.length < 1 || value.token.length > 8192 || /[\r\n]/.test(value.token)) {
    return false;
  }
  const usableUntil = Date.parse(value.usableUntil);
  return Number.isFinite(now.getTime()) && Number.isFinite(usableUntil) &&
    usableUntil > now.getTime() + UPLOAD_CREDENTIAL_SAFETY_BUFFER_MS;
}

export async function putReservedMedia(
  input: PutReservedMediaInput,
  dependencies: MediaTransportDependencies,
): Promise<void> {
  let origin: string;
  try {
    origin = parseTrustedSupabaseOrigin(dependencies.supabaseUrl, dependencies.insecureOrigins);
  } catch {
    throw failure('upload', 'invalid_response', null, 'invalid_response');
  }
  const bytes = input.artifact.bytes;
  if (!isExactCapability(input.capability, dependencies.now()) || !(bytes.buffer instanceof ArrayBuffer) ||
      bytes.byteOffset !== 0 || bytes.byteLength !== bytes.buffer.byteLength) {
    throw failure('upload', 'invalid_response', null, 'invalid_response');
  }

  const uploadUrl = `${origin}/storage/v1/object/upload/sign/media-staging/${input.capability.path}?token=${encodeURIComponent(input.capability.token)}`;
  let response: Response;
  try {
    response = await dependencies.fetch(uploadUrl, {
      method: 'PUT',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
        'Cache-Control': 'no-cache',
      },
      body: bytes.buffer,
    });
  } catch {
    throw failure('upload', 'network', null, 'network_error');
  }
  if (response.redirected) throw failure('upload', 'invalid_response', null, 'invalid_response');
  if (!response.ok) throw failure('upload', 'http', response.status, 'storage_upload_failed');
}

export async function finalizeMediaUpload(
  input: FinalizeMediaUploadInput,
  dependencies: MediaTransportDependencies,
): Promise<MediaFinalizationResponse> {
  let origin: string;
  try {
    origin = parseTrustedSupabaseOrigin(dependencies.supabaseUrl, dependencies.insecureOrigins);
  } catch {
    throw failure('finalize', 'invalid_response', null, 'invalid_response');
  }
  let request;
  try {
    request = buildFinalizeMediaRequest({ sightingId: input.sightingId, mediaId: input.mediaId, sha256: input.sha256 });
  } catch {
    throw failure('finalize', 'invalid_response', null, 'invalid_response');
  }
  const response = await postEdgeJson(
    'finalize',
    `${origin}/functions/v1/finalize-media-upload`,
    input.accessToken,
    request,
    dependencies,
  );
  try {
    return parseMediaFinalizationResponse(response);
  } catch {
    throw failure('finalize', 'invalid_response', null, 'invalid_response');
  }
}
