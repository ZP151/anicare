import {createHash} from 'node:crypto';

/** Exact recoverable IDs for this workflow attempt, even after process loss. */
export function communityCleanupFixture(run: number, attempt: number) {
  if (!Number.isSafeInteger(run) || run < 1 || !Number.isSafeInteger(attempt) || attempt < 1) throw new Error('invalid_cleanup_fixture');
  const hash = (label: string) => createHash('sha256').update(`animalhelper-community-cleanup-v1:${run}:${attempt}:${label}`).digest('hex');
  const id = (label: string) => { const h=hash(label); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
  return {expired:id('expired'),live:id('live'),requestExpired:id('request-expired'),requestLive:id('request-live'),payloadHash:hash('fixture')};
}
