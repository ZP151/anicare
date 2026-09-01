import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';
import type { ReportAreaSelection } from './ReportAreaPicker.native';

export function ReportAreaPicker(_props: Readonly<{ onSelect(selection: ReportAreaSelection): void }>) {
  return (
    <View accessibilityLabel="Area capture unavailable on web" style={styles.frame}>
      <Text style={styles.copy}>Area capture is available only in native iOS and Android builds.</Text>
      <Pressable accessibilityLabel="Use device location" accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.disabledAction}>
        <Text style={styles.disabledText}>Use device location</Text>
      </Pressable>
      <Pressable accessibilityLabel="Choose an area on the map" accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.disabledAction}>
        <Text style={styles.disabledText}>Choose an area on the map</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { gap: 12, padding: 16, borderRadius: radii.medium, backgroundColor: colors.surface },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  disabledAction: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas },
  disabledText: { color: colors.muted, fontWeight: '700' },
});
