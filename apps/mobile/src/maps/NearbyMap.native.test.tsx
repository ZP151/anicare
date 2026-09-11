import { act, fireEvent, render } from '@testing-library/react-native';

const mockMapProps = jest.fn(), mockFitToCoordinates = jest.fn();
const mockMapLoadsDuringMount = { value: false };

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockMapProps(props);
      React.useImperativeHandle(ref, () => ({ fitToCoordinates: mockFitToCoordinates, animateToRegion: jest.fn() }));
      React.useLayoutEffect(() => {
        if (mockMapLoadsDuringMount.value) (props.onMapLoaded as (() => void) | undefined)?.();
      }, [props.onMapLoaded]);
      return React.createElement(View, { testID: 'native-map' }, props.children);
    }),
    Marker: (props: Record<string, unknown>) => React.createElement(View, { testID: 'native-marker', onPress: props.onPress }, props.children),
    Polygon: () => null,
    PROVIDER_GOOGLE: 'google',
  };
});

import { NearbyMap } from './NearbyMap.native';

describe('NearbyMap native privacy contract', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockMapProps.mockClear();
    mockFitToCoordinates.mockClear();
    mockMapLoadsDuringMount.value = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses Apple Maps without a Google key and never shows device location', async () => {
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} />);
    expect(view.getByTestId('native-map')).toBeTruthy();

    const props = mockMapProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props.provider).toBeUndefined();
    expect(props.showsUserLocation).toBe(false);
    expect(props.showsMyLocationButton).toBe(false);
    expect(props.maxZoomLevel).toBe(19);
    expect(props.showsBuildings).toBe(true);
    await view.unmount();
  });

  it('uses the honest no-map state when a configured provider never becomes ready', async () => {
    const fallbackLabel = 'The map is unavailable. Switch to the area list to browse delayed community activity.';
    const view = await render(<NearbyMap fallbackLabel={fallbackLabel} androidGoogleMapsConfigured={false} />);

    expect(view.getByTestId('native-map')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(10_000); });

    expect(view.getByLabelText(fallbackLabel)).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/atlas|coarse-atlas/i);
    await view.unmount();
  });

  it.each(['onMapLoaded', 'onMapReady'] as const)(
    'cancels the readiness fallback when the configured map reports %s',
    async (readinessCallback) => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const view = await render(<NearbyMap androidGoogleMapsConfigured={false} />);
      const props = mockMapProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      const readinessTimerIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => typeof delay === 'number' && delay >= 1_000);
      const readinessTimer = setTimeoutSpy.mock.results[readinessTimerIndex]?.value;

      expect(readinessTimer).toBeDefined();
      await act(async () => { (props[readinessCallback] as () => void)(); });
      expect(clearTimeoutSpy).toHaveBeenCalledWith(readinessTimer);
      await act(async () => { jest.advanceTimersByTime(60_000); });

      expect(view.getByTestId('native-map')).toBeTruthy();
      expect(view.queryByText(/atlas/i)).toBeNull();
      await view.unmount();
    },
  );

  it('does not arm a late fallback when readiness arrives during native mount', async () => {
    mockMapLoadsDuringMount.value = true;
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} />);

    await act(async () => { jest.advanceTimersByTime(60_000); });

    expect(view.getByTestId('native-map')).toBeTruthy();
    expect(view.queryByText(/atlas/i)).toBeNull();
    await view.unmount();
  });

  it('clears the configured-provider readiness timer when unmounted', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} />);
    const readinessTimerIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => typeof delay === 'number' && delay >= 1_000);
    const readinessTimer = setTimeoutSpy.mock.results[readinessTimerIndex]?.value;

    expect(readinessTimer).toBeDefined();
    await view.unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(readinessTimer);
  });

  it('fits the published Singapore boundary when ready and only repeats for Show all', async () => {
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} fitSingaporeRequest={0} fitEdgePadding={{top:100,right:20,bottom:180,left:20}} />);
    const props = mockMapProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    await act(async () => { (props.onMapReady as () => void)(); });
    expect(mockFitToCoordinates).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({edgePadding:{top:100,right:20,bottom:180,left:20}}));
    const firstCalls=mockFitToCoordinates.mock.calls.length;
    await view.rerender(<NearbyMap androidGoogleMapsConfigured={false} fitSingaporeRequest={1} fitEdgePadding={{top:100,right:20,bottom:180,left:20}} />);
    expect(mockFitToCoordinates.mock.calls.length).toBe(firstCalls+1);
    await view.unmount();
  });

  it('waits for measured overlays before the initial fit and leaves a focused map alone', async () => {
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} fitLayoutReady={false} />);
    const props = mockMapProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    await act(async () => { (props.onMapReady as () => void)(); });
    expect(mockFitToCoordinates).not.toHaveBeenCalled();
    await view.rerender(<NearbyMap androidGoogleMapsConfigured={false} fitLayoutReady />);
    expect(mockFitToCoordinates).toHaveBeenCalledTimes(1);
    await view.rerender(<NearbyMap androidGoogleMapsConfigured={false} fitLayoutReady focusPoint={{latitude:1.3,longitude:103.8,title:'Search'}} fitSingaporeRequest={0} />);
    expect(mockFitToCoordinates).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('offers every original area in a multi-area marker instead of selecting its first area', async () => {
    const onSelectArea = jest.fn(); const onSelectAreas = jest.fn();
    const areas = [
      { id: 'one', center: [103.75, 1.3], cats: [{ animalId: 'cat-one' }] },
      { id: 'two', center: [103.7501, 1.3], cats: [{ animalId: 'cat-two' }] },
    ] as never;
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} areas={areas} onSelectArea={onSelectArea} onSelectAreas={onSelectAreas} />);
    await fireEvent.press(view.getByTestId('native-marker'));
    expect(onSelectArea).not.toHaveBeenCalled();
    expect(onSelectAreas).toHaveBeenCalledWith(['one', 'two']);
    await view.unmount();
  });
});
