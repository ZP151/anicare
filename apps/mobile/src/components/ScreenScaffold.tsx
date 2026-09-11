import { PropsWithChildren, ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNativeColors } from '../design/native-colors';

interface ScreenScaffoldProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  nativeAppearance?: boolean;
  compact?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  refreshLabel?: string;
}

export function ScreenScaffold({
  eyebrow,
  title,
  subtitle,
  trailing,
  children,
  nativeAppearance = true,
  compact = false,
  refreshing = false,
  onRefresh,
  refreshLabel = 'Refresh',
}: ScreenScaffoldProps) {
  const palette = useNativeColors();
  const nativeStyle = nativeAppearance ? { backgroundColor: palette.canvas } : undefined;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, nativeStyle]}>
      <ScrollView testID="screen-scroll" alwaysBounceVertical accessibilityActions={onRefresh ? [{ name: 'refresh', label: refreshLabel }] : undefined} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'refresh') onRefresh?.(); }} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, styles.pullable, compact && styles.compactContent]}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle, nativeAppearance && { color: palette.ink }]}>
              {title}
            </Text>
            {eyebrow ? <Text style={[styles.contextNote, nativeAppearance && { color: palette.muted }]}>{eyebrow}</Text> : null}
            {subtitle ? <Text style={[styles.subtitle, nativeAppearance && { color: palette.muted }]}>{subtitle}</Text> : null}
          </View>
          {trailing}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: Platform.OS === 'ios' ? 112 : 120, gap: 24 },
  compactContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, gap: 12 },
  pullable: { flexGrow: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1, gap: 6 },
  contextNote: { color: '#62626A', fontSize: 13, lineHeight: 18 },
  title: { color: '#1C1C1E', fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  compactTitle: { fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  subtitle: { color: '#62626A', fontSize: 16, lineHeight: 23 },
});
