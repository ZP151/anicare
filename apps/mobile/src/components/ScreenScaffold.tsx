import { PropsWithChildren, ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../design/theme';
import { useNativeColors } from '../design/native-colors';

interface ScreenScaffoldProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  nativeAppearance?: boolean;
}

export function ScreenScaffold({
  eyebrow,
  title,
  subtitle,
  trailing,
  children,
  nativeAppearance = false,
}: ScreenScaffoldProps) {
  const palette = useNativeColors();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, nativeAppearance && { backgroundColor: palette.canvas }]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={[styles.title, nativeAppearance && { color: palette.ink }]}>
              {title}
            </Text>
            {eyebrow ? <Text style={styles.contextNote}>{eyebrow}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {trailing}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: Platform.OS === 'ios' ? 32 : 120, gap: 24 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1, gap: 6 },
  contextNote: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  title: { color: colors.ink, fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
});
