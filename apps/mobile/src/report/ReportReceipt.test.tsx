import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { MyReportSummary } from '../api/my-reports';
import type { StoredDraft } from '../offline/draft-policy';
import { ReportReceipt, type ReportReceiptDependencies } from './ReportReceipt';

const sightingId = '00000000-0000-4000-8000-000000000711';

const remote = (overrides: Partial<MyReportSummary> = {}): MyReportSummary => ({
  sightingId,
  occurredAt: '2026-08-31T09:00:00.000Z',
  createdAt: '2026-08-31T09:01:00.000Z',
  reportState: 'private_review',
  mediaState: 'none',
  identityState: 'not_requested',
  ...overrides,
});


const local = (overrides: Partial<StoredDraft> = {}): StoredDraft => ({
  id: 'draft-12345678', notes: 'Private note that must not render', risk: 'normal', sightingId,
  report: {
    version: 1, step: 'review', occurredAt: '2026-08-31T08:00:00.000Z', coat: ['tabby'], markings: ['white-paws'],
    condition: 'needs_attention', manualPublicCellId: '89652636d87ffff', updatedAt: '2026-08-31T08:01:00.000Z',
  },
  ...overrides,
});

function dependencies(overrides: Partial<ReportReceiptDependencies> = {}): ReportReceiptDependencies {
  return {
    getSessionSubject: jest.fn(async () => 'owner-12345678'),
    subscribeToAuthChanges: jest.fn(() => () => undefined),
    getSummary: jest.fn(async () => remote()),
    loadDrafts: jest.fn(async () => []),
    deleteReceiptAnchor: jest.fn(async () => undefined),
    listPublicSightings: jest.fn(async () => ({ items: [], nextCursor: null })),
    saveIdentityIntent: jest.fn(async (_draft, _sightingId, _ownerSubject, intent) => ({ intent, requestId: 'abcdef12-1234-1234-1234-123456789abc' })),
    submitIdentityProposal: jest.fn(async () => ({ status: 'tentative' })),
    navigate: jest.fn(),
    ...overrides,
  };
}

