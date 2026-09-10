import { describe, expect, it } from 'vitest';

import { processCommunityMediaCleanup } from './community-media-cleanup.js';

describe('community media cleanup', () => {
  it('removes both fixed variants before completing its claim', async () => {
    const calls: string[] = [];
    const result = await processCommunityMediaCleanup([{ job_id: '00000000-0000-4000-8000-000000003711', thumb_path: 'media/00000000-0000-4000-8000-000000003711/thumb.jpg', display_path: 'media/00000000-0000-4000-8000-000000003711/display.jpg', claim_id: '00000000-0000-4000-8000-000000003712' }], {
      remove: async paths => { calls.push(...paths); return true; },
      complete: async () => { calls.push('complete'); return true; },
    });
    expect(result).toEqual({ claimed: 1, completed: 1 });
    expect(calls).toEqual(['media/00000000-0000-4000-8000-000000003711/thumb.jpg', 'media/00000000-0000-4000-8000-000000003711/display.jpg', 'complete']);
  });

  it('does not complete a claim when one physical removal fails', async () => {
    const result = await processCommunityMediaCleanup([{ job_id: '00000000-0000-4000-8000-000000003711', thumb_path: 'media/00000000-0000-4000-8000-000000003711/thumb.jpg', display_path: 'media/00000000-0000-4000-8000-000000003711/display.jpg', claim_id: '00000000-0000-4000-8000-000000003712' }], { remove: async () => false, complete: async () => true });
    expect(result).toEqual({ claimed: 1, completed: 0 });
  });
});
