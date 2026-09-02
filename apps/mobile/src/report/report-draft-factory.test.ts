import { createOwnerAwareReportDraft } from './report-draft-factory';

const draftId = '00000000-0000-4000-8000-000000000701';

describe('owner-aware Report draft factory', () => {
  it.each(['nearby', 'map', 'cat_detail'] as const)('binds the %s entry draft to the verified signed-in subject', async () => {
    const saveDraft = jest.fn(async (input) => input as never);
    await createOwnerAwareReportDraft({
      readAuthSnapshot: async () => ({ ownerSubject: 'owner-12345678' }),
      saveDraft,
      createId: () => draftId,
      now: () => new Date('2026-09-01T12:00:00.000Z'),
    });
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      ownerSubject: 'owner-12345678',
      report: expect.objectContaining({ creatorMode: 'authenticated' }),
    }));
  });

  it('marks a verified signed-out draft explicitly anonymous and fails closed on auth change', async () => {
    const saveDraft = jest.fn(async (input) => input as never);
    let reads = 0;
    await expect(createOwnerAwareReportDraft({
      readAuthSnapshot: async () => ({ ownerSubject: reads++ === 0 ? null : 'owner-12345678' }),
      saveDraft,
      createId: () => draftId,
      now: () => new Date('2026-09-01T12:00:00.000Z'),
    })).rejects.toThrow('authentication_changed');
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      report: expect.objectContaining({ creatorMode: 'anonymous' }),
    }));
  });
});
