import { act, render } from '@testing-library/react-native';

const mockMapProps = jest.fn();
const mockMapLoadsDuringMount = { value: false };

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      mockMapProps(props);
      React.useLayoutEffect(() => {
        if (mockMapLoadsDuringMount.value) (props.onMapLoaded as (() => void) | undefined)?.();
      }, [props.onMapLoaded]);
      return React.createElement(View, { testID: 'google-map' });
    },
    PROVIDER_GOOGLE: 'google',
  };
});

import { NearbyMap } from './NearbyMap.native';

describe('NearbyMap native privacy contract', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockMapProps.mockClear();
    mockMapLoadsDuringMount.value = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses Google only as a broad basemap with no location or marker layer', async () => {
    const view = await render(<NearbyMap googleMapsConfigured />);
    expect(view.getByTestId('google-map')).toBeTruthy();

    const props = mockMapProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props.provider).toBe('google');
    expect(props.showsUserLocation).toBe(false);
    expect(props.showsMyLocationButton).toBe(false);
    expect(props.maxZoomLevel).toBe(14);
    expect(props.children).toBeUndefined();
    await view.unmount();
  });

  it('uses an honest no-map state when native keys are absent', async () => {
    const fallbackLabel = 'Google Maps is unavailable. Switch to the area list to browse delayed community activity.';
    const view = await render(<NearbyMap fallbackLabel={fallbackLabel} googleMapsConfigured={false} />);
    expect(view.getByLabelText(fallbackLabel)).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/atlas|coarse-atlas/i);
    expect(mockMapProps).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('uses the honest no-map state when a configured provider never becomes ready', async () => {
    const fallbackLabel = 'Google Maps is unavailable. Switch to the area list to browse delayed community activity.';
    const view = await render(<NearbyMap fallbackLabel={fallbackLabel} googleMapsConfigured />);

    expect(view.getByTestId('google-map')).toBeTruthy();
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
      const view = await render(<NearbyMap googleMapsConfigured />);
      const props = mockMapProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      const readinessTimerIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => typeof delay === 'number' && delay >= 1_000);
      const readinessTimer = setTimeoutSpy.mock.results[readinessTimerIndex]?.value;

      expect(readinessTimer).toBeDefined();
      await act(async () => { (props[readinessCallback] as () => void)(); });
      expect(clearTimeoutSpy).toHaveBeenCalledWith(readinessTimer);
      await act(async () => { jest.advanceTimersByTime(60_000); });

      expect(view.getByTestId('google-map')).toBeTruthy();
      expect(view.queryByText(/atlas/i)).toBeNull();
      await view.unmount();
    },
  );

  it('does not arm a late fallback when readiness arrives during native mount', async () => {
    mockMapLoadsDuringMount.value = true;
    const view = await render(<NearbyMap googleMapsConfigured />);

    await act(async () => { jest.advanceTimersByTime(60_000); });

    expect(view.getByTestId('google-map')).toBeTruthy();
    expect(view.queryByText(/atlas/i)).toBeNull();
    await view.unmount();
  });

  it('clears the configured-provider readiness timer when unmounted', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const view = await render(<NearbyMap googleMapsConfigured />);
    const readinessTimerIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => typeof delay === 'number' && delay >= 1_000);
    const readinessTimer = setTimeoutSpy.mock.results[readinessTimerIndex]?.value;

    expect(readinessTimer).toBeDefined();
    await view.unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(readinessTimer);
  });
});
