import { render } from '@testing-library/react-native';

const mockMapProps = jest.fn();

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      mockMapProps(props);
      return React.createElement(View, { testID: 'google-map' });
    },
    PROVIDER_GOOGLE: 'google',
  };
});

import { NearbyMap } from './NearbyMap.native';

describe('NearbyMap native privacy contract', () => {
  beforeEach(() => mockMapProps.mockClear());

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

  it('fails closed to the safe atlas when native keys are absent', async () => {
    const view = await render(<NearbyMap googleMapsConfigured={false} />);
    expect(view.getByText('Google Maps unavailable')).toBeTruthy();
    expect(mockMapProps).not.toHaveBeenCalled();
    await view.unmount();
  });
});
