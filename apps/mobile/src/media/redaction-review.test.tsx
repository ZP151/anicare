import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ draftId: 'draft-12345678' }),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../src/media/processor', () => ({
  prepareCanonical: jest.fn(),
  renderOpaqueMasks: jest.fn(),
}));
jest.mock('../../src/media/draft-media', () => ({
  cleanupProcessorCacheUris: jest.fn(),
  persistReviewedMedia: jest.fn(),
  verifyReviewedMedia: jest.fn(),
}));

import RedactionReviewScreen from '../../app/report/redaction-review';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { cleanupProcessorCacheUris } from './draft-media';
import { prepareCanonical, renderOpaqueMasks } from './processor';

const canonical = {
  uri: 'file:///cache/animalhelper-canonical-12345678.jpg',
  sha256: 'a'.repeat(64), mimeType: 'image/jpeg' as const, width: 1200, height: 800,
  byteLength: 4, recipeVersion: 'jpeg-srgb-2048-q88.v1',
  detectorVersions: { cats: 'unavailable', people: 'unavailable', plates: 'unavailable' },
};
const rendered = { ...canonical, uri: 'file:///cache/animalhelper-reviewed-12345678.jpg' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(cleanupProcessorCacheUris).mockResolvedValue(undefined);
});

describe('private redaction review screen', () => {
  it('states that every automatic detector is unavailable and offers no publication action', async () => {
    const view = await render(<RedactionReviewScreen />);

    expect(view.getByText('People detection: unavailable')).toBeTruthy();
    expect(view.getByText('Licence-plate detection: unavailable')).toBeTruthy();
    expect(view.getByText('Cat detection: unavailable')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Choose photo for private review' })).toBeTruthy();
    expect(view.queryByText(/public upload|publish/i)).toBeNull();
  });

  it('cleans every owned plaintext output when the review screen unmounts', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://gallery/source.jpg' }] } as never);
    jest.mocked(prepareCanonical).mockResolvedValue(canonical);
    jest.mocked(renderOpaqueMasks).mockResolvedValue(rendered);
    const view = await render(<RedactionReviewScreen />);

    await act(async () => { fireEvent.press(view.getByText('Choose photo for private review')); });
    await waitFor(() => expect(view.getByText(/Tap anywhere on the image/)).toBeTruthy());
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
});
