import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import type { StoredDraft } from '../offline/draft-policy';
import { createReportDraftPayload, reportDraftSummary, type ReportDraftStep } from './report-draft';
import { getReportCopy } from './report-copy';
import { isOpaqueReportId } from './ReportRouteShell';

export type ReportHubDependencies = Readonly<{
  loadDrafts(): Promise<readonly StoredDraft[]>;
  saveDraft(input: Record<string, unknown>): Promise<StoredDraft>;
  deleteDraft(id: string, expectedOwnerSubject: string | null): Promise<void>;
  getSessionSubject(): Promise<string | null>;
  claimDraftOwner(id: string, ownerSubject: string): Promise<boolean>;
  createId(): string;
  now(): Date;
  navigate(path: string): void;
}>;

type DraftSummary = NonNullable<ReturnType<typeof reportDraftSummary>> & Readonly<{ claimRequired: boolean; ownerSubject: string | null }>;
type DraftStatus = 'loading' | 'ready' | 'storage_unavailable' | 'error';

function isStorageUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === 'secure_offline_storage_unavailable';
}

function isDraftStep(value: string): value is ReportDraftStep {
  return value === 'photo' || value === 'details' || value === 'safety' || value === 'area' || value === 'review';
}

function summarizeDrafts(drafts: readonly StoredDraft[], ownerSubject: string | null): readonly DraftSummary[] {
  return drafts
    .filter((draft) => !draft.sightingId && (draft.ownerSubject === undefined || draft.ownerSubject === ownerSubject))
    .map((draft) => {
      const summary = reportDraftSummary(draft);
      return summary ? { ...summary, claimRequired: ownerSubject !== null && draft.ownerSubject === undefined, ownerSubject: draft.ownerSubject ?? null } : null;
    })
    .filter((summary): summary is DraftSummary => summary !== null && isOpaqueReportId(summary.id) && isDraftStep(summary.step))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function ReportHub({ dependencies, locale }: Readonly<{ dependencies: ReportHubDependencies; locale: Locale }>) {
  const copy = getReportCopy(locale);
  const [drafts, setDrafts] = useState<readonly DraftSummary[]>([]);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('loading');
  const [signedIn, setSignedIn] = useState(false);
  const [ownerSubject, setOwnerSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const reload = useCallback(async () => {
    setDraftStatus('loading');
    setMessage(null);
    try {
      const subject = await dependencies.getSessionSubject().catch(() => null);
      const loaded = await dependencies.loadDrafts();
      const verifiedSubject = await dependencies.getSessionSubject().catch(() => null);
      if (verifiedSubject !== subject) {
        setOwnerSubject(verifiedSubject);
        setSignedIn(verifiedSubject !== null);
        setDrafts([]);
      } else {
        setOwnerSubject(subject);
        setSignedIn(subject !== null);
        setDrafts(summarizeDrafts(loaded, subject));
      }
      setDraftStatus('ready');
    } catch (error) {
      setDraftStatus(isStorageUnavailable(error) ? 'storage_unavailable' : 'error');
    }
  }, [dependencies]);

  useEffect(() => { void reload(); }, [reload]);

  async function startReport() {
    setStarting(true);
    setMessage(null);
    const id = dependencies.createId();
    if (!isOpaqueReportId(id)) {
      setStarting(false);
      setMessage(copy.startFailed);
      return;
    }
    try {
      const subject = await dependencies.getSessionSubject().catch(() => null);
      await dependencies.saveDraft({ id, notes: '', risk: 'normal', ...(subject ? { ownerSubject: subject } : {}), report: createReportDraftPayload(dependencies.now()) });
      dependencies.navigate(`/report/new?draftId=${encodeURIComponent(id)}`);
    } catch {
      setMessage(copy.startFailed);
    } finally {
      setStarting(false);
    }
  }

  async function continueDraft(id: string, claimRequired: boolean) {
    if (!isOpaqueReportId(id)) return;
    if (claimRequired) {
      if (!ownerSubject || !await dependencies.claimDraftOwner(id, ownerSubject)) {
        setMessage(copy.startFailed);
        return;
      }
    }
    dependencies.navigate(`/report/new?draftId=${encodeURIComponent(id)}`);
  }

  async function deleteDraft(id: string, expectedOwnerSubject: string | null) {
    setMessage(null);
    try {
      const liveSubject = await dependencies.getSessionSubject().catch(() => null);
      if (liveSubject !== expectedOwnerSubject) throw new Error('auth_ownership');
      await dependencies.deleteDraft(id, expectedOwnerSubject);
      await reload();
    } catch {
      setMessage(copy.deleteFailed);
    }
  }

  async function openMyReports() {
    try {
      if (await dependencies.getSessionSubject()) {
        setSignedIn(true);
        dependencies.navigate('/report/my-reports');
        return;
      }
    } catch {
      setSignedIn(false);
    }
    setSignedIn(false);
    setMessage(copy.signedOutExplanation);
  }

  return (
    <ScreenScaffold subtitle={copy.subtitle} title={copy.title}>
      <Pressable accessibilityLabel={copy.startAction} accessibilityRole="button" disabled={starting || draftStatus === 'storage_unavailable'} onPress={startReport} style={({ pressed }) => [styles.primaryAction, (pressed || starting) && styles.pressed, (starting || draftStatus === 'storage_unavailable') && styles.disabled]}>
        <MaterialCommunityIcons color={colors.surface} name="camera-plus-outline" size={20} />
        <Text style={styles.primaryActionText}>{starting ? copy.loading : copy.startAction}</Text>
      </Pressable>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{copy.draftsTitle}</Text>
        {draftStatus === 'loading' ? <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.leaf} /><Text style={styles.muted}>{copy.loading}</Text></View> : null}
        {draftStatus === 'storage_unavailable' ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{copy.storageUnavailable}</Text> : null}
        {draftStatus === 'error' ? <View style={styles.statusRow}><Text accessibilityLiveRegion="polite" style={styles.notice}>{copy.loadFailed}</Text><Pressable accessibilityRole="button" onPress={() => { void reload(); }} style={styles.textAction}><Text style={styles.textActionLabel}>{copy.retryAction}</Text></Pressable></View> : null}
        {draftStatus === 'ready' && drafts.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons color={colors.aquaDeep} name="file-document-outline" size={22} /><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>{copy.emptyTitle}</Text><Text style={styles.muted}>{copy.emptyCopy}</Text></View></View> : null}
        {draftStatus === 'ready' ? drafts.map((draft) => (
          <View key={draft.id} style={styles.draftRow}>
            <Pressable accessibilityLabel={draft.claimRequired ? copy.claimContinueDraftLabel(draft.step) : copy.continueDraftLabel(draft.step)} accessibilityRole="button" onPress={() => { void continueDraft(draft.id, draft.claimRequired); }} style={({ pressed }) => [styles.draftMain, pressed && styles.pressed]}>
              <MaterialCommunityIcons color={colors.community} name={draft.hasReviewedMedia ? 'image-check-outline' : 'file-edit-outline'} size={21} />
              <View style={styles.draftCopy}><Text style={styles.draftTitle}>{copy.draftShellTitle}</Text><Text style={styles.muted}>{copy.stepLabel(draft.step)}</Text></View>
              <MaterialCommunityIcons color={colors.actionPrimary} name="chevron-right" size={22} />
            </Pressable>
            <Pressable accessibilityLabel={copy.deleteDraftLabel(draft.step)} accessibilityRole="button" onPress={() => { void deleteDraft(draft.id, draft.ownerSubject); }} style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}><Text style={styles.deleteActionText}>{copy.deleteAction}</Text></Pressable>
          </View>
        )) : null}
      </View>

      <View style={styles.section}>
        <Pressable accessibilityLabel={copy.myReports} accessibilityRole="button" onPress={() => { void openMyReports(); }} style={({ pressed }) => [styles.reportsAction, pressed && styles.pressed]}>
          <View style={styles.reportsCopy}><Text style={styles.draftTitle}>{copy.myReports}</Text><Text style={styles.muted}>{signedIn ? '' : copy.signedOutExplanation}</Text></View>
          <MaterialCommunityIcons color={colors.actionPrimary} name="chevron-right" size={22} />
        </Pressable>
        {message === copy.signedOutExplanation ? <Pressable accessibilityRole="button" onPress={() => dependencies.navigate('/profile')} style={styles.profileAction}><Text style={styles.profileActionText}>{copy.profileAction}</Text></Pressable> : null}
      </View>
      {message && message !== copy.signedOutExplanation ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  primaryAction: { minHeight: 52, paddingHorizontal: 18, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.leaf },
  primaryActionText: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  section: { gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  loading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  notice: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  statusRow: { gap: 8 },
  textAction: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  textActionLabel: { color: colors.actionPrimary, fontSize: 14, fontWeight: '800' },
  empty: { minHeight: 64, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  emptyCopy: { flex: 1, gap: 2 },
  emptyTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  draftRow: { borderBottomWidth: 1, borderColor: colors.line },
  draftMain: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  draftCopy: { flex: 1, gap: 1 },
  draftTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  deleteAction: { alignSelf: 'flex-start', minHeight: 48, paddingRight: 12, justifyContent: 'center' },
  deleteActionText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  reportsAction: { minHeight: 54, paddingHorizontal: 14, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.paper },
  reportsCopy: { flex: 1, gap: 1 },
  profileAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.small, borderWidth: 1, borderColor: colors.actionPrimary },
  profileActionText: { color: colors.actionPrimary, fontSize: 15, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.5 },
});
