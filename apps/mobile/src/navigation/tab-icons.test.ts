import { getTabIconName } from './tab-icons';
import type { TabRoute } from '../i18n/catalog';

describe('tab iconography', () => {
  it('uses semantic MaterialCommunityIcons for every destination', () => {
    expect(getTabIconName('index', true)).toBe('map-marker');
    expect(getTabIconName('index', false)).toBe('map-marker-outline');
    expect(getTabIconName('map', true)).toBe('map');
    expect(getTabIconName('map', false)).toBe('map-outline');
    expect(getTabIconName('report', true)).toBe('plus-circle');
    expect(getTabIconName('report', false)).toBe('plus-circle-outline');
    expect(getTabIconName('following', true)).toBe('heart');
    expect(getTabIconName('following', false)).toBe('heart-outline');
    expect(getTabIconName('profile', true)).toBe('account');
    expect(getTabIconName('profile', false)).toBe('account-outline');
    const routes: TabRoute[] = ['index', 'map', 'report', 'following', 'profile'];
    expect(routes.flatMap((route) => [getTabIconName(route, true), getTabIconName(route, false)]).join(''))
      .not.toMatch(/[⌂⌖＋♡●]/);
  });
});
