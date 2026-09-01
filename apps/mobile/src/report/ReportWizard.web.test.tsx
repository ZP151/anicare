import { render, waitFor } from '@testing-library/react-native';

jest.mock('./ReportAreaPicker', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { ReportAreaPicker: () => React.createElement(Text, null, 'Area capture is available only in native iOS and Android builds.') };
});

import type { StoredDraft } from '../offline/draft-policy';
import { ReportWizard, type ReportWizardDependencies } from './ReportWizard';

const draftId = '00000000-0000-4000-8000-000000000606';

describe('ReportWizard web capture boundary', () => {
  it('does not expose device or manual capture controls as available on web', async () => {
    const draft: StoredDraft = {
      id: draftId,
      notes: '',
      risk: 'normal',
      report: {
        version: 1,
        step: 'review',
        creatorMode: 'anonymous',
        occurredAt: '2026-08-31T00:00:00.000Z',
        coat: [],
        markings: [],
        condition: 'appears_well',
        manualPublicCellId: null,
        updatedAt: '2026-08-31T00:00:00.000Z',
      },
    };
    const dependencies: ReportWizardDependencies = {
      loadDraft: async () => draft,
      getSessionSubject: async () => null,
      saveDraft: async () => undefined,
      removeReviewedMedia: async () => undefined,
      requestDeviceLocation: async () => ({ kind: 'denied' }),
      submit: async () => ({ sightingId: null, state: 'queued' }),
      now: () => new Date('2026-08-31T00:01:00.000Z'),
      navigate: () => undefined,
      exit: () => undefined,
    };
    const view = await render(<ReportWizard captureAvailable={false} draftId={draftId} dependencies={dependencies} initialStage="review" />);

    await waitFor(() => expect(view.getByText('Area capture is available only in native iOS and Android builds.')).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Use device location' })).toBeNull();
    expect(view.getByRole('button', { name: 'Submit report' }).props.accessibilityState.disabled).toBe(true);
    await view.unmount();
  });

  it('renders a complete Simplified Chinese review without visible English fallback', async () => {
    const draft: StoredDraft = {
      id: draftId,
      notes: '',
      risk: 'critical',
      report: {
        version: 1,
        step: 'review',
        creatorMode: 'anonymous',
        occurredAt: '2026-08-31T00:00:00.000Z',
        coat: [],
        markings: [],
        condition: 'urgent',
        manualPublicCellId: null,
        updatedAt: '2026-08-31T00:00:00.000Z',
      },
    };
    const dependencies: ReportWizardDependencies = {
      loadDraft: async () => draft,
      getSessionSubject: async () => null,
      saveDraft: async () => undefined,
      removeReviewedMedia: async () => undefined,
      requestDeviceLocation: async () => ({ kind: 'denied' }),
      submit: async () => ({ sightingId: null, state: 'queued' }),
      now: () => new Date('2026-08-31T00:01:00.000Z'),
      navigate: () => undefined,
      exit: () => undefined,
    };
    const view = await render(<ReportWizard AreaPicker={() => null} captureAvailable={false} draftId={draftId} dependencies={dependencies} initialStage="review" locale="zh-CN" />);

    await waitFor(() => expect(view.getByRole('header', { name: '确认' })).toBeTruthy());
    expect(view.getByRole('button', { name: '提交报告' }).props.accessibilityState.disabled).toBe(true);
    const renderedJson = JSON.stringify((view as unknown as { toJSON(): unknown }).toJSON());
    expect(renderedJson).not.toContain('Step ');
    expect(renderedJson).not.toContain('Choose a broad area');
    expect(renderedJson).not.toContain('Check your details');
    expect(renderedJson).not.toContain('Edit ');
    expect(renderedJson).not.toContain('Submit report');
    await view.unmount();
  });
});
