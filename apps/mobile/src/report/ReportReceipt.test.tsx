import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { MyReportsPage, MyReportSummary } from '../api/my-reports';
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

const page = (items: readonly MyReportSummary[]): MyReportsPage => ({ items, nextCursor: null });

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
    listReports: jest.fn(async () => page([remote()])),
    loadDrafts: jest.fn(async () => []),
    navigate: jest.fn(),
    ...overrides,
  };
}

describe('ReportReceipt', () => {
  it('shows a submitted text-only report without exposing private report fields', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies()} locale="en" />);

    await waitFor(() => expect(view.getByText('Report received')).toBeTruthy());
    expect(view.getByText(`Report ID: ${sightingId}`)).toBeTruthy();
    expect(view.getByText(/Submitted at /)).toBeTruthy();
    expect(view.getByText('Text-only report')).toBeTruthy();
    const output = JSON.stringify(view.toJSON());
    expect(output).not.toMatch(/89652636d87ffff|Private note|tabby|white-paws|candidate|confidence|model|reviewed-media|public cell/i);
  });

  it.each([
    ['private_review', 'none', 'Private review'],
    ['delayed', 'pending', 'Media upload pending'],
    ['published', 'none', 'Published after review'],
  ] as const)('renders the truthful remote %s / %s status', async (reportState, mediaState, expected) => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({ listReports: async () => page([remote({ reportState, mediaState })]) })} locale="en" />);
    await waitFor(() => expect(view.getByText(expected)).toBeTruthy());
  });

  it('never labels quarantined media public and keeps durable local recovery status', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      listReports: async () => page([remote({ mediaState: 'quarantined', identityState: 'pending_review' })]),
      loadDrafts: async () => [local({ uploadJob: { state: 'needs_user', attempts: 1, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })],
    })} locale="en" />);

    await waitFor(() => expect(view.getByText('Media needs your attention')).toBeTruthy());
    expect(view.getByText('Identity review pending')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/public|89652636d87ffff|Private note|tabby|reviewed-media/i);
  });

  it('uses only durable local status while remote status is unavailable', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      listReports: async () => { throw new Error('my_reports_unavailable'); },
      loadDrafts: async () => [local({ uploadJob: { state: 'quarantined', attempts: 1, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: null } })],
    })} locale="en" />);

    await waitFor(() => expect(view.getByText('Remote status is unavailable. Showing status saved on this device.')).toBeTruthy());
    expect(view.getByText('Private media awaiting validation')).toBeTruthy();
  });

  it('does not resurrect stale local pending media after an authoritative lookup says the report is absent', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      listReports: async () => page([]),
      loadDrafts: async () => [local({ uploadJob: { state: 'upload_pending', attempts: 0, nextAttemptAt: null, lastError: null, resumeState: null, attemptStartedAt: null } })],
    })} locale="en" />);

    await waitFor(() => expect(view.getByText('Report unavailable')).toBeTruthy());
    expect(view.queryByText('Report received')).toBeNull();
    expect(view.queryByText('Media upload pending')).toBeNull();
  });

  it('keeps only an explicit local needs-user recovery after an authoritative lookup says the report is absent', async () => {
    const view = await render(<ReportReceipt sightingId={sightingId} dependencies={dependencies({
      listReports: async () => page([]),
      loadDrafts: async () => [local({ uploadJob: { state: 'needs_user', attempts: 1, nextAttemptAt: null, lastError: 'local_media_corrupt', resumeState: null, attemptStartedAt: null } })],
    })} locale="en" />);

    await waitFor(() => expect(view.getByText('Local media recovery needs your attention.')).toBeTruthy());
    expect(view.getByText('Media needs your attention')).toBeTruthy();
  });

  it('rejects missing or malformed sighting IDs without loading status', async () => {
    const run = dependencies();
    const view = await render(<ReportReceipt sightingId="not-an-id" dependencies={run} locale="en" />);
    expect(view.getByText('Report unavailable')).toBeTruthy();
    expect(run.listReports).not.toHaveBeenCalled();
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
