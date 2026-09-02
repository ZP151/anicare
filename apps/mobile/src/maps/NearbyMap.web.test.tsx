import { render } from '@testing-library/react-native';

import { NearbyMap } from './NearbyMap.web';

describe('NearbyMap web fallback', () => {
  it('uses an honest no-map state and never renders the generated atlas on web', async () => {
    const fallbackLabel = 'Google Maps is unavailable. Switch to the area list to browse delayed community activity.';
    const view = await render(<NearbyMap fallbackLabel={fallbackLabel} googleMapsConfigured />);

    expect(view.getByLabelText(fallbackLabel)).toBeTruthy();
    expect(view.getByText(fallbackLabel)).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/atlas|North cluster|West court|East court|Community green|Public edge|coarse-atlas/i);
    expect(JSON.stringify(view.toJSON())).not.toMatch(/BLK|bus stop|station|route/i);
    expect(view.queryByLabelText(/my location/i)).toBeNull();
  });
});
