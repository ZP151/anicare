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
});
