import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SymbolView } from 'expo-symbols';
import { ComponentProps } from 'react';
import { ColorValue, Platform, View } from 'react-native';

const symbols = {
  account: ['person.crop.circle', 'account-circle-outline'],
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
  activity: ['clock', 'clock-outline'],
  camera: ['camera', 'camera-outline'],
  heart: ['heart', 'heart-outline'],
  mail: ['envelope', 'email-outline'],
  close: ['xmark', 'close'],
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
