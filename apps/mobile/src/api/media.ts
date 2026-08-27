import { MAX_REVIEWED_MEDIA_BYTES, type ReviewReceipt } from '../media/contracts';
import { isStableMediaId } from '../media/media-reference';

export type ReserveMediaInput = Readonly<{
  sightingId: string;
  mediaId: string;
  receipt: ReviewReceipt;
}>;

export type ReserveMediaRequest = Readonly<{
  sightingId: string;
  mediaId: string;
  sha256: string;
  byteLength: number;
  review: Readonly<{
    recipeVersion: 'jpeg-srgb-2048-q88.v1';
    detectorVersions: Readonly<{ cats: 'unavailable'; people: 'unavailable'; plates: 'unavailable' }>;
    width: number;
    height: number;
    confirmedAtLocal: string;
  }>;
}>;

export type FinalizeMediaInput = Readonly<{
  sightingId: string;
  mediaId: string;
  sha256: string;
}>;

export type MediaReservationResponse = Readonly<{
  jobId: string;
  mediaId: string;
  reservationExpiresAt: string;
  /** Conservative lower bound captured before Storage minted the token. */
  uploadCredentialUsableUntil: string;
  upload: Readonly<{ signedUrl: string; token: string }>;
}>;

/**
 * Authenticated plaintext is scoped to the callback. Callers must not retain
 * the bytes after the returned promise settles.
 */
export interface ReviewedArtifactReader {
  withDecryptedReviewedJpeg<T>(input: Readonly<{
    draftId: string;
    mediaId: string;
    encryptedReviewedRef: string;
    encryptionVersion: 'aes-256-gcm.v1';
    receipt: ReviewReceipt;
  }>, consume: (artifact: Readonly<{
    bytes: Uint8Array;
    sha256: string;
    byteLength: number;
  }>) => Promise<T> | T): Promise<T>;
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

function validSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function validConfirmedAt(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

const RESPONSE_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

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

function validSignedUpload(value: unknown): value is Readonly<{ signedUrl: string; token: string }> {
  if (!hasExactKeys(value, ['signedUrl', 'token']) || typeof value.signedUrl !== 'string' ||
      typeof value.token !== 'string' || value.token.length < 1 || value.token.length > 8192) return false;
  try {
    return new URL(value.signedUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

function validDetectorVersions(value: unknown): value is Readonly<{ cats: 'unavailable'; people: 'unavailable'; plates: 'unavailable' }> {
  return hasExactKeys(value, ['cats', 'people', 'plates']) &&
    value.cats === 'unavailable' && value.people === 'unavailable' && value.plates === 'unavailable';
}

function validReceipt(value: unknown): value is ReviewReceipt {
  if (!hasExactKeys(value, [
    'sanitizedSha256', 'recipeVersion', 'detectorVersions', 'width', 'height', 'byteLength', 'confirmedAtLocal',
  ])) return false;
  return validSha256(value.sanitizedSha256) && value.recipeVersion === 'jpeg-srgb-2048-q88.v1' &&
    validDetectorVersions(value.detectorVersions) &&
    typeof value.width === 'number' && Number.isInteger(value.width) && value.width > 0 && value.width <= 2048 &&
    typeof value.height === 'number' && Number.isInteger(value.height) && value.height > 0 && value.height <= 2048 &&
    typeof value.byteLength === 'number' && Number.isInteger(value.byteLength) && value.byteLength > 0 && value.byteLength <= MAX_REVIEWED_MEDIA_BYTES &&
    validConfirmedAt(value.confirmedAtLocal);
}

export function buildReserveMediaRequest(input: ReserveMediaInput): ReserveMediaRequest {
  if (!hasExactKeys(input, ['sightingId', 'mediaId', 'receipt']) ||
      !isStableMediaId(input.sightingId) || !isStableMediaId(input.mediaId) || !validReceipt(input.receipt)) {
    throw new Error('invalid_media_reservation');
  }
  const receipt = input.receipt;
  return {
    sightingId: input.sightingId,
    mediaId: input.mediaId,
    sha256: receipt.sanitizedSha256.toLowerCase(),
    byteLength: receipt.byteLength,
    review: {
      recipeVersion: 'jpeg-srgb-2048-q88.v1',
      detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
      width: receipt.width,
      height: receipt.height,
      confirmedAtLocal: receipt.confirmedAtLocal,
    },
  };
}

export function buildFinalizeMediaRequest(input: FinalizeMediaInput): FinalizeMediaInput {
  if (!hasExactKeys(input, ['sightingId', 'mediaId', 'sha256']) ||
      !isStableMediaId(input.sightingId) || !isStableMediaId(input.mediaId) || !validSha256(input.sha256)) {
    throw new Error('invalid_media_finalization');
  }
  return { sightingId: input.sightingId, mediaId: input.mediaId, sha256: input.sha256.toLowerCase() };
}

/**
 * This maps a narrow response contract only. It intentionally does not start
 * transport: Task 2 has no native authenticated reviewed-artifact reader yet.
 */
export function parseMediaReservationResponse(value: unknown): MediaReservationResponse {
  const reservationExpiresAt = isPlainObject(value) ? canonicalizeResponseTimestamp(value.reservationExpiresAt) : null;
  const uploadCredentialUsableUntil = isPlainObject(value)
    ? canonicalizeResponseTimestamp(value.uploadCredentialUsableUntil)
    : null;
  if (!hasExactKeys(value, [
    'jobId', 'mediaId', 'reservationExpiresAt', 'uploadCredentialUsableUntil', 'upload',
  ]) || !isStableMediaId(value.jobId) || !isStableMediaId(value.mediaId) ||
      reservationExpiresAt === null || uploadCredentialUsableUntil === null ||
      Date.parse(uploadCredentialUsableUntil) <= Date.parse(reservationExpiresAt) ||
      !validSignedUpload(value.upload)) {
    throw new Error('invalid_media_reservation_response');
  }
  return {
    jobId: value.jobId as string,
    mediaId: value.mediaId as string,
    reservationExpiresAt,
    uploadCredentialUsableUntil,
    upload: value.upload as Readonly<{ signedUrl: string; token: string }>,
  };
}
