import type { ComponentProps } from 'react';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { TabRoute } from '../i18n/catalog';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const tabIcons: Record<TabRoute, Readonly<{ active: IconName; inactive: IconName }>> = {
  index: { active: 'map-marker', inactive: 'map-marker-outline' },
  map: { active: 'map', inactive: 'map-outline' },
  report: { active: 'plus-circle', inactive: 'plus-circle-outline' },
  following: { active: 'heart', inactive: 'heart-outline' },
  profile: { active: 'account', inactive: 'account-outline' },
};

export function getTabIconName(route: TabRoute, focused: boolean): IconName {
  return focused ? tabIcons[route].active : tabIcons[route].inactive;
}
