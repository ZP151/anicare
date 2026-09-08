import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, AppIconName } from './AppIcon';
import { InterfaceColors, useNativeColors } from '../design/native-colors';

export function SettingsGroup({ title, children }: PropsWithChildren<{ title: string }>) {
  const styles = makeStyles(useNativeColors());
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    <View style={styles.group}>{children}</View>
  </View>;
}

export function SettingsRow({ title, icon, value, onPress, last = false, destructive = false, disabled = false }: {
  title: string; icon: AppIconName; value?: string; onPress: () => void;
  last?: boolean; destructive?: boolean; disabled?: boolean;
}) {
  const colors = useNativeColors();
  const styles = makeStyles(colors);
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityValue={value ? { text: value } : undefined} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}>
    <AppIcon name={icon} color={destructive ? colors.danger : colors.actionPrimary} />
    <View style={[styles.rowBody, !last && styles.separator]}>
      <Text style={[styles.title, destructive && styles.destructive]}>{title}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {!destructive && <AppIcon name="chevron" size={14} color={colors.muted} />}
    </View>
  </Pressable>;
}

const makeStyles = (colors: InterfaceColors) => StyleSheet.create({
  section: { gap: 8 },
  heading: { fontSize: 13, lineHeight: 18, color: colors.muted, marginLeft: 16, fontWeight: '500' },
  group: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 14, minHeight: 56 },
  rowBody: { minHeight: 56, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingRight: 16 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  title: { flex: 1, fontSize: 17, lineHeight: 23, color: colors.ink },
  value: { maxWidth: '40%', fontSize: 15, lineHeight: 21, color: colors.muted },
  pressed: { backgroundColor: colors.leafSoft },
  disabled: { opacity: 0.45 },
  destructive: { color: colors.danger },
});
