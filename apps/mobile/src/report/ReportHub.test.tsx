import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ReportHub, type ReportHubDependencies } from './ReportHub';

const firstDraft = {
  id: '00000000-0000-4000-8000-000000000111',
  notes: '',
  risk: 'normal' as const,
  report: {
    version: 1 as const,
    step: 'details' as const,
    occurredAt: '2026-09-01T08:00:00.000Z',
    coat: [],
    markings: [],
    condition: null,
    manualPublicCellId: null,
    updatedAt: '2026-09-01T08:00:00.000Z',
  },
};

const laterDraft = {
  ...firstDraft,
  id: '00000000-0000-4000-8000-000000000112',
  report: { ...firstDraft.report, step: 'safety' as const, updatedAt: '2026-09-01T09:00:00.000Z' },
};

function dependencies(overrides: Partial<ReportHubDependencies> = {}): ReportHubDependencies {
  return {
    loadDrafts: jest.fn(async () => []),
    saveDraft: jest.fn(async (input) => input as never),
    deleteDraft: jest.fn(async () => undefined),
    getSession: jest.fn(async () => false),
    createId: jest.fn(() => '00000000-0000-4000-8000-000000000113'),
    now: jest.fn(() => new Date('2026-09-01T10:00:00.000Z')),
    navigate: jest.fn(),
    ...overrides,
  };
}

describe('ReportHub', () => {
  it('shows a useful loading state before local drafts resolve', async () => {
    let resolveDrafts: ((drafts: typeof firstDraft[]) => void) | undefined;
    const loadDrafts = jest.fn(() => new Promise<typeof firstDraft[]>((resolve) => { resolveDrafts = resolve; }));
    const view = await render(<ReportHub dependencies={dependencies({ loadDrafts })} locale="en" />);

    expect(view.getByText('Loading saved reports…')).toBeTruthy();
    resolveDrafts?.([]);
    await waitFor(() => expect(view.getByText('No saved reports yet')).toBeTruthy());
  });

  it('explains the empty native-draft state without fabricated promises', async () => {
    const view = await render(<ReportHub dependencies={dependencies()} locale="en" />);

    await waitFor(() => expect(view.getByText('No saved reports yet')).toBeTruthy());
    expect(view.getByText('Start a report and you can return to it on this device.')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/\bAI\b|candidate|model|exact location|media path|token/i);
  });

  it('orders resumable draft summaries by their most recent update', async () => {
    const view = await render(<ReportHub dependencies={dependencies({ loadDrafts: async () => [firstDraft, laterDraft] })} locale="en" />);

    await waitFor(() => expect(view.getByRole('button', { name: /Continue report draft from safety/i })).toBeTruthy());
    expect(view.getAllByRole('button', { name: /Continue report draft/i }).map((button) => button.props.accessibilityLabel)).toEqual([
      'Continue report draft from safety',
      'Continue report draft from details',
    ]);
  });

  it('localizes saved draft titles in Simplified Chinese', async () => {
    const view = await render(<ReportHub dependencies={dependencies({ loadDrafts: async () => [firstDraft] })} locale="zh-CN" />);

    await waitFor(() => expect(view.getByText('已保存的报告')).toBeTruthy());
    expect(view.queryByText('Report draft')).toBeNull();
  });

  it('renders the deliberate native-storage-unavailable state', async () => {
    const view = await render(<ReportHub dependencies={dependencies({ loadDrafts: async () => { throw new Error('secure_offline_storage_unavailable'); } })} locale="en" />);

    await waitFor(() => expect(view.getByText('Saved reports are available in native iOS and Android builds.')).toBeTruthy());
  });

  it('keeps My Reports unavailable to a signed-out visitor and offers the real Profile sign-in route', async () => {
    const run = dependencies();
    const view = await render(<ReportHub dependencies={run} locale="en" />);

    await waitFor(() => expect(view.getByRole('button', { name: 'My Reports' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'My Reports' }));
    expect(run.navigate).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByText('Sign in to view reports you have submitted.')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: 'Go to Profile to sign in' }));
    expect(run.navigate).toHaveBeenCalledWith('/profile');
  });

  it('creates and saves a V1 draft before entering the report journey', async () => {
    const run = dependencies();
    const view = await render(<ReportHub dependencies={run} locale="en" />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Start a report' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Start a report' }));

    expect(run.saveDraft).toHaveBeenCalledWith({
      id: '00000000-0000-4000-8000-000000000113', notes: '', risk: 'normal', report: {
        version: 1, step: 'photo', occurredAt: '2026-09-01T10:00:00.000Z', coat: [], markings: [],
        condition: null, manualPublicCellId: null, updatedAt: '2026-09-01T10:00:00.000Z',
      },
    });
    expect(run.navigate).toHaveBeenCalledWith('/report/new?draftId=00000000-0000-4000-8000-000000000113');
  });

  it('continues a valid existing draft without writing another one', async () => {
    const run = dependencies({ loadDrafts: async () => [firstDraft] });
    const view = await render(<ReportHub dependencies={run} locale="en" />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Continue report draft from details' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Continue report draft from details' }));

    expect(run.saveDraft).not.toHaveBeenCalled();
    expect(run.navigate).toHaveBeenCalledWith('/report/new?draftId=00000000-0000-4000-8000-000000000111');
  });

  it('does not continue a presentation key that only resembles a stored draft ID', async () => {
    const run = dependencies({ loadDrafts: async () => [{ ...firstDraft, id: 'public-area-1' }] });
    const view = await render(<ReportHub dependencies={run} locale="en" />);

    await waitFor(() => expect(view.getByText('No saved reports yet')).toBeTruthy());
    expect(view.queryByRole('button', { name: /Continue report draft/i })).toBeNull();
    await view.unmount();
  });

  it('retains the draft and explains the failure when cleanup-aware deletion rejects', async () => {
    const run = dependencies({
      loadDrafts: async () => [firstDraft],
      deleteDraft: async () => { throw new Error('cleanup_failed'); },
    });
    const view = await render(<ReportHub dependencies={run} locale="en" />);

    await waitFor(() => expect(view.getByRole('button', { name: 'Delete report draft from details' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Delete report draft from details' }));

    await waitFor(() => expect(view.getByText('This saved report could not be deleted. Try again.')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Continue report draft from details' })).toBeTruthy();
  });
});
