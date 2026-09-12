import { Platform } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockMapProps = jest.fn(), mockAnimateToRegion = jest.fn();
const mockMapLoadsDuringMount = { value: false };

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockMapProps(props);
      React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimateToRegion }));
      React.useLayoutEffect(() => {
        (props.onLayout as any)?.({nativeEvent:{layout:{width:390,height:844}}});
        if (mockMapLoadsDuringMount.value) (props.onMapReady as (() => void) | undefined)?.();
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
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockMapProps.mockClear();
    mockAnimateToRegion.mockClear();
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
    expect(props.cameraZoomRange).toEqual({minCenterCoordinateDistance:150});
    expect(props.minZoomLevel).toBeUndefined();
    expect(props.showsBuildings).toBe(true);
    await view.unmount();
  });

  it('keeps Apple Maps mounted past the timeout and fits when an offscreen map finally renders', async () => {
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} />);
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(view.getByTestId('native-map')).toBeTruthy();
    expect(mockAnimateToRegion).not.toHaveBeenCalled();
    const props = mockMapProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    await act(async () => { (props.onMapReady as () => void)(); });
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('native-map')).toBeTruthy();
    await view.unmount();
  });

  it('keeps the fallback for an unconfigured Android provider', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} fallbackLabel="Map unavailable" />);
    expect(view.queryByTestId('native-map')).toBeNull();
    expect(view.getByLabelText('Map unavailable')).toBeTruthy();
    await view.unmount();
  });

  it.each(['onMapLoaded', 'onMapReady'] as const)(
    'cancels the readiness fallback when the configured map reports %s',
    async (readinessCallback) => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const view = await render(<NearbyMap androidGoogleMapsConfigured />);
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

  it('clears the Android configured-provider readiness timer when unmounted', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const view = await render(<NearbyMap androidGoogleMapsConfigured />);
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
    expect(mockAnimateToRegion).toHaveBeenCalledWith(expect.objectContaining({longitudeDelta:expect.any(Number)}),expect.any(Number));
    expect((mockAnimateToRegion.mock.calls[0]![0] as any).longitudeDelta).toBeLessThan(0.64);
    expect(props.mapPadding).toEqual({top:0,right:0,bottom:0,left:0});
    const firstCalls=mockAnimateToRegion.mock.calls.length;
    await view.rerender(<NearbyMap androidGoogleMapsConfigured={false} fitSingaporeRequest={1} fitEdgePadding={{top:100,right:20,bottom:180,left:20}} />);
    expect(mockAnimateToRegion.mock.calls.length).toBe(firstCalls+1);
    await view.unmount();
  });

  it('waits for measured overlays before the initial fit and leaves a focused map alone', async () => {
    const view = await render(<NearbyMap androidGoogleMapsConfigured={false} fitLayoutReady={false} />);
    const props = mockMapProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    await act(async () => { (props.onMapReady as () => void)(); });
    expect(mockAnimateToRegion).not.toHaveBeenCalled();
    await view.rerender(<NearbyMap androidGoogleMapsConfigured={false} fitLayoutReady />);
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    await view.rerender(<NearbyMap androidGoogleMapsConfigured={false} fitLayoutReady focusPoint={{latitude:1.3,longitude:103.8,title:'Search'}} fitSingaporeRequest={0} />);
    expect(mockAnimateToRegion).toHaveBeenLastCalledWith(expect.objectContaining({latitude:1.3,longitude:103.8,latitudeDelta:0.008}),expect.any(Number));
    await view.unmount();
  });

  it('refits a changed viewport once without responding to ordinary re-renders',async()=>{
    const view=await render(<NearbyMap androidGoogleMapsConfigured={false} fitEdgePadding={{top:60,right:20,bottom:100,left:20}}/>);
    const props=mockMapProps.mock.calls.at(-1)![0] as any;
    await act(async()=>props.onMapReady());
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(1);
    await act(async()=>props.onLayout({nativeEvent:{layout:{width:844,height:390}}}));
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(2);
    await act(async()=>props.onLayout({nativeEvent:{layout:{width:844,height:390}}}));
    expect(mockAnimateToRegion).toHaveBeenCalledTimes(2);
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
