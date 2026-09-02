import { resumeValidatedReportDraft, validatedReturnDraftId } from './profile-report-return';

const draftId = '00000000-0000-4000-8000-000000000701';

describe('Profile report return recovery', () => {
  it('discards malformed return IDs without checking or navigating', async () => {
    const getSessionSubject = jest.fn(async () => 'owner-12345678');
    const navigate = jest.fn();
    expect(validatedReturnDraftId('notes=private&draftId=bad')).toBeNull();
    const authorizeDraft = jest.fn(async () => true);
    await expect(resumeValidatedReportDraft('notes=private&draftId=bad', getSessionSubject, authorizeDraft, navigate))
      .resolves.toBe('invalid');
    expect(getSessionSubject).not.toHaveBeenCalled();
    expect(authorizeDraft).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('resumes only after a confirmed session using the same opaque draft ID', async () => {
    const navigate = jest.fn();
    const authorizeDraft = jest.fn(async () => true);
    await expect(resumeValidatedReportDraft(draftId, async () => null, authorizeDraft, navigate)).resolves.toBe('signed_out');
    expect(navigate).not.toHaveBeenCalled();
    await expect(resumeValidatedReportDraft(draftId, async () => 'owner-12345678', authorizeDraft, navigate)).resolves.toBe('resumed');
    expect(authorizeDraft).toHaveBeenCalledWith(draftId, 'owner-12345678');
    expect(navigate).toHaveBeenCalledWith(`/report/new?draftId=${draftId}`);
  });

  it('does not resume a draft owned by another account', async () => {
    const navigate = jest.fn();
    await expect(resumeValidatedReportDraft(
      draftId, async () => 'owner-bbbbbbbb', async () => false, navigate,
    )).resolves.toBe('unauthorized');
    expect(navigate).not.toHaveBeenCalled();
  });
});
