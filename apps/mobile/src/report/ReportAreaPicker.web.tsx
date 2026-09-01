import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import type { ReportAreaSelection } from './ReportAreaPicker.native';
import { getReportCopy } from './report-copy';

export function ReportAreaPicker({ locale = 'en' }: Readonly<{ locale?: Locale; onSelect(selection: ReportAreaSelection): void }>) {
  const copy = getReportCopy(locale);
  return (
    <View accessibilityLabel={copy.wizardWebAreaLabel} style={styles.frame}>
      <Text style={styles.copy}>{copy.wizardWebAreaUnavailable}</Text>
      <Pressable accessibilityLabel={copy.wizardWebDeviceLocation} accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.disabledAction}>
        <Text style={styles.disabledText}>{copy.wizardWebDeviceLocation}</Text>
      </Pressable>
      <Pressable accessibilityLabel={copy.wizardWebManualArea} accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.disabledAction}>
        <Text style={styles.disabledText}>{copy.wizardWebManualArea}</Text>
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
