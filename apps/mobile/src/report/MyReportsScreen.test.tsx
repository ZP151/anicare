import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { MyReportsCursor, MyReportsPage, MyReportSummary } from '../api/my-reports';
import type { StoredDraft } from '../offline/draft-policy';
import { MyReportsScreen, type MyReportsDependencies } from './MyReportsScreen';

const first: MyReportSummary = {
  sightingId: '00000000-0000-4000-8000-000000000721', occurredAt: '2026-08-31T09:00:00.000Z', createdAt: '2026-08-31T09:01:00.000Z',
  reportState: 'private_review', mediaState: 'quarantined', identityState: 'pending_review',
};
const second: MyReportSummary = { ...first, sightingId: '00000000-0000-4000-8000-000000000722', createdAt: '2026-08-30T09:01:00.000Z', occurredAt: '2026-08-30T09:00:00.000Z', reportState: 'delayed', mediaState: 'none', identityState: 'closed' };
const cursor: MyReportsCursor = { createdAt: first.createdAt, sightingId: first.sightingId };

function page(items: readonly MyReportSummary[], nextCursor: MyReportsCursor | null = null): MyReportsPage { return { items, nextCursor }; }
function recovery(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return { id: 'draft-12345678', notes: 'Do not show private notes', risk: 'normal', report: { version: 1, step: 'review', occurredAt: '2026-08-29T08:00:00.000Z', coat: ['black'], markings: ['white-paws'], condition: 'needs_attention', manualPublicCellId: '89652636d87ffff', updatedAt: '2026-08-29T08:00:00.000Z' }, ...overrides };
}
function dependencies(overrides: Partial<MyReportsDependencies> = {}): MyReportsDependencies {
  return { getSession: jest.fn(async () => true), listReports: jest.fn(async () => page([first])), loadDrafts: jest.fn(async () => []), navigate: jest.fn(), ...overrides };
}

describe('MyReportsScreen', () => {
  it('shows an accessible initial loading state', async () => {
    let resolve!: (value: MyReportsPage) => void;
    const view = await render(<MyReportsScreen locale="en" dependencies={dependencies({ listReports: () => new Promise((done) => { resolve = done; }) })} />);
    expect(view.getByText('Loading your reports…')).toBeTruthy();
    await act(async () => { resolve(page([])); });
    await waitFor(() => expect(view.getByText('No submitted reports yet')).toBeTruthy());
  });

  it('explains the empty history state', async () => {
    const view = await render(<MyReportsScreen locale="en" dependencies={dependencies({ listReports: async () => page([]) })} />);
    await waitFor(() => expect(view.getByText('No submitted reports yet')).toBeTruthy());
    expect(view.getByText('Submitted reports will appear here with their current private status.')).toBeTruthy();
  });

  it('shows only date and coarse lifecycle labels for successful rows', async () => {
    const view = await render(<MyReportsScreen locale="en" dependencies={dependencies()} />);
    await waitFor(() => expect(view.getByText('Private review')).toBeTruthy());
    expect(view.getByText('Private media awaiting validation')).toBeTruthy();
    expect(view.getByText('Identity review pending')).toBeTruthy();
    expect(view.queryByText('00000000-0000-4000-8000-000000000721')).toBeNull();
    expect(view.queryByText(/private notes|public cell|candidate|confidence|model|media path/i)).toBeNull();
  });

  it('loads more with the keyset cursor', async () => {
    const listReports = jest.fn(async ({ cursor: supplied }: { cursor?: MyReportsCursor | null }) => supplied ? page([second]) : page([first], cursor));
    const view = await render(<MyReportsScreen locale="en" dependencies={dependencies({ listReports })} />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Load more reports' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Load more reports' }));
    await waitFor(() => expect(view.getByText('Delayed after review')).toBeTruthy());
    expect(listReports).toHaveBeenLastCalledWith({ cursor });
  });

  it('refreshes the list and retains only its in-memory snapshot when refresh fails offline', async () => {
    const listReports = jest.fn(async () => page([first]));
    const view = await render(<MyReportsScreen locale="en" dependencies={dependencies({ listReports })} />);
    await waitFor(() => expect(view.getByText('Private review')).toBeTruthy());
    listReports.mockRejectedValueOnce(new Error('my_reports_unavailable'));
    await fireEvent.press(view.getByRole('button', { name: 'Refresh reports' }));
    await waitFor(() => expect(view.getByText('Offline — showing the last loaded reports from this session.')).toBeTruthy());
    expect(view.getByText('Private review')).toBeTruthy();
  });

  it('shows offline without a snapshot as an explicit error state', async () => {
    const view = await render(<MyReportsScreen locale="en" dependencies={dependencies({ listReports: async () => { throw new Error('my_reports_unavailable'); } })} />);
    await waitFor(() => expect(view.getByText('Reports are unavailable offline. Connect and try again.')).toBeTruthy());
  });

  it('routes an expired session to Profile', async () => {
    const run = dependencies({ getSession: async () => false });
    const view = await render(<MyReportsScreen locale="en" dependencies={run} />);
    await waitFor(() => expect(view.getByText('Sign in to view your submitted reports.')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Go to Profile to sign in' }));
    expect(run.navigate).toHaveBeenCalledWith('/profile');
  });

  it('clears the in-memory snapshot and routes to Profile when refresh finds an expired session', async () => {
    const getSession = jest.fn(async () => true);
    const run = dependencies({ getSession });
    const view = await render(<MyReportsScreen locale="en" dependencies={run} />);
    await waitFor(() => expect(view.getByText('Private review')).toBeTruthy());
    getSession.mockResolvedValueOnce(false);
    await fireEvent.press(view.getByRole('button', { name: 'Refresh reports' }));
    await waitFor(() => expect(view.getByText('Sign in to view your submitted reports.')).toBeTruthy());
    expect(view.queryByText('Private review')).toBeNull();
  });

  it('labels malformed responses without retaining untrusted content', async () => {
    const view = await render(<MyReportsScreen locale="en" dependencies={dependencies({ listReports: async () => { throw new Error('invalid_my_reports_response'); } })} />);
    await waitFor(() => expect(view.getByText('Your report history could not be verified. Try again.')).toBeTruthy());
  });

  it('merges a local recovery row by sighting ID rather than duplicating the remote report', async () => {
    const view = await render(<MyReportsScreen locale="en" dependencies={dependencies({ loadDrafts: async () => [recovery({ sightingId: first.sightingId, uploadJob: { state: 'needs_user', attempts: 1, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })] })} />);
    await waitFor(() => expect(view.getByText('Private review')).toBeTruthy());
    expect(view.queryByText('Draft saved on this device')).toBeNull();
  });
});
