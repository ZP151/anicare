import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PublicSightingPage } from './feed';

const mockGetSupabaseClient = jest.fn();
const mockListPublicSightings = jest.fn();
const mockPush = jest.fn();
const mockNearbyMapMount = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();
const mockSaveOfflineDraft = jest.fn();
const mockLocale = { value: 'en' as 'en' | 'zh-CN' };
const mockReactStateValues: unknown[] = [];
const reportDraftId = '00000000-0000-4000-8000-000000000303';

jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initialState: unknown) => {
      const trackedInitialState = typeof initialState === 'function'
        ? () => {
          const value = (initialState as () => unknown)();
          mockReactStateValues.push(value);
          return value;
        }
        : initialState;
      if (typeof initialState !== 'function') mockReactStateValues.push(initialState);
      const [value, setValue] = actual.useState(trackedInitialState);
      return [value, (nextValue: unknown) => {
        if (typeof nextValue === 'function') {
          setValue((previousValue: unknown) => {
            const resolvedValue = (nextValue as (previousValue: unknown) => unknown)(previousValue);
            mockReactStateValues.push(resolvedValue);
            return resolvedValue;
          });
          return;
        }
        mockReactStateValues.push(nextValue);
        setValue(nextValue);
      }];
    },
  };
});

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
jest.mock('expo-crypto', () => ({ randomUUID: () => reportDraftId }));
jest.mock('../offline/draft-store', () => ({
  saveOfflineDraft: (...args: unknown[]) => mockSaveOfflineDraft(...args),
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
  useLocale: () => {
    const { translate } = jest.requireActual('../i18n/catalog') as typeof import('../i18n/catalog');
    return {
      locale: mockLocale.value,
      t: (key: import('../i18n/catalog').MessageKey) => translate(mockLocale.value, key),
    };
  },
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
    mockSaveOfflineDraft.mockReset().mockResolvedValue(undefined);
    mockLocale.value = 'en';
    mockReactStateValues.length = 0;
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
    await waitFor(() => expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/report/new',
      params: { draftId: reportDraftId },
    }));
    expect(mockSaveOfflineDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: reportDraftId,
      notes: '',
      risk: 'normal',
    }));
    await fireEvent.press(nearby.getByRole('button', { name: 'How locations are protected' }));
    expect(nearby.getByText('No user location is requested. Cat locations, routes and timestamps remain hidden.')).toBeTruthy();
    await nearby.unmount();

    const map = await render(<MapScreen />);
    expect(await map.findByText('Demo map · live feed unavailable')).toBeTruthy();
    expect(map.getByText('Demo map · live feed unavailable').parent?.props.accessibilityLiveRegion).toBeUndefined();
    expect(map.queryAllByText('Demo map · live feed unavailable')).toHaveLength(1);
    expect(map.getByText('Privacy-safe map')).toBeTruthy();
    expect(map.queryByText(/8928308280[a-z0-9]+/i)).toBeNull();
    expect(mockListPublicSightings).not.toHaveBeenCalled();
    const demoState = mockReactStateValues.map((value) => {
      try { return JSON.stringify(value); } catch { return '[unserializable]'; }
    }).join('|');
    expect(demoState).toContain('Community area 1');
    expect(demoState).not.toContain('demo-cell-1');
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
    expect(map.getByText('Loading delayed community activity…').parent?.props.accessibilityLiveRegion).toBe('polite');
    expect(map.getByText('Privacy-safe map')).toBeTruthy();
    resolveFeed({ items: [], nextCursor: null });
    await waitFor(() => expect(map.getByText('No delayed community activity yet')).toBeTruthy());
    expect(map.getByText('No delayed community activity yet').parent?.props.accessibilityLiveRegion).toBe('polite');
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
    expect(unavailableMap.getByText('Community feed unavailable · map remains privacy-safe').parent?.props.accessibilityLiveRegion).toBe('polite');
    expect(unavailableMap.getByText('Privacy-safe map')).toBeTruthy();
    await unavailableMap.unmount();
  });

  it('projects feed and demo area summaries before any value reaches React state', async () => {
    const client = { rpc: jest.fn() };
    const sensitivePage: PublicSightingPage = {
      items: [{
        ...livePage.items[0],
        sightingId: 'sensitive-sighting-id',
        publicCellId: '8928308280abcde',
        coverMediaId: 'sensitive-cover-media-id',
        cursor: 'sensitive-row-cursor',
      }],
      nextCursor: 'sensitive-page-cursor',
    };
    mockGetSupabaseClient.mockReturnValue(client);
    mockListPublicSightings.mockResolvedValueOnce(sensitivePage);

    const map = await render(<MapScreen />);
    await fireEvent.press(map.getByRole('button', { name: 'Show area list' }));
    await waitFor(() => expect(map.getByRole('button', { name: 'Open Community area 1' })).toBeTruthy());

    const storedState = mockReactStateValues.map((value) => {
      try { return JSON.stringify(value); } catch { return '[unserializable]'; }
    }).join('|');
    expect(storedState).not.toMatch(/publicCellId|sightingId|coverMediaId|cursor|nextCursor/);
    expect(storedState).not.toContain('8928308280abcde');
    expect(storedState).not.toContain('sensitive-sighting-id');
    expect(storedState).not.toContain('sensitive-cover-media-id');
    expect(storedState).not.toContain('sensitive-row-cursor');
    expect(storedState).not.toContain('sensitive-page-cursor');
    await map.unmount();
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
    await waitFor(() => expect(mockPush).toHaveBeenNthCalledWith(2, {
      pathname: '/report/new',
      params: { draftId: reportDraftId },
    }));
    expect(mockSaveOfflineDraft).toHaveBeenCalledWith(expect.objectContaining({
      id: reportDraftId,
      notes: '',
      risk: 'normal',
      report: expect.objectContaining({ step: 'area', manualPublicCellId: null }),
    }));
    expect(JSON.stringify(mockPush.mock.calls)).not.toContain('demo-cell-1');
    expect(JSON.stringify(mockPush.mock.calls)).not.toContain('public-area-1');
    await map.unmount();
  });

  it('renders the complete Simplified Chinese map, list, and area-detail journey', async () => {
    const client = { rpc: jest.fn() };
    mockLocale.value = 'zh-CN';
    mockGetSupabaseClient.mockReturnValue(client);
    mockListPublicSightings.mockResolvedValueOnce(livePage);

    const map = await render(<MapScreen />);
    expect(map.getByText('社区地图')).toBeTruthy();
    expect(map.getByText('延迟显示的社区活动')).toBeTruthy();
    expect(map.getByText('仅显示粗略区域 · 不显示精确位置或路线')).toBeTruthy();
    expect(map.getByText('为保护社区猫，地图不提供精确位置或路线。')).toBeTruthy();

    await fireEvent.press(map.getByRole('button', { name: '显示区域列表' }));
    await waitFor(() => expect(map.getByRole('button', { name: '打开社区区域1' })).toBeTruthy());
    expect(map.getAllByText('最近延迟时段内有 1 只猫活动').length).toBeGreaterThanOrEqual(1);
    await fireEvent.press(map.getByRole('button', { name: '打开社区区域1' }));

    expect(map.getByLabelText('区域详情：社区区域1')).toBeTruthy();
    expect(map.getByText('可查看 1 只猫')).toBeTruthy();
    expect(map.getByText('其中 0 只已获社区确认')).toBeTruthy();
    expect(map.getByText('已报告 · 等待社区审核')).toBeTruthy();
    expect(map.getByText('最近延迟时段内有目击记录')).toBeTruthy();
    expect(map.getByRole('button', { name: '查看 Pepper' })).toBeTruthy();
    expect(map.getByRole('button', { name: '从社区区域1提交报告' })).toBeTruthy();
    expect(map.getByRole('button', { name: '关注区域' }).props.accessibilityState).toEqual({ disabled: true });
    expect(map.getByText('需要登录；区域关注服务上线后才能使用此功能。')).toBeTruthy();

    const rendered = JSON.stringify(map.toJSON());
    expect(rendered).not.toMatch(
      /Community map|Delayed community activity|Coarse areas only|Community area|cats? active|Reported ·|Seen in|cats? visible|community-confirmed|View Pepper|Report from|Follow area|Sign-in and hosted/i,
    );
    expect(rendered).not.toMatch(/publicCellId|sightingId|coverMediaId|cursor|nextCursor/);
    expect(rendered).not.toContain(livePage.items[0].publicCellId);
    expect(rendered).not.toContain(livePage.items[0].sightingId);
    await map.unmount();
  });
});
