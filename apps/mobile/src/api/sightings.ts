import { parseTrustedSupabaseOrigin } from './media';

export type SightingRisk = 'normal' | 'sensitive' | 'critical';

export type SightingLocationInput =
  | Readonly<{ kind: 'device_once'; latitude: number; longitude: number }>
  | Readonly<{ kind: 'manual_area'; publicCellId: string }>;

export type SightingDraftInput = Readonly<{
  location: SightingLocationInput;
  occurredAt: Date;
  risk: SightingRisk;
  traits: Record<string, unknown>;
  notes: string | null;
  clientDedupeKey: string;
}>;

export type SightingSubmissionResponse = Readonly<{
  sightingId: string;
  visibility: 'public' | 'hidden';
  visibleAt: string | null;
  requestId: string;
}>;

export type SightingRecoveryOutcome = SightingSubmissionResponse | Readonly<{ kind: 'not_found' }>;

const MAX_SIGHTING_RESPONSE_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESPONSE_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const SERVER_ERROR_CODES = new Set([
  'authentication_required',
  'invalid_request',
  'service_unavailable',
  'submission_failed',
  'sighting_submission_not_found',
]);

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

function canonicalizeResponseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const match = RESPONSE_TIMESTAMP.exec(value);
  if (!match) return null;
  const year = Number(match[1]!);
  const month = Number(match[2]!);
  const day = Number(match[3]!);
  const hour = Number(match[4]!);
  const minute = Number(match[5]!);
  const second = Number(match[6]!);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]! ||
      hour > 23 || minute > 59 || second > 59) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseSightingSubmissionResponse(value: unknown): SightingSubmissionResponse {
  if (!hasExactKeys(value, ['sightingId', 'visibility', 'visibleAt', 'requestId']) ||
      typeof value.sightingId !== 'string' || !UUID.test(value.sightingId) ||
      (value.visibility !== 'public' && value.visibility !== 'hidden') ||
      typeof value.requestId !== 'string' || !UUID.test(value.requestId)) {
    throw new Error('invalid_sighting_submission_response');
  }
  const visibleAt = value.visibleAt === null ? null : canonicalizeResponseTimestamp(value.visibleAt);
  if (value.visibleAt !== null && visibleAt === null) throw new Error('invalid_sighting_submission_response');
  return { sightingId: value.sightingId, visibility: value.visibility, visibleAt, requestId: value.requestId };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_SIGHTING_RESPONSE_BYTES)) {
    throw new Error('invalid_sighting_submission_response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_sighting_submission_response');

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_SIGHTING_RESPONSE_BYTES) throw new Error('invalid_sighting_submission_response');
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

function serverErrorCode(body: unknown): string {
  return isPlainObject(body) && typeof body.error === 'string' && SERVER_ERROR_CODES.has(body.error)
    ? body.error
    : 'submission_failed';
}

function sightingEndpoint(supabaseUrl: string, insecureOrigins: readonly string[] = []): string {
  try {
    return `${parseTrustedSupabaseOrigin(supabaseUrl, insecureOrigins)}/functions/v1/create-sighting`;
  } catch {
    throw new Error('invalid_sighting_submission_response');
  }
}

async function sendSightingSubmission(
  supabaseUrl: string,
  accessToken: string,
  body: Record<string, unknown>,
  insecureOrigins?: readonly string[],
): Promise<{ response: Response; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(sightingEndpoint(supabaseUrl, insecureOrigins), {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_sighting_submission_response') throw error;
    throw new Error('submission_failed');
  }
  if (response.redirected || response.status === 307 || response.status === 308) {
    throw new Error('invalid_sighting_submission_response');
  }
  try {
    return { response, body: await readBoundedJson(response) };
  } catch {
    throw new Error('invalid_sighting_submission_response');
  }
}

export function buildSightingPayload(input: SightingDraftInput) {
  const location = input.location.kind === 'device_once'
    ? { latitude: input.location.latitude, longitude: input.location.longitude }
    : { manualPublicCellId: input.location.publicCellId };
  return {
    ...location,
    occurredAt: input.occurredAt.toISOString(),
    risk: input.risk,
    traits: input.traits,
    notes: input.notes,
    clientDedupeKey: input.clientDedupeKey,
  };
}

export async function submitSighting(input: {
  supabaseUrl: string;
  accessToken: string;
  draft: SightingDraftInput;
  insecureOrigins?: readonly string[];
}): Promise<SightingSubmissionResponse> {
  const { response, body } = await sendSightingSubmission(
    input.supabaseUrl,
    input.accessToken,
    buildSightingPayload(input.draft),
    input.insecureOrigins,
  );
  if (!response.ok) {
    throw new Error(serverErrorCode(body));
  }
  return parseSightingSubmissionResponse(body);
}

export async function recoverSightingSubmission(input: {
  supabaseUrl: string;
  accessToken: string;
  clientDedupeKey: string;
  insecureOrigins?: readonly string[];
}): Promise<SightingRecoveryOutcome> {
  const { response, body } = await sendSightingSubmission(input.supabaseUrl, input.accessToken, {
    clientDedupeKey: input.clientDedupeKey,
    recoverExisting: true,
  }, input.insecureOrigins);
  if (response.status === 404 && serverErrorCode(body) === 'sighting_submission_not_found') {
    return { kind: 'not_found' };
  }
  if (!response.ok) throw new Error(serverErrorCode(body));
  return parseSightingSubmissionResponse(body);
}
