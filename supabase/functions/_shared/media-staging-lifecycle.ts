/** Supabase Storage signed-upload tokens are minted for two hours. */
export const UPLOAD_CREDENTIAL_VALIDITY_MS = 2 * 60 * 60 * 1000;
/** A clock/skew buffer before an expired credential is treated as unusable. */
export const UPLOAD_CREDENTIAL_SAFETY_BUFFER_MS = 5 * 60 * 1000;
export const CLEANUP_LEASE_MS = 5 * 60 * 1000;

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

/**
 * Storage only tells us after minting; start the two-hour window immediately
 * before the request so this client-facing time never overstates usability.
 */
export function deriveConservativeUploadCredentialUsableUntil(mintStartedAt: Date): Date {
  return new Date(mintStartedAt.getTime() + UPLOAD_CREDENTIAL_VALIDITY_MS);
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
