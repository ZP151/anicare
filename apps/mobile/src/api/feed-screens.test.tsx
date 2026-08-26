import { render, waitFor } from '@testing-library/react-native';

const mockGetSupabaseClient = jest.fn();
const mockListPublicSightings = jest.fn();

jest.mock('./supabase', () => ({ getSupabaseClient: () => mockGetSupabaseClient() }));
jest.mock('./feed', () => ({
  listPublicSightings: (...args: unknown[]) => mockListPublicSightings(...args),
}));
jest.mock('../i18n/LocaleContext', () => ({
  useLocale: () => ({
    t: (key: string) => ({
      'common.beta': 'Closed beta',
      'nearby.title': 'Cats nearby',
      'nearby.subtitle': 'Identity-backed sightings from your community.',
      'nearby.privacyNote': 'Public locations are blurred and shown after a safety delay.',
      'map.title': 'Community map',
      'map.subtitle': 'Pins represent approximate community cells, never exact locations.',
    })[key] ?? key,
  }),
}));
jest.mock('../components/ScreenScaffold', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    ScreenScaffold: ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) =>
      React.createElement(View, null, React.createElement(Text, null, title), React.createElement(Text, null, subtitle), children),
  };
});

import NearbyScreen from '../../app/(tabs)/index';
import MapScreen from '../../app/(tabs)/map';

const livePage = {
  items: [{
    sightingId: '00000000-0000-4000-8000-000000000101',
    animalId: '00000000-0000-4000-8000-000000000102',
    primaryAlias: 'Pepper',
    verification: 'reported',
    publicCellId: '8928308280fffff',
    timeBucket: 'today',
    coverMediaId: null,
    cursor: '00000000-0000-4000-8000-000000000101',
  }],
  nextCursor: '00000000-0000-4000-8000-000000000101',
} as const;

describe('fail-closed feed screens', () => {
  beforeEach(() => {
    mockGetSupabaseClient.mockReset();
    mockListPublicSightings.mockReset();
  });

  it('labels synthetic content as demo/unavailable and exposes no live mutation controls without configuration', async () => {
    mockGetSupabaseClient.mockReturnValue(null);

    const nearby = await render(<NearbyScreen />);
    expect(await nearby.findByText('Demo mode · live feed unavailable')).toBeTruthy();
    expect(nearby.queryAllByRole('button')).toHaveLength(0);
    await nearby.unmount();

    const map = await render(<MapScreen />);
    expect(await map.findByText('Demo map · live feed unavailable')).toBeTruthy();
    expect(map.queryAllByRole('button')).toHaveLength(0);
    expect(mockListPublicSightings).not.toHaveBeenCalled();
    await map.unmount();
  });

  it('renders configured data only through the narrow feed wrapper without precise markers', async () => {
    const client = { rpc: jest.fn() };
    mockGetSupabaseClient.mockReturnValue(client);
    mockListPublicSightings.mockResolvedValue(livePage);

    const nearby = await render(<NearbyScreen />);
    expect(mockListPublicSightings).toHaveBeenCalledWith({ limit: 20 }, client);
    await waitFor(() => expect(nearby.getByText('Pepper')).toBeTruthy());
    expect(nearby.queryByText(/Mochi/)).toBeNull();
    expect(nearby.getByText('Approx. cell 8928308280fffff · today')).toBeTruthy();
    await nearby.unmount();

    const map = await render(<MapScreen />);
    await waitFor(() => expect(map.getByText('Cell 8928308280fffff')).toBeTruthy());
    expect(map.getByText('Coarse cells from live feed · no precise markers')).toBeTruthy();
    await map.unmount();
  });
});
