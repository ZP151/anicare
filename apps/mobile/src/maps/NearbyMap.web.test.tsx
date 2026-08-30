import { render } from '@testing-library/react-native';

import { NearbyMap } from './NearbyMap.web';

describe('NearbyMap web fallback', () => {
  it('labels the privacy-safe atlas fallback without exposing precise map controls', async () => {
    const view = await render(<NearbyMap googleMapsConfigured />);

    expect(view.getByLabelText('Privacy-safe neighbourhood atlas')).toBeTruthy();
    expect(view.getByText('Google Maps unavailable')).toBeTruthy();
    expect(view.getByText('Privacy-safe atlas fallback')).toBeTruthy();
    expect(view.getByText('Community green')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/BLK|bus stop|station|route/i);
    expect(view.queryByLabelText(/my location/i)).toBeNull();
  });
});
