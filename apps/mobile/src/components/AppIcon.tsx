import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SymbolView } from 'expo-symbols';
import { ComponentProps } from 'react';
import { ColorValue, Platform, View } from 'react-native';

const symbols = {
  rotate: ['rotate.right', 'rotate-right'], flip: ['arrow.left.and.right.righttriangle.left.righttriangle.right', 'flip-horizontal'], reset: ['arrow.counterclockwise', 'restore'], trash: ['trash', 'trash-can-outline'],
  edit: ['pencil', 'pencil-outline'],
  settings: ['gearshape', 'cog-outline'],
  home: ['house', 'home-outline'],
  search: ['magnifyingglass', 'magnify'],
  map: ['map', 'map-outline'],
  account: ['person.crop.circle', 'account-circle-outline'],
  person: ['person.crop.circle', 'account-circle-outline'],
  'human-01': ['person.crop.circle', 'account-circle-outline'], 'human-02': ['person.crop.circle', 'account-circle-outline'],
  'human-03': ['person.crop.circle', 'account-circle-outline'], 'human-04': ['person.crop.circle', 'account-circle-outline'],
  'human-05': ['person.crop.circle', 'account-circle-outline'], 'human-06': ['person.crop.circle', 'account-circle-outline'],
  'human-07': ['person.crop.circle', 'account-circle-outline'], 'human-08': ['person.crop.circle', 'account-circle-outline'],
  'human-09': ['person.crop.circle', 'account-circle-outline'], 'human-10': ['person.crop.circle', 'account-circle-outline'],
  'human-11': ['person.crop.circle', 'account-circle-outline'], 'human-12': ['person.crop.circle', 'account-circle-outline'],
  'human-13': ['person.crop.circle', 'account-circle-outline'], 'human-14': ['person.crop.circle', 'account-circle-outline'],
  'human-15': ['person.crop.circle', 'account-circle-outline'],
  reports: ['doc.text', 'text-box-outline'],
  care: ['heart.text.clipboard', 'heart-outline'],
  privacy: ['hand.raised', 'hand-back-right-outline'],
  language: ['globe', 'web'],
  chevron: ['chevron.right', 'chevron-right'],
  check: ['checkmark', 'check'],
  signout: ['rectangle.portrait.and.arrow.right', 'logout'],
  apple: ['apple.logo', 'apple'],
  google: ['g.circle', 'google'],
  cat: ['cat', 'cat'],
  paw: ['pawprint', 'paw'],
  leaf: ['leaf', 'leaf'],
  sun: ['sun.max', 'white-balance-sunny'],
  moon: ['moon', 'weather-night'],
  back: ['chevron.left', 'chevron-left'],
  more: ['ellipsis', 'dots-horizontal'],
  filters: ['line.3.horizontal.decrease', 'tune-variant'],
  location: ['location', 'map-marker-outline'],
  locationFill: ['location.fill', 'crosshairs-gps'],
  fit: ['arrow.up.left.and.arrow.down.right', 'arrow-expand-all'],
  expand: ['chevron.up', 'chevron-up'],
  collapse: ['chevron.down', 'chevron-down'],
  activity: ['clock', 'clock-outline'],
  camera: ['camera', 'camera-outline'],
  photo: ['photo', 'image-outline'],
  plus: ['plus', 'plus'],
  heart: ['heart', 'heart-outline'],
  heartFilled: ['heart.fill', 'heart'],
  mail: ['envelope', 'email-outline'],
  close: ['xmark', 'close'],
  community: ['text.bubble', 'forum-outline'],
  send: ['paperplane.fill', 'send'],
  reply: ['arrowshape.turn.up.left', 'reply-outline'],
} as const;

export type AppIconName = keyof typeof symbols;

/** Native symbols on iPhone; one consistent vector family elsewhere. */
export function AppIcon({ name, color, size = 22 }: { name: AppIconName; color: ColorValue; size?: number }) {
  const [sf, fallback] = symbols[name];
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {Platform.OS === 'ios'
      ? <SymbolView name={sf} tintColor={color} size={size} weight="regular" style={{ width: size, height: size }} />
      : <MaterialCommunityIcons name={fallback as ComponentProps<typeof MaterialCommunityIcons>['name']} color={color} size={size} />}
  </View>;
}
