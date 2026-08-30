import type { ComponentProps } from 'react';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import type { TabRoute } from '../i18n/catalog';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const tabIcons: Record<TabRoute, IconName> = {
  index: 'map-marker-radius-outline',
  map: 'map-outline',
  report: 'plus-circle-outline',
  following: 'heart-outline',
  profile: 'account-outline',
};

export function getTabIconName(route: TabRoute): IconName {
  return tabIcons[route];
}
