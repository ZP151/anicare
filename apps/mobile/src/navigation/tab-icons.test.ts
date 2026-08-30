import { getTabIconName } from './tab-icons';
import type { TabRoute } from '../i18n/catalog';

describe('tab iconography', () => {
  it('uses semantic MaterialCommunityIcons for every destination', () => {
    expect(getTabIconName('index')).toBe('map-marker');
    expect(getTabIconName('map')).toBe('map-outline');
    expect(getTabIconName('report')).toBe('plus-circle-outline');
    expect(getTabIconName('following')).toBe('heart-outline');
    expect(getTabIconName('profile')).toBe('account-outline');
    const routes: TabRoute[] = ['index', 'map', 'report', 'following', 'profile'];
    expect(routes.map(getTabIconName).join('')).not.toMatch(/[⌂⌖＋♡●]/);
  });
});
