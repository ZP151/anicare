import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PublicSightingPage } from './feed';

const mockGetSupabaseClient = jest.fn();
const mockListPublicSightings = jest.fn();
const mockPush = jest.fn();
const mockNearbyMapMount = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();

jest.mock('./supabase', () => ({ getSupabaseClient: () => mockGetSupabaseClient() }));
jest.mock('./feed', () => ({
  listPublicSightings: (...args: unknown[]) => mockListPublicSightings(...args),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestForegroundPermissionsAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPositionAsync(...args),
}));
jest.mock('../maps/NearbyMap', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    NearbyMap: () => {
      React.useEffect(() => {
        mockNearbyMapMount();
      }, []);
      return React.createElement(View, null, React.createElement(Text, null, 'Privacy-safe map'));
    },
  };
});
jest.mock('../i18n/LocaleContext', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string) => ({
      'common.beta': 'Closed beta',
      'nearby.title': 'Cats nearby',
      'nearby.subtitle': 'Identity-backed sightings from your community.',
      'nearby.privacyNote': 'Public locations are blurred and shown after a safety delay.',
      'map.title': 'Community map',
      'map.mapTab': 'Map',
      'map.listTab': 'List',
      'map.delayedActivity': 'Delayed community activity',
      'map.legend': 'Coarse areas only · no exact pins or routes',
      'map.showAreaList': 'Show area list',
      'map.showMap': 'Show map',
      'map.resetBroadView': 'Reset broad map view',
      'map.chooseAreaManually': 'Choose area manually',
      'map.manualAreaExplanation': 'Exact pins and routes are unavailable by design.',
      'map.demoStatus': 'Demo map · live feed unavailable',
      'map.loadingStatus': 'Loading delayed community activity…',
      'map.emptyStatus': 'No delayed community activity yet',
      'map.unavailableStatus': 'Community feed unavailable · map remains privacy-safe',
      'map.openArea': 'Open {{area}}',
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
    mockPush.mockReset();
    mockNearbyMapMount.mockReset();
    mockRequestForegroundPermissionsAsync.mockReset();
    mockGetCurrentPositionAsync.mockReset();
  });

  it('keeps the privacy-safe map available in demo mode without exposing H3-like values', async () => {
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
    expect(map.queryAllByText('Demo map · live feed unavailable')).toHaveLength(1);
    expect(map.getByText('Privacy-safe map')).toBeTruthy();
    expect(map.queryByText(/8928308280[a-z0-9]+/i)).toBeNull();
    expect(mockListPublicSightings).not.toHaveBeenCalled();
    await map.unmount();
  });

  it('keeps the privacy-safe map present through loading, empty, live, and unavailable feed states', async () => {
    const client = { rpc: jest.fn() };
    mockGetSupabaseClient.mockReturnValue(client);
    let resolveFeed: (value: PublicSightingPage) => void = () => undefined;
    mockListPublicSightings
      .mockResolvedValueOnce(livePage)
      .mockImplementationOnce(() => new Promise<PublicSightingPage>((resolve) => { resolveFeed = resolve; }));

    const nearby = await render(<NearbyScreen />);
    expect(mockListPublicSightings).toHaveBeenCalledWith({ limit: 20 }, client);
    await waitFor(() => expect(nearby.getByText('Pepper')).toBeTruthy());
    expect(nearby.queryByText(/Mochi/)).toBeNull();
    expect(nearby.queryByText(/8928308280fffff/)).toBeNull();
    expect(nearby.getByText('Reported · awaiting community review')).toBeTruthy();
    expect(nearby.getByText('Seen in the latest delayed window')).toBeTruthy();
    await nearby.unmount();

    const map = await render(<MapScreen />);
    expect(map.getByText('Loading delayed community activity…')).toBeTruthy();
    expect(map.getByText('Privacy-safe map')).toBeTruthy();
    resolveFeed({ items: [], nextCursor: null });
    await waitFor(() => expect(map.getByText('No delayed community activity yet')).toBeTruthy());
    expect(map.getByText('Privacy-safe map')).toBeTruthy();
    await map.unmount();

    mockListPublicSightings.mockResolvedValueOnce(livePage);
    const liveMap = await render(<MapScreen />);
    await fireEvent.press(liveMap.getByRole('button', { name: 'Show area list' }));
    await waitFor(() => expect(liveMap.getByRole('button', { name: 'Open Community area 1' })).toBeTruthy());
    expect(liveMap.queryByText(/8928308280fffff/)).toBeNull();
    await fireEvent.press(liveMap.getByRole('button', { name: 'Open Community area 1' }));
    await fireEvent.press(liveMap.getByRole('button', { name: 'View Pepper' }));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/cat/00000000-0000-4000-8000-000000000102');
    await liveMap.unmount();

    mockListPublicSightings.mockRejectedValueOnce(new Error('offline'));
    const unavailableMap = await render(<MapScreen />);
    await waitFor(() => expect(unavailableMap.getByText('Community feed unavailable · map remains privacy-safe')).toBeTruthy());
    expect(unavailableMap.getByText('Privacy-safe map')).toBeTruthy();
    await unavailableMap.unmount();
  });

  it('supports the safe map and list journey without passing a cell or area key to routes', async () => {
    mockGetSupabaseClient.mockReturnValue(null);

    const map = await render(<MapScreen />);
    expect(await map.findByText('Delayed community activity')).toBeTruthy();
    expect(map.getByText('Coarse areas only · no exact pins or routes')).toBeTruthy();
    expect(map.getByText('Exact pins and routes are unavailable by design.')).toBeTruthy();

    await fireEvent.press(map.getByRole('button', { name: 'Reset broad map view' }));
    await waitFor(() => expect(mockNearbyMapMount).toHaveBeenCalledTimes(2));
    expect(map.getByText('Privacy-safe map')).toBeTruthy();
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();

    await fireEvent.press(map.getByRole('button', { name: 'Show area list' }));
    expect(map.getByRole('button', { name: 'Show map' })).toBeTruthy();
    expect(map.getByText('Community area 1')).toBeTruthy();
    await fireEvent.press(map.getByRole('button', { name: 'Show map' }));
    expect(map.getByText('Privacy-safe map')).toBeTruthy();

    await fireEvent.press(map.getByRole('button', { name: 'Choose area manually' }));
    await fireEvent.press(map.getByRole('button', { name: 'Open Community area 1' }));
    expect(map.getByLabelText('Area detail: Community area 1')).toBeTruthy();
    await fireEvent.press(map.getByRole('button', { name: 'View Demo Meow One' }));
    await fireEvent.press(map.getByRole('button', { name: 'Report from Community area 1' }));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/cat/demo-community-cat-1');
    expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: '/report', params: { source: 'community-map' } });
    expect(JSON.stringify(mockPush.mock.calls)).not.toContain('demo-cell-1');
    expect(JSON.stringify(mockPush.mock.calls)).not.toContain('public-area-1');
    await map.unmount();
  });
});
