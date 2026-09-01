import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyReportsCursor, MyReportsPage, MyReportSummary } from '../api/my-reports';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import type { StoredDraft } from '../offline/draft-policy';
import { mergeReceiptStatus, type ReportReceiptStatus } from './report-flow';
import { getReportCopy } from './report-copy';
import { isOpaqueReportId } from './ReportRouteShell';

export type ReportReceiptDependencies = Readonly<{
  listReports(input: Readonly<{ cursor?: MyReportsCursor | null }>): Promise<MyReportsPage>;
  loadDrafts(): Promise<readonly StoredDraft[]>;
  navigate(path: string): void;
}>;

type ReceiptState = Readonly<{ status: ReportReceiptStatus | null; remoteUnavailable: boolean }>;

async function findRemoteReport(
  sightingId: string,
  listReports: ReportReceiptDependencies['listReports'],
): Promise<MyReportSummary | null> {
  let cursor: MyReportsCursor | null = null;
  const seen = new Set<string>();
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const page = await listReports({ cursor });
    const item = page.items.find((candidate) => candidate.sightingId === sightingId);
    if (item) return item;
    if (!page.nextCursor) return null;
    const key = `${page.nextCursor.createdAt}:${page.nextCursor.sightingId}`;
    if (seen.has(key)) throw new Error('invalid_my_reports_response');
    seen.add(key);
    cursor = page.nextCursor;
  }
  throw new Error('my_reports_unavailable');
}

function localDraftForSighting(drafts: readonly StoredDraft[], sightingId: string): StoredDraft | null {
  return drafts.find((draft) => draft.sightingId === sightingId) ?? null;
}

export function ReportReceipt({ sightingId, dependencies, locale }: Readonly<{
  sightingId: string | string[] | undefined;
  dependencies: ReportReceiptDependencies;
  locale: Locale;
}>) {
  const copy = getReportCopy(locale);
  const validSightingId = isOpaqueReportId(sightingId);
  const [state, setState] = useState<ReceiptState | null>(null);

  useEffect(() => {
    if (!validSightingId) return;
    let mounted = true;
    void (async () => {
      const drafts = await dependencies.loadDrafts().catch(() => [] as readonly StoredDraft[]);
      try {
        const remote = await findRemoteReport(sightingId, dependencies.listReports);
        if (mounted) setState({ status: mergeReceiptStatus(remote, localDraftForSighting(drafts, sightingId)), remoteUnavailable: false });
      } catch {
        if (mounted) setState({ status: mergeReceiptStatus(null, localDraftForSighting(drafts, sightingId)), remoteUnavailable: true });
      }
    })();
    return () => { mounted = false; };
  }, [dependencies, sightingId, validSightingId]);

  if (!validSightingId) {
    return <ScreenScaffold subtitle={copy.invalidReceiptId} title={copy.receiptTitle}>
      <View style={styles.section}><Text accessibilityRole="header" style={styles.stateTitle}>{copy.routeUnavailableTitle}</Text><Text style={styles.notice}>{copy.receiptUnavailable}</Text><ReceiptActions copy={copy} navigate={dependencies.navigate} /></View>
    </ScreenScaffold>;
  }

  return <ScreenScaffold subtitle={copy.receiptSubtitle} title={copy.receiptTitle}>
    {state === null ? <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.leaf} /><Text style={styles.notice}>{copy.receiptLoading}</Text></View> : null}
    {state !== null && state.status === null ? <View style={styles.section}><Text accessibilityRole="header" style={styles.stateTitle}>{copy.routeUnavailableTitle}</Text><Text accessibilityLiveRegion="polite" style={styles.notice}>{state.remoteUnavailable ? copy.receiptRemoteUnavailable : copy.receiptUnavailable}</Text><ReceiptActions copy={copy} navigate={dependencies.navigate} /></View> : null}
    {state?.status ? <View style={styles.section} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={styles.stateTitle}>{copy.receiptReceived}</Text>
      {state.remoteUnavailable ? <Text style={styles.notice}>{copy.receiptRemoteUnavailable}</Text> : null}
      <View style={styles.statusList}>
        <Text style={styles.status}>{copy.reportStateLabel(state.status.reportState)}</Text>
        <Text style={styles.status}>{copy.mediaStateLabel(state.status.mediaState)}</Text>
        <Text style={styles.status}>{copy.identityStateLabel(state.status.identityState)}</Text>
      </View>
      <ReceiptActions copy={copy} navigate={dependencies.navigate} />
    </View> : null}
  </ScreenScaffold>;
}

function ReceiptActions({ copy, navigate }: Readonly<{ copy: ReturnType<typeof getReportCopy>; navigate(path: string): void }>) {
  return <View style={styles.actions}>
    <Pressable accessibilityLabel={copy.viewReportsAction} accessibilityRole="button" onPress={() => navigate('/report/my-reports')} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}><Text style={styles.primaryActionText}>{copy.viewReportsAction}</Text></Pressable>
    <Pressable accessibilityLabel={copy.backToReportAction} accessibilityRole="button" onPress={() => navigate('/report')} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}><Text style={styles.secondaryActionText}>{copy.backToReportAction}</Text></Pressable>
    <Pressable accessibilityLabel={copy.browseNearbyAction} accessibilityRole="button" onPress={() => navigate('/')} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}><Text style={styles.secondaryActionText}>{copy.browseNearbyAction}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  loading: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: { gap: 12 },
  stateTitle: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: '800' },
  notice: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  statusList: { gap: 8, paddingVertical: 4 },
  status: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  actions: { gap: 8, marginTop: 4 },
  primaryAction: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  primaryActionText: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  secondaryAction: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.actionPrimary },
  secondaryActionText: { color: colors.actionPrimary, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.76 },
});
