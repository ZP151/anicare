const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Job = Readonly<{ job_id: string; thumb_path: string; display_path: string; claim_id: string }>;
type Dependencies = Readonly<{ remove(paths: readonly string[]): Promise<boolean>; complete(jobId: string, claimId: string): Promise<boolean> }>;

function valid(job: unknown): job is Job {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return false;
  const value = job as Partial<Job>;
  return typeof value.job_id === 'string' && uuid.test(value.job_id) && typeof value.claim_id === 'string' && uuid.test(value.claim_id) && value.thumb_path === `media/${value.job_id}/thumb.jpg` && value.display_path === `media/${value.job_id}/display.jpg`;
}

export async function processCommunityMediaCleanup(candidates: readonly unknown[], dependencies: Dependencies): Promise<{ claimed: number; completed: number }> {
  let completed = 0;
  for (const candidate of candidates) {
    if (!valid(candidate)) continue;
    if (await dependencies.remove([candidate.thumb_path, candidate.display_path]) && await dependencies.complete(candidate.job_id, candidate.claim_id)) completed += 1;
  }
  return { claimed: candidates.length, completed };
}
