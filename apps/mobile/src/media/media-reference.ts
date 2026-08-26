const STABLE_ID = '[A-Za-z0-9][A-Za-z0-9-]{7,63}';
const FINAL_REFERENCE = new RegExp(`^reviewed-media/(${STABLE_ID})\\.(${STABLE_ID})\\.agcm$`);
const TEMP_REFERENCE = new RegExp(`^reviewed-media/\\.(${STABLE_ID})\\.(${STABLE_ID})\\.(${STABLE_ID})\\.tmp$`);

export function isStableMediaId(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${STABLE_ID}$`).test(value);
}

export function createReviewedMediaReference(mediaId: string, commitId: string): string {
  if (!isStableMediaId(mediaId) || !isStableMediaId(commitId)) throw new Error('invalid_media_identity');
  return `reviewed-media/${mediaId}.${commitId}.agcm`;
}

export function isReviewedMediaReference(value: unknown, expectedMediaId?: string): value is string {
  if (typeof value !== 'string') return false;
  const match = FINAL_REFERENCE.exec(value);
  return !!match && (expectedMediaId === undefined || match[1] === expectedMediaId);
}

export function isReviewedMediaTempReference(value: unknown): value is string {
  return typeof value === 'string' && TEMP_REFERENCE.test(value);
}

export function createReviewedMediaTempReference(finalReference: string, temporaryId: string): string {
  const match = FINAL_REFERENCE.exec(finalReference);
  if (!match || !isStableMediaId(temporaryId)) throw new Error('invalid_reviewed_media_reference');
  return `reviewed-media/.${match[1]}.${match[2]}.${temporaryId}.tmp`;
}

export function selectReviewedMediaSweepTargets(entries: readonly string[]): string[] {
  return entries.filter(isReviewedMediaTempReference);
}
