import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import { getReportCopy } from './report-copy';

export type ReportRouteShellKind = 'draft' | 'receipt' | 'history';

const opaqueReportId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOpaqueReportId(value: unknown): value is string {
  return typeof value === 'string' && opaqueReportId.test(value);
}

export function ReportRouteShell({ kind, locale, navigate, reportId }: Readonly<{
  kind: ReportRouteShellKind;
  locale: Locale;
  navigate(path: string): void;
  reportId?: string | string[];
}>) {
  const copy = getReportCopy(locale);
  const needsId = kind === 'draft' || kind === 'receipt';
  const validId = !needsId || isOpaqueReportId(reportId);
  const title = kind === 'draft' ? copy.draftShellTitle : kind === 'receipt' ? copy.receiptShellTitle : copy.historyShellTitle;
  const readyTitle = kind === 'draft' ? copy.draftShellReadyTitle : null;
  const readyCopy = kind === 'draft' ? copy.draftShellReadyCopy : kind === 'receipt' ? copy.receiptShellCopy : copy.historyShellCopy;
  const invalidCopy = kind === 'draft' ? copy.invalidDraftId : copy.invalidReceiptId;

  return (
    <ScreenScaffold subtitle={validId ? readyCopy : invalidCopy} title={title}>
      <View style={styles.content}>
        {validId && readyTitle ? <Text accessibilityRole="header" style={styles.stateTitle}>{readyTitle}</Text> : null}
        {!validId ? <Text accessibilityRole="header" style={styles.stateTitle}>{copy.routeUnavailableTitle}</Text> : null}
        <Pressable accessibilityLabel={copy.backToReportAction} accessibilityRole="button" onPress={() => navigate('/report')} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.actionText}>{copy.backToReportAction}</Text>
        </Pressable>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10 },
  stateTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  action: { minHeight: 48, marginTop: 6, paddingHorizontal: 16, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.actionPrimary },
  actionText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.76 },
});