describe('ReportReceipt', () => {
  it('does not render account A local anchor when a rejected lookup races an A-to-B auth change', async () => {
    let subject = 'owner-aaaaaaaa';
    let listener: ((next: string | null) => void) | null = null;
    let rejectRemote!: (error: Error) => void;
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getSessionSubject: async () => subject,
      subscribeToAuthChanges: (next) => { listener = next; return () => undefined; },
      getSummary: () => new Promise((_resolve, reject) => { rejectRemote = reject; }),
      loadDrafts: async () => [local({
        notes: '', report: undefined, ownerSubject: 'owner-aaaaaaaa',
        textReceiptCommittedAt: '2026-08-31T09:01:00.000Z',
      })],
    })} locale="en" />);
    subject = 'owner-bbbbbbbb';
    await act(async () => { listener?.(subject); rejectRemote(new Error('offline')); });
    await waitFor(() => expect(view.queryByText(`Report ID: ${sightingId}`)).toBeNull());
  });
  it('shows a submitted text-only report without exposing private report fields', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies()} locale="en" />);

    await waitFor(() => expect(view.getByText('Report received')).toBeTruthy());
    await fireEvent.press(view.getByRole('button',{name:'Report details'}));
    expect(view.getByText(`Report ID: ${sightingId}`)).toBeTruthy();
    expect(view.getByText(/Submitted at /)).toBeTruthy();
    expect(view.getByText('Text-only report')).toBeTruthy();
    const output = JSON.stringify(view.toJSON());
    expect(output).not.toMatch(/89652636d87ffff|Private note|tabby|white-paws|candidate|confidence|model|reviewed-media|public cell/i);
  });

  it('reconciles a minimal local receipt anchor after remote authority confirms the report', async () => {
    const deleteReceiptAnchor = jest.fn(async () => undefined);
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getSummary: async () => remote({ identityState: 'linked' }),
      deleteReceiptAnchor,
      loadDrafts: async () => [local({
        notes: '', report: undefined, ownerSubject: 'owner-12345678',
        textReceiptCommittedAt: '2026-08-31T09:01:00.000Z',
      })],
    })} locale="en" />);
    await waitFor(() => expect(view.getByText('Report received')).toBeTruthy());
    await waitFor(() => expect(deleteReceiptAnchor).toHaveBeenCalledWith('draft-12345678', 'owner-12345678'));
  });

  it('lets the owner replace a rejected proposal on the same report after clearing only its durable continuation', async () => {
    const clearIdentityContinuation = jest.fn(async () => true);
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getIdentityResult: async () => ({ proposalId: '00000000-0000-4000-8000-000000000712', status: 'rejected', decision: 'reject', animalId: null, requestId: '00000000-0000-4000-8000-000000000713' }),
      clearIdentityContinuation,
      loadDrafts: async () => [local({ ownerSubject: 'owner-12345678', identityContinuation: { intent: { kind: 'new' }, requestId: '00000000-0000-4000-8000-000000000713' } })],
      getSummary: async () => remote({ identityState: 'closed' }),
    })} locale="en" />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Choose another identity' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Choose another identity' }));
    await waitFor(() => expect(clearIdentityContinuation).toHaveBeenCalledWith('draft-12345678', sightingId, 'owner-12345678', '00000000-0000-4000-8000-000000000713'));
    await waitFor(() => expect(view.getByRole('button', { name: 'Submit as a new cat' })).toBeTruthy());
  });


  it('restarts a remote-only rejection on the same report and creates a new durable intent', async () => {
    const deps = dependencies({
      getSummary: async () => remote({ identityState: 'closed' }),
      getIdentityResult: async () => ({ proposalId: '00000000-0000-4000-8000-000000000712', status: 'rejected', decision: 'reject', animalId: null, requestId: '00000000-0000-4000-8000-000000000713' }),
    });
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={deps} locale="en" />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Choose another identity' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Choose another identity' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Submit as a new cat' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Submit as a new cat' }));
    await waitFor(() => expect(deps.submitIdentityProposal).toHaveBeenCalledWith(sightingId, { kind: 'new' }, 'abcdef12-1234-1234-1234-123456789abc'));
    expect(deps.saveIdentityIntent).toHaveBeenCalledWith(null, sightingId, 'owner-12345678', { kind: 'new' });
  });

  it('preserves a newer durable request when the remote result still describes the old rejected request', async () => {
    const clearIdentityContinuation = jest.fn(async () => true);
    const newRequest = '00000000-0000-4000-8000-000000000714';
    const deps = dependencies({
      getSummary: async () => remote({ identityState: 'closed' }),
      getIdentityResult: async () => ({ proposalId: '00000000-0000-4000-8000-000000000712', status: 'rejected', decision: 'reject', animalId: null, requestId: '00000000-0000-4000-8000-000000000713' }),
      clearIdentityContinuation,
      loadDrafts: async () => [local({ ownerSubject: 'owner-12345678', identityContinuation: { intent: { kind: 'new' }, requestId: newRequest } })],
    });
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={deps} locale="en" />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Choose another identity' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Choose another identity' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Retry identity proposal' })).toBeTruthy());
    expect(clearIdentityContinuation).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Retry identity proposal' }));
    await waitFor(() => expect(deps.submitIdentityProposal).toHaveBeenCalledWith(sightingId, { kind: 'new' }, newRequest));
  });

  it('does not clear a continuation when the authoritative result changed before retry', async () => {
    const clearIdentityContinuation = jest.fn(async () => true);
    const getIdentityResult = jest.fn().mockResolvedValueOnce({ proposalId: '00000000-0000-4000-8000-000000000712', status: 'rejected', decision: 'reject', animalId: null, requestId: '00000000-0000-4000-8000-000000000713' })
      .mockResolvedValue({ proposalId: '00000000-0000-4000-8000-000000000715', status: 'tentative', decision: null, animalId: null, requestId: '00000000-0000-4000-8000-000000000714' });
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getIdentityResult, clearIdentityContinuation, getSummary: async () => remote({ identityState: 'closed' }),
      loadDrafts: async () => [local({ ownerSubject: 'owner-12345678', identityContinuation: { intent: { kind: 'new' }, requestId: '00000000-0000-4000-8000-000000000713' } })],
    })} locale="en" />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Choose another identity' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Choose another identity' }));
    await waitFor(() => expect(getIdentityResult).toHaveBeenCalledTimes(2));
    expect(clearIdentityContinuation).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByText('Identity review pending')).toBeTruthy());
  });


  it('discards a rejected-retry response after an account switch', async () => {
    let owner = 'owner-12345678';
    let listener: ((subject: string | null) => void) | undefined;
    let resolveRetry!: (value: unknown) => void;
    const rejected = { proposalId: '00000000-0000-4000-8000-000000000712', status: 'rejected' as const, decision: 'reject' as const, animalId: null, requestId: '00000000-0000-4000-8000-000000000713' };
    const getIdentityResult = jest.fn().mockResolvedValueOnce(rejected).mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; })).mockResolvedValue(null);
    const clearIdentityContinuation = jest.fn(async () => true);
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getIdentityResult, clearIdentityContinuation, getSessionSubject: async () => owner,
      subscribeToAuthChanges: (next) => { listener = next; return () => {}; },
      getSummary: async () => owner === 'owner-12345678' ? remote({ identityState: 'closed' }) : null,
      loadDrafts: async () => [local({ ownerSubject: 'owner-12345678', identityContinuation: { intent: { kind: 'new' }, requestId: rejected.requestId } })],
    })} locale="en" />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Choose another identity' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Choose another identity' }));
    await waitFor(() => expect(resolveRetry).toBeDefined());
    await act(async () => { owner = 'owner-bbbbbbbb'; listener?.(owner); resolveRetry(rejected); });
    expect(clearIdentityContinuation).not.toHaveBeenCalled();
    await waitFor(() => expect(view.queryByRole('button', { name: 'Submit as a new cat' })).toBeNull());
    expect(view.queryByText(`Report ID: ${sightingId}`)).toBeNull();
  });

  it.each([
    ['private_review', 'none', 'Private review'],
    ['delayed', 'pending', 'Media upload pending'],
    ['published', 'none', 'Published after review'],
  ] as const)('renders the truthful remote %s / %s status', async (reportState, mediaState, expected) => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({ getSummary: async () => remote({ reportState, mediaState }) })} locale="en" />);
    await waitFor(() => expect(view.getByText(expected)).toBeTruthy());
  });

  it('never labels quarantined media public and keeps durable local recovery status', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getSummary: async () => remote({ mediaState: 'quarantined', identityState: 'pending_review' }),
      loadDrafts: async () => [local({ ownerSubject: 'owner-12345678', uploadJob: { state: 'needs_user', attempts: 1, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })],
    })} locale="en" />);

    await waitFor(() => expect(view.getByText('Media needs your attention')).toBeTruthy());
    expect(view.getByText('Identity review pending')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/public|89652636d87ffff|Private note|tabby|reviewed-media/i);
  });

  it('uses only durable local status while remote status is unavailable', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getSummary: async () => { throw new Error('my_reports_unavailable'); },
      loadDrafts: async () => [local({ ownerSubject: 'owner-12345678', uploadJob: { state: 'quarantined', attempts: 1, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: null } })],
    })} locale="en" />);

    await waitFor(() => expect(view.getByText('Remote status is unavailable. Showing status saved on this device.')).toBeTruthy());
    expect(view.getByText('Private media awaiting validation')).toBeTruthy();
  });

  it('always shows the committed reference from a subject-matched text-only local anchor when remote lookup fails', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getSummary: async () => { throw new Error('my_reports_unavailable'); },
      loadDrafts: async () => [local({
        notes: '', report: undefined, ownerSubject: 'owner-12345678',
        textReceiptCommittedAt: '2026-08-31T09:01:00.000Z',
      })],
    })} locale="en" />);

    await view.findByRole('button',{name:'Report details'});
    await fireEvent.press(view.getByRole('button',{name:'Report details'}));
    expect(view.getByText(`Report ID: ${sightingId}`)).toBeTruthy();
    expect(view.getByText('Submission committed on this device')).toBeTruthy();
    expect(view.getByText(/Submitted at /)).toBeTruthy();
    expect(view.getByText('Remote status is unavailable. Showing status saved on this device.')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/private note|tabby|white-paws|89652636d87ffff/i);
  });

  it('does not expose another account local receipt anchor', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getSummary: async () => { throw new Error('my_reports_unavailable'); },
      loadDrafts: async () => [local({ ownerSubject: 'owner-bbbbbbbb' })],
    })} locale="en" />);
    await waitFor(() => expect(view.getByText('Report unavailable')).toBeTruthy());
    expect(view.queryByText(`Report ID: ${sightingId}`)).toBeNull();
  });

  it('does not resurrect stale local pending media after an authoritative lookup says the report is absent', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getSummary: async () => null,
      loadDrafts: async () => [local({ ownerSubject: 'owner-12345678', uploadJob: { state: 'upload_pending', attempts: 0, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: null } })],
    })} locale="en" />);

    await waitFor(() => expect(view.getByText('Report unavailable')).toBeTruthy());
    expect(view.queryByText('Report received')).toBeNull();
    expect(view.queryByText('Media upload pending')).toBeNull();
  });

  it('keeps only an explicit local needs-user recovery after an authoritative lookup says the report is absent', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      getSummary: async () => null,
      loadDrafts: async () => [local({ ownerSubject: 'owner-12345678', uploadJob: { state: 'needs_user', attempts: 1, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })],
    })} locale="en" />);

    await waitFor(() => expect(view.getByText('Local media recovery needs your attention.')).toBeTruthy());
    expect(view.getByText('Media needs your attention')).toBeTruthy();
  });

  it('rejects missing or malformed sighting IDs without loading status', async () => {
    const run = dependencies();
    const view = await render(<ReportReceipt sightingId="not-an-id" dependencies={run} locale="en" />);
    expect(view.getByText('Report unavailable')).toBeTruthy();
    expect(run.getSummary).not.toHaveBeenCalled();
  });

  it('offers My Reports, the Report hub, and Nearby as reachable actions', async () => {
    const run = dependencies();
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={run} locale="en" />);
    await waitFor(() => expect(view.getByRole('button', { name: 'View My Reports' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'View My Reports' }));
    await fireEvent.press(view.getByRole('button', { name: 'Back to Report' }));
    await fireEvent.press(view.getByRole('button', { name: 'Browse Nearby' }));
    expect(run.navigate).toHaveBeenNthCalledWith(1, '/report/my-reports');
    expect(run.navigate).toHaveBeenNthCalledWith(2, '/report');
    expect(run.navigate).toHaveBeenNthCalledWith(3, '/');
  });
});

