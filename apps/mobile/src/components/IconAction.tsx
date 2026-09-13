import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useNativeColors } from '../design/native-colors';
import { AppIcon, type AppIconName } from './AppIcon';

/** Compact visual action; its full meaning remains available to assistive technology. */
export function IconAction({ icon, label, onPress, disabled = false, busy = false, selected, expanded, danger = false, style }: Readonly<{
  icon: AppIconName; label: string; onPress(): void; disabled?: boolean; busy?: boolean;
  selected?: boolean; expanded?: boolean; danger?: boolean; style?: StyleProp<ViewStyle>;
}>) {
  const colors = useNativeColors();
  const inactive = disabled || busy;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: inactive, busy, selected, expanded }} disabled={inactive}
    onPress={onPress} style={({ pressed }) => [style, { minWidth: 48, minHeight: 48,
      alignItems: 'center', justifyContent: 'center', borderRadius: 24, opacity: inactive ? .4 : pressed ? .65 : 1 }]}>
    {busy ? <ActivityIndicator color={colors.actionPrimary} /> : <AppIcon name={icon} size={22} color={danger ? colors.danger : colors.actionPrimary} />}
  </Pressable>;
}
