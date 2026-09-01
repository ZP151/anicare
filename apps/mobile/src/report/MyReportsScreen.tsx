import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MyReportsCursor, MyReportsPage } from '../api/my-reports';
import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import type { StoredDraft } from '../offline/draft-policy';
import { mergeReportRecovery, type ReportTimelineItem } from './report-flow';
import { getReportCopy } from './report-copy';

export type MyReportsDependencies = Readonly<{
  getSessionSubject(): Promise<string | null>;
  subscribeToAuthChanges(listener: (subject: string | null) => void): () => void;
  listReports(input: Readonly<{ cursor?: MyReportsCursor | null }>): Promise<MyReportsPage>;
  loadDrafts(): Promise<readonly StoredDraft[]>;
  navigate(path: string): void;
}>;

type HistoryState = 'loading' | 'ready' | 'signed_out' | 'offline' | 'invalid';
type Snapshot = Readonly<{ remote: readonly import('../api/my-reports').MyReportSummary[]; rows: readonly ReportTimelineItem[]; nextCursor: MyReportsCursor | null }>;

function isInvalidResponse(error: unknown): boolean { return error instanceof Error && error.message === 'invalid_my_reports_response'; }

export function MyReportsScreen({ dependencies, locale }: Readonly<{ dependencies: MyReportsDependencies; locale: Locale }>) {
  const copy = getReportCopy(locale);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const requestRef = useRef(0);
  const ownerSubjectRef = useRef<string | null>(null);
  const [state, setState] = useState<HistoryState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const saveSnapshot = useCallback((next: Snapshot) => { snapshotRef.current = next; setSnapshot(next); }, []);
  const expireSession = useCallback(() => {
    requestRef.current += 1;
    snapshotRef.current = null;
    ownerSubjectRef.current = null;
    setSnapshot(null);
    setState('signed_out');
    dependencies.navigate('/profile');
  }, [dependencies]);
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'more') => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const prior = snapshotRef.current;
    if (mode === 'more' && (!prior || !prior.nextCursor)) return;
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more') setLoadingMore(true);
    if (mode === 'initial') setState('loading');
    try {
      const ownerSubject = await dependencies.getSessionSubject();
      if (!ownerSubject) {
        expireSession();
        return;
      }
      if (ownerSubjectRef.current !== null && ownerSubjectRef.current !== ownerSubject) {
        expireSession();
        return;
      }
      ownerSubjectRef.current = ownerSubject;
      const page = await dependencies.listReports({ cursor: mode === 'more' ? prior!.nextCursor : null });
      if (await dependencies.getSessionSubject() !== ownerSubject) {
        expireSession();
        return;
      }
      const drafts = await dependencies.loadDrafts().catch(() => [] as readonly StoredDraft[]);
      if (await dependencies.getSessionSubject() !== ownerSubject) {
        expireSession();
        return;
      }
      if (requestRef.current !== requestId) return;
      const remote = mode === 'more' && prior
        ? [...prior.remote, ...page.items]
        : page.items;
      saveSnapshot({ remote, rows: mergeReportRecovery(remote, drafts.filter((draft) => draft.ownerSubject === ownerSubject)), nextCursor: page.nextCursor });
      setState('ready');
    } catch (error) {
      const liveSubject = await dependencies.getSessionSubject().catch(() => null);
      if (!liveSubject || liveSubject !== ownerSubjectRef.current) {
        expireSession();
        return;
      }
      if (requestRef.current !== requestId) return;
      if (snapshotRef.current) setState('offline');
      else setState(isInvalidResponse(error) ? 'invalid' : 'offline');
    } finally {
      setRefreshing(false); setLoadingMore(false);
    }
  }, [dependencies, expireSession, saveSnapshot]);

  useEffect(() => { void load('initial'); }, [load]);
  useEffect(() => dependencies.subscribeToAuthChanges((subject) => {
    requestRef.current += 1;
    snapshotRef.current = null;
    ownerSubjectRef.current = subject;
    setSnapshot(null);
    if (!subject) {
      setState('signed_out');
      dependencies.navigate('/profile');
      return;
    }
    setState('loading');
    void load('initial');
  }), [dependencies, load]);
  const rows = snapshot?.rows ?? [];
  const refresh = () => { void load('refresh'); };

  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.leaf} />}>
      <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{copy.historyTitle}</Text><Text style={styles.subtitle}>{copy.historySubtitle}</Text></View>
      <Pressable accessibilityLabel={copy.refreshReports} accessibilityRole="button" onPress={refresh} style={({ pressed }) => [styles.refreshAction, pressed && styles.pressed]}><Text style={styles.refreshText}>{copy.refreshReports}</Text></Pressable>
      {state === 'loading' ? <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.leaf} /><Text style={styles.notice}>{copy.historyLoading}</Text></View> : null}
      {state === 'signed_out' ? <View style={styles.state}><Text accessibilityLiveRegion="polite" style={styles.notice}>{copy.historySignIn}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.profileAction} onPress={() => dependencies.navigate('/profile')} style={styles.profileAction}><Text style={styles.profileText}>{copy.profileAction}</Text></Pressable></View> : null}
      {state === 'invalid' ? <Text accessibilityLiveRegion="polite" style={styles.error}>{copy.invalidHistory}</Text> : null}
      {state === 'offline' && !snapshot ? <Text accessibilityLiveRegion="polite" style={styles.error}>{copy.offlineEmpty}</Text> : null}
      {state === 'offline' && snapshot ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{copy.offlineSnapshot}</Text> : null}
      {(state === 'ready' || (state === 'offline' && snapshot)) && rows.length === 0 ? <View style={styles.state}><Text accessibilityRole="header" style={styles.emptyTitle}>{copy.historyEmptyTitle}</Text><Text style={styles.notice}>{copy.historyEmptyCopy}</Text></View> : null}
      {rows.map((row) => <View key={row.key} style={styles.row}><Text style={styles.date}>{new Date(row.occurredAt).toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-SG', { year: 'numeric', month: 'short', day: 'numeric' })}</Text><Text style={styles.label}>{copy.reportStateLabel(row.reportState)}</Text><Text style={styles.notice}>{copy.mediaStateLabel(row.mediaState)}</Text><Text style={styles.notice}>{copy.identityStateLabel(row.identityState)}</Text></View>)}
      {snapshot?.nextCursor ? <Pressable accessibilityRole="button" accessibilityLabel={copy.loadMoreReports} disabled={loadingMore} onPress={() => { void load('more'); }} style={({ pressed }) => [styles.loadMore, (pressed || loadingMore) && styles.pressed]}><Text style={styles.loadMoreText}>{loadingMore ? copy.historyLoading : copy.loadMoreReports}</Text></Pressable> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas }, content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 120, gap: 14 }, heading: { gap: 6 }, title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 }, refreshAction: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 10 }, refreshText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '800' }, loading: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }, notice: { color: colors.muted, fontSize: 15, lineHeight: 22 }, error: { color: colors.danger, fontSize: 15, lineHeight: 22, fontWeight: '700' }, state: { gap: 9, paddingVertical: 12 }, emptyTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' }, profileAction: { minHeight: 48, borderWidth: 1, borderColor: colors.actionPrimary, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center' }, profileText: { color: colors.actionPrimary, fontSize: 16, fontWeight: '800' }, row: { gap: 3, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.line }, date: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' }, label: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' }, loadMore: { minHeight: 48, borderRadius: radii.small, borderWidth: 1, borderColor: colors.actionPrimary, alignItems: 'center', justifyContent: 'center' }, loadMoreText: { color: colors.actionPrimary, fontSize: 16, fontWeight: '800' }, pressed: { opacity: 0.76 },
});