const publicAnimalId = '00000000-0000-4000-8000-000000002599';
it('opens a confirmed receipt profile only after a fresh public by-ID lookup', async () => {
 const deps = dependencies({
  getSummary: async () => remote({identityState:'linked'}),
  getIdentityResult: async () => ({ proposalId:sightingId,status:'confirmed',decision:'confirm',animalId:publicAnimalId,requestId:null }),
  getPublicCatSummary: jest.fn(async () => ({ animalId:publicAnimalId,primaryAlias:'Cat',verification:'reported' as const,timeBucket:null })),
 });
 const view = await render(<ReportReceipt sightingId={sightingId} dependencies={deps} locale="en" />);
 await fireEvent.press(await view.findByRole('button',{name:'Open cat profile'}));
 await waitFor(() => expect(deps.navigate).toHaveBeenCalledWith(`/cat/${publicAnimalId}`));
 expect(deps.getPublicCatSummary).toHaveBeenCalledWith(publicAnimalId);
});
it.each(['withdrawn','account_changed'])('does not open a confirmed profile after %s', async (failure) => {
 let owner = 'owner-12345678';
 const deps = dependencies({
  getSessionSubject: async () => owner,
  getSummary: async () => remote({identityState:'linked'}),
  getIdentityResult: async () => ({proposalId:sightingId,status:'confirmed',decision:'confirm',animalId:publicAnimalId,requestId:null}),
  getPublicCatSummary: async () => { if (failure === 'account_changed') owner = 'other-owner'; return failure === 'withdrawn' ? null : {animalId:publicAnimalId,primaryAlias:'Cat',verification:'reported' as const,timeBucket:null}; },
 });
 const view = await render(<ReportReceipt sightingId={sightingId} dependencies={deps} locale="en" />);
 await fireEvent.press(await view.findByRole('button',{name:'Open cat profile'}));
 expect(deps.navigate).not.toHaveBeenCalled();
});
it('keeps a confirmed but non-public identity generic without a profile link', async () => {
 const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
  getSummary:async () => remote({identityState:'linked'}),
  getIdentityResult:async () => ({proposalId:sightingId,status:'confirmed',decision:'confirm',animalId:null,requestId:null}),
 })} locale="en" />);
 await view.findByText('Identity confirmed by independent review.');
 expect(view.queryByRole('button',{name:'Open cat profile'})).toBeNull();
});
