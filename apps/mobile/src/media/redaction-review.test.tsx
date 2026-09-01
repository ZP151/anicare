import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockMaskEditorOverlay = jest.fn((_props: unknown) => null);
const mockLocale = { value: 'en' as 'en' | 'zh-CN' };

jest.mock('@shopify/react-native-skia', () => ({ ImageFormat: { JPEG: 3 }, Skia: {} }));
jest.mock('../components/ScreenScaffold', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    ScreenScaffold: ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) =>
      React.createElement(View, null, React.createElement(Text, null, title), React.createElement(Text, null, subtitle), children),
  };
});
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ draftId: '00000000-0000-4000-8000-000000000606' }),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('../../src/media/processor', () => ({
  prepareCanonical: jest.fn(),
  renderOpaqueMasks: jest.fn(),
}));
jest.mock('../../src/media/MaskEditorOverlay', () => ({
  MaskEditorOverlay: (props: unknown) => mockMaskEditorOverlay(props),
}));
jest.mock('../../src/media/draft-media', () => ({
  cleanupProcessorCacheUris: jest.fn(),
  deleteReviewedMediaReference: jest.fn(),
  persistReviewedMedia: jest.fn(),
  verifyReviewedMedia: jest.fn(),
}));
jest.mock('../../src/media/camera-source-cleanup', () => ({
  cleanupOwnedCameraSource: jest.fn(),
}));
jest.mock('../../src/offline/draft-store', () => ({
  saveReviewedMediaJournal: jest.fn(),
}));
jest.mock('../../src/api/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));
jest.mock('../../src/i18n/LocaleContext', () => ({
  useLocale: () => ({ locale: mockLocale.value, setLocale: jest.fn(), t: jest.fn() }),
}));

import RedactionReviewScreen from '../../app/report/redaction-review';
import { router } from 'expo-router';
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync } from 'expo-image-picker';
import { cleanupProcessorCacheUris, deleteReviewedMediaReference, persistReviewedMedia, verifyReviewedMedia } from './draft-media';
import { prepareCanonical, renderOpaqueMasks } from './processor';
import { saveReviewedMediaJournal } from '../offline/draft-store';
import { getSupabaseClient } from '../api/supabase';
import { cleanupOwnedCameraSource } from './camera-source-cleanup';
import type { MaskEditorOverlayProps } from './MaskEditorOverlay';
import type { PrivacyMask, RenderedMedia } from './contracts';

const canonical = {
  uri: 'file:///cache/animalhelper-canonical-12345678.jpg',
  sha256: 'a'.repeat(64), mimeType: 'image/jpeg' as const, width: 1200, height: 800,
  byteLength: 4, recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
};
const rendered = { ...canonical, uri: 'file:///cache/animalhelper-reviewed-12345678.jpg' };
const firstMask: PrivacyMask = {
  id: 'mask-one',
  rect: { x: 0.1, y: 0.1, width: 0.24, height: 0.14 },
};
const secondMask: PrivacyMask = {
  id: 'mask-two',
  rect: { x: 0.55, y: 0.35, width: 0.2, height: 0.2 },
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function latestOverlayProps(): MaskEditorOverlayProps {
  const call = mockMaskEditorOverlay.mock.calls.at(-1);
  if (!call) throw new Error('mask_editor_overlay_not_rendered');
  return call[0] as MaskEditorOverlayProps;
}

function clickEvent() {
  const target = {};
  return { currentTarget: target, target, nativeEvent: {}, stopPropagation: () => undefined };
}

async function renderPreparedReview(output: RenderedMedia = rendered) {
  jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://gallery/source.jpg' }] } as never);
  jest.mocked(prepareCanonical).mockResolvedValue(canonical);
  jest.mocked(renderOpaqueMasks).mockResolvedValueOnce(output);
  const view = await render(<RedactionReviewScreen />);

  await act(async () => { fireEvent.press(view.getByText('Choose photo for private review')); });
  await waitFor(() => expect(mockMaskEditorOverlay).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLocale.value = 'en';
  jest.mocked(renderOpaqueMasks).mockReset();
  jest.mocked(verifyReviewedMedia).mockReset();
  jest.mocked(cleanupProcessorCacheUris).mockResolvedValue(undefined);
  jest.mocked(cleanupOwnedCameraSource).mockResolvedValue(true);
  jest.mocked(deleteReviewedMediaReference).mockResolvedValue(undefined);
  jest.mocked(persistReviewedMedia).mockResolvedValue({
    encryptedReviewedRef: 'reviewed-media/media-12345678.commit-12345678.agcm',
    encryptionVersion: 'aes-256-gcm.v1',
    mediaId: 'media-12345678',
  });
  jest.mocked(saveReviewedMediaJournal).mockResolvedValue(undefined);
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'owner-12345678' } } } })) },
  } as never);
});

