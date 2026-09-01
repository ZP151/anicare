import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Pressable } from 'react-native';

jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: () => null,
  PROVIDER_GOOGLE: 'google',
}));

import type { StoredDraft } from '../offline/draft-policy';
import { ReportWizard, type ReportWizardDependencies } from './ReportWizard';

const draftId = '00000000-0000-4000-8000-000000000606';
const sightingId = '00000000-0000-4000-8000-000000000607';

function draft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return {
    id: draftId,
    notes: '',
    risk: 'normal',
    report: {
      version: 1,
      step: 'photo',
      occurredAt: '2026-08-31T00:00:00.000Z',
      coat: [],
      markings: [],
      condition: null,
      manualPublicCellId: null,
      updatedAt: '2026-08-31T00:00:00.000Z',
    },
    ...overrides,
  };
}

function dependencies(overrides: Partial<ReportWizardDependencies> = {}): ReportWizardDependencies {
  return {
    loadDraft: jest.fn(async () => draft()),
    saveDraft: jest.fn(async () => undefined),
    removeReviewedMedia: jest.fn(async () => undefined),
    requestDeviceLocation: jest.fn(async () => ({ kind: 'denied' as const })),
    submit: jest.fn(async () => ({ sightingId, state: 'submitted_text_only' as const })),
    now: () => new Date('2026-08-31T00:01:00.000Z'),
    navigate: jest.fn(),
    exit: jest.fn(),
    ...overrides,
  };
}

function ManualAreaPicker({ onSelect }: Readonly<{ onSelect(selection: { publicCellId: string }): void }>) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Tap broad Singapore map" onPress={() => onSelect({ publicCellId: '89652636d87ffff' })} />;
}

describe('ReportWizard', () => {
  it('loads a validated draft at its earliest incomplete stage and saves the sanitized payload when advancing', async () => {
    const saveDraft = jest.fn(async () => undefined);
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ saveDraft })} />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Photo' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Skip photo for now' }));

    await waitFor(() => expect(view.getByRole('header', { name: 'Details' })).toBeTruthy());
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: draftId,
      report: expect.objectContaining({ step: 'details' }),
    }));
    expect(saveDraft).not.toHaveBeenCalledWith(expect.objectContaining({ latitude: expect.anything() }));
    await view.unmount();
  });

  it('opens the private redaction route with only the same opaque draft ID and removes reviewed media through the cleanup-aware operation', async () => {
    const navigate = jest.fn();
    const removeReviewedMedia = jest.fn(async () => undefined);
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({
      navigate,
      removeReviewedMedia,
      loadDraft: jest.fn(async () => draft({ mediaId: 'media-12345678', encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm' })),
    })} />);

    await waitFor(() => expect(view.getByText('Private photo ready')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Replace private photo' }));
    expect(navigate).toHaveBeenCalledWith(`/report/redaction-review?draftId=${draftId}`);
    expect(JSON.stringify(navigate.mock.calls)).not.toMatch(/notes|media-|latitude|longitude/);
    await fireEvent.press(view.getByRole('button', { name: 'Remove private photo' }));
    await waitFor(() => expect(removeReviewedMedia).toHaveBeenCalledWith(draftId));
    await view.unmount();
  });

  it('does not request device coordinates until the user submits, then offers manual selection after denial without another prompt', async () => {
    const requestDeviceLocation = jest.fn(async () => ({ kind: 'denied' as const }));
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ requestDeviceLocation })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    expect(requestDeviceLocation).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(view.getByText('Location permission was not granted. Choose an area manually instead.')).toBeTruthy());
    expect(requestDeviceLocation).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('persists only the picker public cell when a denied location falls back to manual area selection', async () => {
    const saveDraft = jest.fn(async () => undefined);
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ saveDraft })} initialStage="area" AreaPicker={ManualAreaPicker as never} />);

    await fireEvent.press(view.getByRole('button', { name: 'Choose an area manually' }));
    await fireEvent.press(view.getByRole('button', { name: 'Tap broad Singapore map' }));
    await fireEvent.press(view.getByRole('button', { name: 'Continue to review' }));

    await waitFor(() => expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      report: expect.objectContaining({ manualPublicCellId: '89652636d87ffff', step: 'review' }),
    })));
    expect(JSON.stringify(saveDraft.mock.calls)).not.toMatch(/latitude|longitude|1\.3521|103\.8198/);
    await view.unmount();
  });

  it('clears device coordinates after a submission error so a later attempt cannot reuse them', async () => {
    const requestDeviceLocation = jest.fn(async () => ({ kind: 'granted' as const, latitude: 1.3521, longitude: 103.8198 }));
    const submit = jest.fn(async () => { throw new Error('offline'); });
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ requestDeviceLocation, submit })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(view.getByText('Your saved draft remains available. Try again when ready.')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(requestDeviceLocation).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('clears the active attempt on unmount and never navigates after an unmounted submission resolves', async () => {
    let resolveSubmission!: (result: { sightingId: string; state: string }) => void;
    const submit = jest.fn(() => new Promise<{ sightingId: string; state: string }>((resolve) => { resolveSubmission = resolve; }));
    const navigate = jest.fn();
    const requestDeviceLocation = jest.fn(async () => ({ kind: 'granted' as const, latitude: 1.3521, longitude: 103.8198 }));
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ navigate, requestDeviceLocation, submit })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await view.unmount();
    await act(async () => { resolveSubmission({ sightingId, state: 'submitted_text_only' }); });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('clears device coordinates and saves only the sanitized draft when the app backgrounds', async () => {
    let listener: ((state: string) => void) | undefined;
    const subscription = { remove: jest.fn() };
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: 'change', callback: (state: import('react-native').AppStateStatus) => void) => {
      listener = callback as (state: string) => void;
      return subscription;
    }) as never);
    const saveDraft = jest.fn(async () => undefined);
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ saveDraft })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await act(async () => { listener?.('background'); });

    await waitFor(() => expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: draftId,
      report: expect.objectContaining({ step: 'review' }),
    })));
    expect(JSON.stringify(saveDraft.mock.calls)).not.toMatch(/latitude|longitude|1\.3521|103\.8198/);
    await view.unmount();
    expect(subscription.remove).toHaveBeenCalled();
    appStateSpy.mockRestore();
  });

  it('navigates to a committed receipt with only sightingId and clears active device coordinates', async () => {
    const requestDeviceLocation = jest.fn(async () => ({ kind: 'granted' as const, latitude: 1.3521, longitude: 103.8198 }));
    const navigate = jest.fn();
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ requestDeviceLocation, navigate })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/report/receipt?sightingId=${sightingId}`));
    expect(JSON.stringify(navigate.mock.calls)).not.toMatch(/latitude|longitude|notes|media|status/);
    await view.unmount();
  });

  it('provides explicit review edit links for every preceding stage', async () => {
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies()} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    expect(view.getByRole('button', { name: 'Edit photo' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Edit details' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Edit safety' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Edit area' }));
    expect(view.getByRole('header', { name: 'Area' })).toBeTruthy();
    await view.unmount();
  });

  it('explains sensitive safety consequences and saves a sanitized draft before exit', async () => {
    const saveDraft = jest.fn(async () => undefined);
    const exit = jest.fn();
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ saveDraft, exit })} initialStage="safety" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Safety' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'critical' }));
    expect(view.getByText('Critical reports are not publicly visible.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Save and exit' }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: draftId,
      risk: 'critical',
      report: expect.objectContaining({ step: 'safety' }),
    })));
    expect(JSON.stringify(saveDraft.mock.calls)).not.toMatch(/latitude|longitude/);
    expect(exit).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});
