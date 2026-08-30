import { render } from '@testing-library/react-native';

import { NearbyMap } from './NearbyMap.web';

describe('NearbyMap web fallback', () => {
  it('keeps visible fallback state and semantics alongside the five safe atlas labels', async () => {
    const view = await render(<NearbyMap googleMapsConfigured />);

    expect(view.getByLabelText(
      'Privacy-safe neighbourhood atlas. Google Maps unavailable; showing privacy-safe atlas fallback.',
    )).toBeTruthy();
    expect(view.queryByText('Google Maps unavailable')).toBeNull();
    expect(view.getByText('Privacy-safe atlas fallback')).toBeTruthy();
    expect([
      'North cluster',
      'West court',
      'East court',
      'Community green',
      'Public edge',
    ].map((label) => view.getByText(label))).toHaveLength(5);
    expect(JSON.stringify(view.toJSON())).not.toMatch(/BLK|bus stop|station|route/i);
    expect(view.queryByLabelText(/my location/i)).toBeNull();
  });
});
