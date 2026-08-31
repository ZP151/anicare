import { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../design/theme';

interface ScreenScaffoldProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
}

export function ScreenScaffold({
  eyebrow,
  title,
  subtitle,
  trailing,
  children,
}: ScreenScaffoldProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
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
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 120, gap: 18 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1, gap: 6 },
  eyebrow: { color: colors.leaf, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
});
