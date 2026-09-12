import { describe, expect, it, vi } from 'vitest';

import { processCommunityMediaCleanup } from './community-media-cleanup.js';

describe('community media cleanup', () => {
  it.each([
    {media_id:undefined}, {media_id:'invalid'},
    {thumb_path:'media/00000000-0000-4000-8000-000000003710/thumb.jpg'},
    {display_path:'media/00000000-0000-4000-8000-000000003799/display.jpg'},
  ])('rejects invalid media binding before any deletion %j', async override=>{
    const remove=vi.fn(),complete=vi.fn();
    const row={job_id:'00000000-0000-4000-8000-000000003710',media_id:'00000000-0000-4000-8000-000000003711',claim_id:'00000000-0000-4000-8000-000000003712',thumb_path:'media/00000000-0000-4000-8000-000000003711/thumb.jpg',display_path:'media/00000000-0000-4000-8000-000000003711/display.jpg',...override};
    expect(await processCommunityMediaCleanup([row],{remove,complete})).toEqual({claimed:1,completed:0});
    expect(remove).not.toHaveBeenCalled();expect(complete).not.toHaveBeenCalled();
  });
  it('removes both fixed variants before completing its claim', async () => {
    const calls: string[] = [];
    const result = await processCommunityMediaCleanup([{ job_id: '00000000-0000-4000-8000-000000003710', media_id: '00000000-0000-4000-8000-000000003711', thumb_path: 'media/00000000-0000-4000-8000-000000003711/thumb.jpg', display_path: 'media/00000000-0000-4000-8000-000000003711/display.jpg', claim_id: '00000000-0000-4000-8000-000000003712' }], {
      remove: async paths => { calls.push(...paths); return true; },
      complete: async (id, claim) => { expect(id).toBe('00000000-0000-4000-8000-000000003710'); expect(claim).toBe('00000000-0000-4000-8000-000000003712'); calls.push('complete'); return true; },
    });
    expect(result).toEqual({ claimed: 1, completed: 1 });
    expect(calls).toEqual(['media/00000000-0000-4000-8000-000000003711/thumb.jpg', 'media/00000000-0000-4000-8000-000000003711/display.jpg', 'complete']);
  });

  it('does not complete a claim when one physical removal fails', async () => {
    const result = await processCommunityMediaCleanup([{ job_id: '00000000-0000-4000-8000-000000003710', media_id: '00000000-0000-4000-8000-000000003711', thumb_path: 'media/00000000-0000-4000-8000-000000003711/thumb.jpg', display_path: 'media/00000000-0000-4000-8000-000000003711/display.jpg', claim_id: '00000000-0000-4000-8000-000000003712' }], { remove: async () => false, complete: async () => true });
    expect(result).toEqual({ claimed: 1, completed: 0 });
  });
});
