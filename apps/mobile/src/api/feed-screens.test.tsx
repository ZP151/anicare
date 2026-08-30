import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockGetSupabaseClient = jest.fn();
const mockListPublicSightings = jest.fn();
const mockPush = jest.fn();

jest.mock('./supabase', () => ({ getSupabaseClient: () => mockGetSupabaseClient() }));
jest.mock('./feed', () => ({
  listPublicSightings: (...args: unknown[]) => mockListPublicSightings(...args),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../maps/NearbyMap', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    NearbyMap: () => React.createElement(View, null, React.createElement(Text, null, 'Privacy-safe map')),
  };
});
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

  it('labels synthetic content and keeps the two core journeys available without configuration', async () => {
    mockGetSupabaseClient.mockReturnValue(null);

    const nearby = await render(<NearbyScreen />);
    expect(await nearby.findByText('Preview data')).toBeTruthy();
    expect(nearby.getByText('Coarse neighbourhood view.')).toBeTruthy();
    expect(nearby.getByText('Exact locations are protected.')).toBeTruthy();
    await fireEvent.press(nearby.getByRole('button', { name: 'View Mochi' }));
    await fireEvent.press(nearby.getByRole('button', { name: 'Report a sighting of Mochi' }));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/cat/demo-cat');
    expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: '/report', params: { animalId: 'demo-cat' } });
    await fireEvent.press(nearby.getByRole('button', { name: 'How locations are protected' }));
    expect(nearby.getByText('No user location is requested. Cat locations, routes and timestamps remain hidden.')).toBeTruthy();
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
    expect(nearby.queryByText(/8928308280fffff/)).toBeNull();
    expect(nearby.getByText('Reported · awaiting community review')).toBeTruthy();
    expect(nearby.getByText('Seen in the latest delayed window')).toBeTruthy();
    await nearby.unmount();

    const map = await render(<MapScreen />);
    await waitFor(() => expect(map.getByText('Cell 8928308280fffff')).toBeTruthy());
    expect(map.getByText('Coarse cells from live feed · no precise markers')).toBeTruthy();
    await map.unmount();
  });
});
