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
      condition: 'appears_well',
      manualPublicCellId: null,
      updatedAt: '2026-08-31T00:00:00.000Z',
    },
    ...overrides,
  };
}

function dependencies(overrides: Partial<ReportWizardDependencies> = {}): ReportWizardDependencies {
  return {
    loadDraft: jest.fn(async () => draft()),
    getSessionSubject: jest.fn(async () => null),
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

function deferredLocation() {
  let resolve!: (value: { kind: 'granted'; latitude: number; longitude: number }) => void;
  const promise = new Promise<{ kind: 'granted'; latitude: number; longitude: number }>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe('ReportWizard', () => {
  it('never renders a draft owned by a different signed-in account', async () => {
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({
      getSessionSubject: async () => 'owner-bbbbbbbb',
      loadDraft: async () => draft({ ownerSubject: 'owner-aaaaaaaa' }),
    })} />);
    await waitFor(() => expect(view.getByText('This saved report is unavailable. Return to Report and start again.')).toBeTruthy());
    expect(view.queryByText('Private note')).toBeNull();
  });
  it('exposes the active wizard stage as a five-step progress indicator', async () => {
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies()} initialStage="safety" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Safety' })).toBeTruthy());
    const stages = view.getByLabelText('Report stages');
    expect(stages.props.accessibilityRole).toBe('progressbar');
    expect(stages.props.accessibilityValue).toEqual({
      min: 1,
      now: 3,
      max: 5,
      text: 'Step 3 of 5 · Safety',
    });
    await view.unmount();
  });

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

  it('opens a map-origin draft at manual Area, then continues to Details without route flags', async () => {
    const saveDraft = jest.fn(async () => undefined);
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({
      saveDraft,
      loadDraft: async () => draft({ report: { ...draft().report!, step: 'area', condition: null } }),
    })} AreaPicker={ManualAreaPicker as never} />);
    await waitFor(() => expect(view.getByRole('header', { name: 'Area' })).toBeTruthy());
    expect(view.getByRole('button', { name: 'Tap broad Singapore map' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Tap broad Singapore map' }));
    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(view.getByRole('header', { name: 'Details' })).toBeTruthy());
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      report: expect.objectContaining({ step: 'details', manualPublicCellId: '89652636d87ffff' }),
    }));
  });

  it('collects bounded coat and marking traits with accessible multi-select controls', async () => {
    const saveDraft = jest.fn(async () => undefined);
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ saveDraft })} initialStage="details" />);
    await waitFor(() => expect(view.getByRole('header', { name: 'Details' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Tabby coat' }));
    await fireEvent.press(view.getByRole('button', { name: 'White paws marking' }));
    await fireEvent.press(view.getByRole('button', { name: 'Appears well' }));
    await fireEvent.press(view.getByRole('button', { name: 'Continue to safety' }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      report: expect.objectContaining({ coat: ['tabby'], markings: ['white-paws'] }),
    })));
  });

  it('offers photo retake as a first-class private-review action', async () => {
    const navigate = jest.fn();
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({
      navigate,
      loadDraft: async () => draft({ mediaId: 'media-12345678', encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm' }),
    })} initialStage="photo" />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Retake private photo' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Retake private photo' }));
    expect(navigate).toHaveBeenCalledWith(`/report/redaction-review?draftId=${draftId}`);
  });

  it('enforces the submission prerequisite validator in the real submit path', async () => {
    const submit = jest.fn(async () => ({ sightingId, state: 'submitted_text_only' }));
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({
      submit,
      loadDraft: async () => draft({ report: { ...draft().report!, condition: null } }),
    })} initialStage="review" AreaPicker={ManualAreaPicker as never} />);
    await fireEvent.press(view.getByRole('button', { name: 'Choose an area manually' }));
    await fireEvent.press(view.getByRole('button', { name: 'Tap broad Singapore map' }));
    expect(view.getByRole('button', { name: 'Submit report' }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByText('Choose the cat’s condition before submitting.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('routes authentication expiry to Profile with only the opaque return draft ID', async () => {
    const navigate = jest.fn();
    const submit = jest.fn(async () => { throw new Error('authentication_required'); });
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({
      navigate, submit,
      loadDraft: async () => draft({ report: { ...draft().report!, step: 'review', condition: 'appears_well', manualPublicCellId: '89652636d87ffff' } }),
    })} initialStage="review" />);
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/profile?returnDraftId=${draftId}`));
    expect(JSON.stringify(navigate.mock.calls)).not.toMatch(/notes|latitude|longitude|media/);
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

  it('uses the manual area instead of requesting device coordinates after the contributor changes location modes', async () => {
    const requestDeviceLocation = jest.fn(async () => ({ kind: 'granted' as const, latitude: 1.3521, longitude: 103.8198 }));
    const submit = jest.fn(async () => ({ sightingId, state: 'submitted_text_only' as const }));
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ requestDeviceLocation, submit })} initialStage="review" AreaPicker={ManualAreaPicker as never} />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await fireEvent.press(view.getByRole('button', { name: 'Choose an area manually' }));
    await fireEvent.press(view.getByRole('button', { name: 'Tap broad Singapore map' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ location: { kind: 'manual_area', publicCellId: '89652636d87ffff' } })));
    expect(requestDeviceLocation).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('submits only once while a report submission is in flight', async () => {
    let resolveSubmission!: (value: { sightingId: string; state: string }) => void;
    const submit = jest.fn(() => new Promise<{ sightingId: string; state: string }>((resolve) => { resolveSubmission = resolve; }));
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ submit })} initialStage="review" AreaPicker={ManualAreaPicker as never} />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Choose an area manually' }));
    await fireEvent.press(view.getByRole('button', { name: 'Tap broad Singapore map' }));
    const submitButton = view.getByRole('button', { name: 'Submit report' });
    await fireEvent.press(submitButton);
    await fireEvent.press(submitButton);

    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSubmission({ sightingId, state: 'submitted_text_only' }); });
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

  it('does not submit delayed device coordinates after background invalidates the attempt', async () => {
    const location = deferredLocation();
    let listener: ((state: string) => void) | undefined;
    const subscription = { remove: jest.fn() };
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: 'change', callback: (state: import('react-native').AppStateStatus) => void) => {
      listener = callback as (state: string) => void;
      return subscription;
    }) as never);
    const submit = jest.fn(async () => ({ sightingId, state: 'submitted_text_only' }));
    const navigate = jest.fn();
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ navigate, requestDeviceLocation: () => location.promise, submit })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(location.promise).toBeTruthy());
    await act(async () => { listener?.('background'); location.resolve({ kind: 'granted', latitude: 1.3521, longitude: 103.8198 }); });

    expect(submit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    await view.unmount();
    appStateSpy.mockRestore();
  });

  it('does not submit delayed device coordinates after save and exit cancels the attempt', async () => {
    const location = deferredLocation();
    const submit = jest.fn(async () => ({ sightingId, state: 'submitted_text_only' }));
    const navigate = jest.fn();
    const exit = jest.fn();
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ exit, navigate, requestDeviceLocation: () => location.promise, submit })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));
    await fireEvent.press(view.getByRole('button', { name: 'Save and exit' }));
    await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
    await act(async () => { location.resolve({ kind: 'granted', latitude: 1.3521, longitude: 103.8198 }); });

    expect(submit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('does not submit delayed device coordinates after unmount invalidates the attempt', async () => {
    const location = deferredLocation();
    const submit = jest.fn(async () => ({ sightingId, state: 'submitted_text_only' }));
    const navigate = jest.fn();
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ navigate, requestDeviceLocation: () => location.promise, submit })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));
    await view.unmount();
    await act(async () => { location.resolve({ kind: 'granted', latitude: 1.3521, longitude: 103.8198 }); });

    expect(submit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
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

  it('keeps an invalid injected sighting ID in the truthful recovery state instead of routing', async () => {
    const navigate = jest.fn();
    const requestDeviceLocation = jest.fn(async () => ({ kind: 'granted' as const, latitude: 1.3521, longitude: 103.8198 }));
    const submit = jest.fn(async () => ({ sightingId: 'not-a-uuid', state: 'submitted_text_only' }));
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({ navigate, requestDeviceLocation, submit })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Use device location' }));
    await fireEvent.press(view.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(view.getByText('Your saved draft remains available. Try again when ready.')).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
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

  it('summarizes the selected photo, condition, safety and broad-area choices before submission', async () => {
    const view = await render(<ReportWizard draftId={draftId} dependencies={dependencies({
      loadDraft: async () => draft({
        mediaId: 'media-12345678',
        encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
        risk: 'sensitive',
        report: { ...draft().report!, step: 'review', condition: 'needs_attention', manualPublicCellId: '89652636d87ffff' },
      }),
    })} initialStage="review" />);

    await waitFor(() => expect(view.getByRole('header', { name: 'Review' })).toBeTruthy());
    expect(view.getByText('Private photo ready')).toBeTruthy();
    expect(view.getByText('Needs attention')).toBeTruthy();
    expect(view.getByText('sensitive')).toBeTruthy();
    expect(view.getByText('A broad area was selected. Your exact map tap was discarded.')).toBeTruthy();
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