describe('private redaction review screen', () => {
  it('supports an explicit camera retake through the same private canonicalization flow', async () => {
    jest.mocked(requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as never);
    jest.mocked(launchCameraAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///camera/retake.jpg' }] } as never);
    jest.mocked(prepareCanonical).mockResolvedValue(canonical);
    jest.mocked(renderOpaqueMasks).mockResolvedValueOnce(rendered);
    const view = await render(<RedactionReviewScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Take photo for private review' }));
    await waitFor(() => expect(prepareCanonical).toHaveBeenCalledWith('file:///camera/retake.jpg'));
    expect(launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ exif: false }));
  });

  it('cleans an app-owned camera result that resolves immediately after unmount', async () => {
    const cameraPicker = deferred<Awaited<ReturnType<typeof launchCameraAsync>>>();
    jest.mocked(requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as never);
    jest.mocked(launchCameraAsync).mockImplementationOnce(() => cameraPicker.promise);
    const view = await render(<RedactionReviewScreen />);

    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Take photo for private review' })); });
    await waitFor(() => expect(launchCameraAsync).toHaveBeenCalledTimes(1));
    await act(async () => { view.unmount(); });
    await act(async () => {
      cameraPicker.resolve({ canceled: false, assets: [{ uri: 'file:///app/cache/ImagePicker/unmounted.jpg' }] } as never);
      await cameraPicker.promise;
    });

    await waitFor(() => expect(cleanupOwnedCameraSource).toHaveBeenCalledWith(
      'file:///app/cache/ImagePicker/unmounted.jpg',
    ));
    expect(prepareCanonical).not.toHaveBeenCalled();
  });
  it('renders the complete Simplified Chinese review surface without English control copy', async () => {
    mockLocale.value = 'zh-CN';
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://gallery/source.jpg' }] } as never);
    jest.mocked(prepareCanonical).mockResolvedValue(canonical);
    jest.mocked(renderOpaqueMasks).mockResolvedValue(rendered);
    const view = await render(<RedactionReviewScreen />);

    expect(view.getByText('私密照片复核')).toBeTruthy();
    expect(view.getByText('人物检测：不可用')).toBeTruthy();
    expect(view.getByText('车牌检测：不可用')).toBeTruthy();
    expect(view.getByText('猫咪检测：不可用')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '选择照片进行私密复核' }));
    await waitFor(() => expect(view.getByText('添加、选择并调整不透明遮挡，然后在确认前检查每个像素。')).toBeTruthy());
    expect(view.getByRole('button', { name: '确认精确像素并加密' })).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/Private photo review|People detection|Licence-plate detection|Cat detection|Choose photo|Clear all masks|Confirm exact pixels/i);
  });

  it('states that every automatic detector is unavailable and offers no publication action', async () => {
    const view = await render(<RedactionReviewScreen />);

    expect(view.getByText('People detection: unavailable')).toBeTruthy();
    expect(view.getByText('Licence-plate detection: unavailable')).toBeTruthy();
    expect(view.getByText('Cat detection: unavailable')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Choose photo for private review' })).toBeTruthy();
    expect(view.queryByText(/public upload|publish/i)).toBeNull();
  });

  it('returns to a freshly loaded wizard using only the same draft ID after private media commits', async () => {
    jest.mocked(verifyReviewedMedia).mockResolvedValueOnce('absent').mockResolvedValueOnce('valid');
    const view = await renderPreparedReview();

    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' })); });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({
      pathname: '/report/new',
      params: { draftId: '00000000-0000-4000-8000-000000000606' },
    }));
    expect(router.back).not.toHaveBeenCalled();
    expect(JSON.stringify(jest.mocked(router.replace).mock.calls)).not.toMatch(/file:|media-|status|uri/);
  });

  it('cleans every owned plaintext output when the review screen unmounts', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://gallery/source.jpg' }] } as never);
    jest.mocked(prepareCanonical).mockResolvedValue(canonical);
    jest.mocked(renderOpaqueMasks).mockResolvedValue(rendered);
    const view = await render(<RedactionReviewScreen />);

    await act(async () => { fireEvent.press(view.getByText('Choose photo for private review')); });
    await waitFor(() => expect(view.getByText(/Add, select and adjust opaque masks/)).toBeTruthy());
    view.unmount();

    await waitFor(() => expect(cleanupProcessorCacheUris).toHaveBeenCalledWith([
      canonical.uri,
      rendered.uri,
    ]));
  });

  it('cleans a canonical output when initial rendering fails terminally', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://gallery/source.jpg' }] } as never);
    jest.mocked(prepareCanonical).mockResolvedValue(canonical);
    jest.mocked(renderOpaqueMasks).mockRejectedValue(new Error('invalid_rendered_jpeg'));
    const view = await render(<RedactionReviewScreen />);

    await act(async () => { fireEvent.press(view.getByText('Choose photo for private review')); });
    await waitFor(() => expect(cleanupProcessorCacheUris).toHaveBeenCalledWith([canonical.uri]));
    expect(view.getByText('The photo could not be prepared safely. Nothing was staged.')).toBeTruthy();
  });

  it('keeps the review UI intact when the picker is cancelled', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: [] } as never);
    const view = await render(<RedactionReviewScreen />);

    await act(async () => { fireEvent.press(view.getByText('Choose photo for private review')); });

    expect(view.getByText('Choose photo for private review')).toBeTruthy();
    expect(cleanupProcessorCacheUris).not.toHaveBeenCalled();
  });

  it('leaves durable replacement cleanup inside the journal boundary', async () => {
    const events: string[] = [];
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://gallery/source.jpg' }] } as never);
    jest.mocked(prepareCanonical).mockResolvedValue(canonical);
    jest.mocked(renderOpaqueMasks).mockResolvedValue(rendered);
    jest.mocked(verifyReviewedMedia)
      .mockResolvedValueOnce('absent')
      .mockResolvedValueOnce('valid');
    jest.mocked(saveReviewedMediaJournal)
      .mockImplementationOnce(async () => { events.push('durable'); })
      .mockImplementationOnce(async () => undefined);
    jest.mocked(deleteReviewedMediaReference).mockImplementation(async (reference) => { events.push(`delete:${reference}`); });
    const view = await render(<RedactionReviewScreen />);

    await act(async () => { fireEvent.press(view.getByText('Choose photo for private review')); });
    await waitFor(() => expect(view.getByText(/Add, select and adjust opaque masks/)).toBeTruthy());
    await act(async () => { fireEvent.press(view.getByText('Confirm exact pixels and encrypt')); });

    await waitFor(() => expect(saveReviewedMediaJournal).toHaveBeenCalledTimes(2));
    expect(events).toEqual(['durable']);
    expect(deleteReviewedMediaReference).not.toHaveBeenCalled();
  });

  it('does not create an ownerless media journal when review persistence is signed out', async () => {
    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
    } as never);
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://gallery/source.jpg' }] } as never);
    jest.mocked(prepareCanonical).mockResolvedValue(canonical);
    jest.mocked(renderOpaqueMasks).mockResolvedValue(rendered);
    const view = await render(<RedactionReviewScreen />);
    await act(async () => { fireEvent.press(view.getByText('Choose photo for private review')); });
    await waitFor(() => expect(view.getByText(/Add, select and adjust opaque masks/)).toBeTruthy());
    await act(async () => { fireEvent.press(view.getByText('Confirm exact pixels and encrypt')); });
    expect(saveReviewedMediaJournal).not.toHaveBeenCalled();
    expect(view.getByText('Sign in again before saving reviewed media. No media was staged.')).toBeTruthy();
  });

  it('invalidates a confirmed receipt on the first edit preview without rendering', async () => {
    jest.mocked(verifyReviewedMedia).mockResolvedValueOnce('absent').mockResolvedValueOnce('valid');
    const view = await renderPreparedReview();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' })); });
    await waitFor(() => expect(view.getByText('Encrypted reviewed media saved privately. It has not been uploaded or published.')).toBeTruthy());
    const renderCallsBeforePreview = jest.mocked(renderOpaqueMasks).mock.calls.length;

    await act(async () => { latestOverlayProps().onMutationPreview([firstMask]); });

    expect(jest.mocked(renderOpaqueMasks)).toHaveBeenCalledTimes(renderCallsBeforePreview);
    expect(latestOverlayProps().masks).toEqual([firstMask]);
    expect(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' }).props.accessibilityState.disabled).toBe(true);
  });

  it('restores rendered masks after gesture cancellation but still requires confirmation again', async () => {
    jest.mocked(verifyReviewedMedia)
      .mockResolvedValueOnce('absent')
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce('absent')
      .mockResolvedValueOnce('valid');
    const view = await renderPreparedReview();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' })); });
    await waitFor(() => expect(persistReviewedMedia).toHaveBeenCalledTimes(1));
    const renderCalls = jest.mocked(renderOpaqueMasks).mock.calls.length;
    const journalCalls = jest.mocked(saveReviewedMediaJournal).mock.calls.length;

    await act(async () => { latestOverlayProps().onMutationPreview([firstMask]); });
    expect(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => { latestOverlayProps().onMutationCancel([]); });

    expect(latestOverlayProps().masks).toEqual([]);
    expect(renderOpaqueMasks).toHaveBeenCalledTimes(renderCalls);
    expect(saveReviewedMediaJournal).toHaveBeenCalledTimes(journalCalls);
    expect(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' }).props.accessibilityState.disabled).toBe(false);

    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' })); });
    await waitFor(() => expect(persistReviewedMedia).toHaveBeenCalledTimes(2));
  });

  it('blocks confirmation synchronously when a preview and confirmation occur in the same act', async () => {
    const view = await renderPreparedReview();
    const overlay = latestOverlayProps();
    const confirm = view.getByRole('button', { name: 'Confirm exact pixels and encrypt' }).props.onClick as (event: unknown) => void;

    await act(async () => {
      overlay.onMutationPreview([firstMask]);
      confirm(clickEvent());
      await Promise.resolve();
    });

    expect(saveReviewedMediaJournal).not.toHaveBeenCalled();
    expect(persistReviewedMedia).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' }).props.accessibilityState.disabled).toBe(true);
  });

  it('renders a committed exact snapshot from canonical and enables confirmation only after current pixels complete', async () => {
    const mutation = deferred<RenderedMedia>();
    const updated = { ...rendered, uri: 'file:///cache/animalhelper-reviewed-updated.jpg', sha256: 'b'.repeat(64) };
    const view = await renderPreparedReview();
    jest.mocked(renderOpaqueMasks).mockImplementationOnce(() => mutation.promise);

    await act(async () => { latestOverlayProps().onMutationCommit([firstMask, secondMask]); });

    expect(jest.mocked(renderOpaqueMasks)).toHaveBeenLastCalledWith({ canonical, masks: [firstMask, secondMask] });
    expect(latestOverlayProps().masks).toEqual([firstMask, secondMask]);
    expect(latestOverlayProps().disabled).toBe(true);
    expect(view.getByRole('button', { name: 'Working…' }).props.accessibilityState.disabled).toBe(true);

    await act(async () => { mutation.resolve(updated); await mutation.promise; });
    await waitFor(() => expect(view.getByText('Mask applied to final pixels. Review again before confirming.')).toBeTruthy());

    expect(latestOverlayProps().disabled).toBe(false);
    expect(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' }).props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Reviewed private image').props.source).toEqual({ uri: updated.uri });
  });

  it('keeps a failed equal-snapshot render non-stageable after a later preview is cancelled', async () => {
    const view = await renderPreparedReview();
    jest.mocked(renderOpaqueMasks).mockRejectedValueOnce(new Error('invalid_rendered_jpeg'));

    await act(async () => { latestOverlayProps().onMutationCommit([]); });
    await waitFor(() => expect(view.getByText('The mask could not be rendered safely. Confirmation remains disabled.')).toBeTruthy());

    await act(async () => { latestOverlayProps().onMutationPreview([firstMask]); });
    await act(async () => { latestOverlayProps().onMutationCancel([]); });

    expect(latestOverlayProps().masks).toEqual([]);
    expect(view.getByRole('button', { name: 'Confirm exact pixels and encrypt' }).props.accessibilityState.disabled).toBe(true);
    expect(persistReviewedMedia).not.toHaveBeenCalled();
  });

  it('blocks a same-act overlay commit after confirmation starts durable persistence', async () => {
    const journalWrite = deferred<void>();
    const unexpectedRender = deferred<RenderedMedia>();
    jest.mocked(saveReviewedMediaJournal)
      .mockImplementationOnce(() => journalWrite.promise)
      .mockResolvedValue(undefined);
    jest.mocked(verifyReviewedMedia).mockResolvedValue('valid');
    const view = await renderPreparedReview();
    jest.mocked(renderOpaqueMasks).mockImplementationOnce(() => unexpectedRender.promise);
    const overlay = latestOverlayProps();
    const confirm = view.getByRole('button', { name: 'Confirm exact pixels and encrypt' }).props.onClick as (event: unknown) => void;

    await act(async () => {
      confirm(clickEvent());
      overlay.onMutationCommit([firstMask]);
    });

    await waitFor(() => expect(saveReviewedMediaJournal).toHaveBeenCalledTimes(1));
    const renderCallCount = jest.mocked(renderOpaqueMasks).mock.calls.length;
    const observedMasks = latestOverlayProps().masks;

    await act(async () => {
      unexpectedRender.resolve({ ...rendered, uri: 'file:///cache/animalhelper-unexpected-concurrent-render.jpg' });
      await unexpectedRender.promise;
    });
    await act(async () => { view.unmount(); });
    await act(async () => {
      journalWrite.resolve();
      await journalWrite.promise;
      await Promise.resolve();
    });
    expect(renderCallCount).toBe(1);
    expect(observedMasks).toEqual([]);
  });

  it('commits single deletion without clearing the remaining mask', async () => {
    const withTwoMasks = { ...rendered, uri: 'file:///cache/animalhelper-reviewed-two-masks.jpg' };
    const withOneMask = { ...rendered, uri: 'file:///cache/animalhelper-reviewed-one-mask.jpg' };
    const view = await renderPreparedReview();
    jest.mocked(renderOpaqueMasks).mockResolvedValueOnce(withTwoMasks).mockResolvedValueOnce(withOneMask);
    await act(async () => { latestOverlayProps().onMutationCommit([firstMask, secondMask]); });
    await waitFor(() => expect(latestOverlayProps().masks).toEqual([firstMask, secondMask]));

    await act(async () => { latestOverlayProps().onMutationCommit([secondMask]); });
    await waitFor(() => expect(latestOverlayProps().masks).toEqual([secondMask]));

    expect(jest.mocked(renderOpaqueMasks)).toHaveBeenLastCalledWith({ canonical, masks: [secondMask] });
  });

  it('denies a second rapid mutation without changing masks while the first render owns the coordinator', async () => {
    const mutation = deferred<RenderedMedia>();
    const view = await renderPreparedReview();
    jest.mocked(renderOpaqueMasks).mockImplementationOnce(() => mutation.promise);
    const overlay = latestOverlayProps();

    await act(async () => {
      overlay.onMutationCommit([firstMask]);
      overlay.onMutationPreview([secondMask]);
      overlay.onMutationCommit([secondMask]);
    });

    expect(jest.mocked(renderOpaqueMasks)).toHaveBeenCalledTimes(2);
    expect(latestOverlayProps().masks).toEqual([firstMask]);

    await act(async () => { mutation.resolve({ ...rendered, uri: 'file:///cache/animalhelper-reviewed-first.jpg' }); await mutation.promise; });
    await waitFor(() => expect(latestOverlayProps().disabled).toBe(false));
  });

  it('does not let a stale selection completion overwrite a newer photo selection lifecycle', async () => {
    const stalePicker = deferred<Awaited<ReturnType<typeof launchImageLibraryAsync>>>();
    const replacementCanonical = { ...canonical, uri: 'file:///cache/animalhelper-canonical-replacement.jpg', width: 900, height: 1200 };
    const replacementRendered = { ...replacementCanonical, uri: 'file:///cache/animalhelper-reviewed-replacement.jpg', sha256: 'c'.repeat(64) };
    jest.mocked(launchImageLibraryAsync)
      .mockImplementationOnce(() => stalePicker.promise)
      .mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'content://gallery/replacement.jpg' }] } as never);
    jest.mocked(prepareCanonical).mockResolvedValueOnce(replacementCanonical);
    jest.mocked(renderOpaqueMasks).mockResolvedValueOnce(replacementRendered);
    const view = await render(<RedactionReviewScreen />);
    const chooseButton = view.getByRole('button', { name: 'Choose photo for private review' });
    const onClick = chooseButton.props.onClick as (event: unknown) => void;
    const target = {};
    const click = { currentTarget: target, target, nativeEvent: {}, stopPropagation: () => undefined };

    await act(async () => { onClick(click); onClick(click); });
    await waitFor(() => expect(view.getByLabelText('Reviewed private image').props.source).toEqual({ uri: replacementRendered.uri }));
    await act(async () => {
      stalePicker.resolve({ canceled: false, assets: [{ uri: 'content://gallery/stale.jpg' }] } as never);
      await stalePicker.promise;
    });

    expect(view.getByLabelText('Reviewed private image').props.source).toEqual({ uri: replacementRendered.uri });
    expect(prepareCanonical).toHaveBeenCalledTimes(1);
    expect(latestOverlayProps()).toMatchObject({
      imageWidth: replacementRendered.width,
      imageHeight: replacementRendered.height,
      masks: [],
      selectedMaskId: null,
    });
  });

  it('releases a stale mutation render after unmount instead of adopting its output', async () => {
    const mutation = deferred<RenderedMedia>();
    const staleRendered = { ...rendered, uri: 'file:///cache/animalhelper-reviewed-after-unmount.jpg', sha256: 'd'.repeat(64) };
    const view = await renderPreparedReview();
    jest.mocked(renderOpaqueMasks).mockImplementationOnce(() => mutation.promise);

    await act(async () => { latestOverlayProps().onMutationCommit([firstMask]); });
    await act(async () => { view.unmount(); });
    await act(async () => { mutation.resolve(staleRendered); await mutation.promise; });

    await waitFor(() => expect(cleanupProcessorCacheUris).toHaveBeenCalledWith([staleRendered.uri]));
  });
});
