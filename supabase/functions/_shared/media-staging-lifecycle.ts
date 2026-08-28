/** Supabase Storage signed-upload tokens are minted for two hours. */
export const UPLOAD_CREDENTIAL_VALIDITY_MS = 2 * 60 * 60 * 1000;
/** A clock/skew buffer before an expired credential is treated as unusable. */
export const UPLOAD_CREDENTIAL_SAFETY_BUFFER_MS = 5 * 60 * 1000;
export const CLEANUP_LEASE_MS = 5 * 60 * 1000;

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const CANONICAL_STAGING_OBJECT_PATH = /^jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;

export type CleanupCandidate = Readonly<{
  id: string;
  status: 'reserved' | 'finalized' | 'deletion_pending';
  reservationExpiresAt: Date;
  uploadCredentialUsableUntil: Date | null;
  nextCleanupAt: Date;
  cleanupClaimedAt: Date | null;
  mediaDeletedAt: Date | null;
}>;

export type CleanupAction = 'none' | 'remove_and_retry' | 'defer_delete' | 'remove_and_purge';

type SignedUploadUrlInput = Readonly<{
  internalSupabaseUrl: string;
  publicSupabaseOrigin: string;
  objectPath: string;
  signedUrl: string;
  token: string;
}>;

function canonicalHttpOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.username === '' && parsed.password === '' && parsed.pathname === '/' &&
      parsed.search === '' && parsed.hash === '' && value === parsed.origin
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Storage derives signed URLs from the internal service origin used by Edge.
 * Verify that exact internal capability before exposing the same path and
 * query through the separately configured client-facing origin.
 */
export function rewriteVerifiedSignedUploadUrl(input: SignedUploadUrlInput): string | null {
  const internalOrigin = canonicalHttpOrigin(input.internalSupabaseUrl);
  const publicSupabaseOrigin = canonicalHttpOrigin(input.publicSupabaseOrigin);
  if (internalOrigin === null || publicSupabaseOrigin === null ||
      typeof input.objectPath !== 'string' || !CANONICAL_STAGING_OBJECT_PATH.test(input.objectPath) ||
      typeof input.token !== 'string' || input.token.length < 1 || input.token.length > 8192 ||
      /[\r\n\0]/.test(input.token) || typeof input.signedUrl !== 'string') return null;

  const uploadPath = `/storage/v1/object/upload/sign/media-staging/${input.objectPath}`;
  const query = `?token=${encodeURIComponent(input.token)}`;
  if (input.signedUrl !== `${internalOrigin}${uploadPath}${query}`) return null;
  return `${publicSupabaseOrigin}${uploadPath}${query}`;
}

/**
 * Storage only tells us after minting; start the two-hour window immediately
 * before the request so this client-facing time never overstates usability.
 */
export function deriveConservativeUploadCredentialUsableUntil(mintStartedAt: Date): Date {
  return new Date(mintStartedAt.getTime() + UPLOAD_CREDENTIAL_VALIDITY_MS);
}

/** Mirrors the database's cleanup watermark without changing a token response. */
export function extendCredentialUsableUntilWatermark(
  current: Date | null,
  requestBound: Date,
): Date {
  return current !== null && current.getTime() > requestBound.getTime() ? current : requestBound;
}

/**
 * Accept the bounded ISO forms returned by PostgREST and normalize them to
 * JavaScript's millisecond UTC wire representation. Calendar checks prevent
 * Date from silently normalizing invalid source dates.
 */
export function canonicalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const match = ISO_TIMESTAMP.exec(value);
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

export function safePurgeAt(candidate: CleanupCandidate): Date {
  const credentialExpiry = candidate.uploadCredentialUsableUntil ?? candidate.reservationExpiresAt;
  return new Date(credentialExpiry.getTime() + UPLOAD_CREDENTIAL_SAFETY_BUFFER_MS);
}

export function cleanupAction(candidate: CleanupCandidate, now: Date): CleanupAction {
  const terminallySafe = now.getTime() >= safePurgeAt(candidate).getTime();
  if (candidate.status === 'reserved') {
    if (now.getTime() < candidate.reservationExpiresAt.getTime()) return 'none';
    return terminallySafe ? 'remove_and_purge' : 'remove_and_retry';
  }
  if (candidate.status === 'deletion_pending') return terminallySafe ? 'remove_and_purge' : 'defer_delete';
  return 'none';
}

/** Mirrors the service-RPC claim predicate: due first, then deterministic ID. */
export function selectFairCleanupJobs(
  candidates: readonly CleanupCandidate[],
  now: Date,
  limit: number,
): CleanupCandidate[] {
  return candidates
    .filter((candidate) => candidate.nextCleanupAt.getTime() <= now.getTime())
    .filter((candidate) => candidate.cleanupClaimedAt === null ||
      candidate.cleanupClaimedAt.getTime() <= now.getTime() - CLEANUP_LEASE_MS)
    .filter((candidate) => cleanupAction(candidate, now) !== 'none')
    .sort((left, right) => left.nextCleanupAt.getTime() - right.nextCleanupAt.getTime() || left.id.localeCompare(right.id))
    .slice(0, limit);
}
