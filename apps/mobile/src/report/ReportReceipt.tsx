import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MyReportSummary } from '../api/my-reports';
import type { PublicCatSummary } from '../api/cats';
import type { MyIdentityResult } from '../api/identity-result';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radii } from '../design/theme';
import type { Locale } from '../i18n/catalog';
import type { StoredDraft } from '../offline/draft-policy';
import { mergeReceiptStatus, type ReportReceiptStatus } from './report-flow';
import { getReportCopy } from './report-copy';
import { isOpaqueReportId } from './ReportRouteShell';
import { IdentityContinuation } from './IdentityContinuation';
import type { PublicSightingPage } from '../api/feed';
import type { ReportIdentityIntent } from './report-draft';

export type ReportReceiptDependencies = Readonly<{
  getSessionSubject(): Promise<string | null>;
  subscribeToAuthChanges(listener: (subject: string | null) => void): () => void;
  getSummary(sightingId: string): Promise<MyReportSummary | null>;
  getIdentityResult?(sightingId: string): Promise<MyIdentityResult | null>;
  getPublicCatSummary?(animalId: string): Promise<PublicCatSummary | null>;
  loadDrafts(): Promise<readonly StoredDraft[]>;
  deleteReceiptAnchor(draftId: string, ownerSubject: string): Promise<void>;
  clearIdentityContinuation?(draftId: string, sightingId: string, ownerSubject: string, requestId: string): Promise<boolean>;
  listPublicSightings(input: Readonly<{ cursor?: string | null; limit?: number }>): Promise<PublicSightingPage>;
  saveIdentityIntent(draft: StoredDraft | null, sightingId: string, ownerSubject: string, intent: Exclude<ReportIdentityIntent, null>): Promise<Readonly<{ intent: Exclude<ReportIdentityIntent, null>; requestId: string }>>;
  submitIdentityProposal(sightingId: string, intent: Exclude<ReportIdentityIntent, null>, requestId: string): Promise<Readonly<{ status: string }>>;
  navigate(path: string): void;
}>;

type ReceiptState = Readonly<{ status: ReportReceiptStatus | null; source: 'remote' | 'unavailable' | 'local_recovery' | 'local_commit'; submittedAt: string | null }>;
type RemoteLookup = Readonly<{ kind: 'found'; report: MyReportSummary }> | Readonly<{ kind: 'not_found' }>;

async function findRemoteReport(sightingId: string, getSummary: ReportReceiptDependencies['getSummary']): Promise<RemoteLookup> {
  const report = await getSummary(sightingId);
  return report ? { kind: 'found', report } : { kind: 'not_found' };
}

function localDraftForSighting(drafts: readonly StoredDraft[], sightingId: string, ownerSubject: string | null): StoredDraft | null {
  if (!ownerSubject) return null;
  return drafts.find((draft) => draft.sightingId === sightingId && draft.ownerSubject === ownerSubject) ?? null;
}

export function ReportReceipt({ sightingId, dependencies, locale }: Readonly<{
  sightingId: string | string[] | undefined;
  dependencies: ReportReceiptDependencies;
  locale: Locale;
}>) {
  const copy = getReportCopy(locale);
  const validSightingId = isOpaqueReportId(sightingId);
  const [showDetails,setShowDetails]=useState(false);
  const [state, setState] = useState<ReceiptState | null>(null);
  const [continuationDraft, setContinuationDraft] = useState<StoredDraft | null>(null);
  const [ownerSubject, setOwnerSubject] = useState<string | null>(null);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [identityResult, setIdentityResult] = useState<MyIdentityResult | null>(null);

  const lifetime = useRef(0);
  const retryInFlight = useRef(false);
  const openInFlight = useRef(false);
  const [profileError, setProfileError] = useState(false);
  const [retryError, setRetryError] = useState(false);
  useEffect(() => {
    lifetime.current += 1;
    return () => { lifetime.current += 1; };
  }, [dependencies, sightingId]);

  useEffect(() => dependencies.subscribeToAuthChanges(() => {
    lifetime.current += 1;
    retryInFlight.current = false;
    openInFlight.current = false;
    setProfileError(false);
    setRetryError(false);
    setState(null);
    setContinuationDraft(null);
    setOwnerSubject(null);
    setIdentityResult(null);
    setAuthEpoch((epoch) => epoch + 1);
  }), [dependencies]);

  useEffect(() => {
    if (!validSightingId) return;
    let mounted = true;
    void (async () => {
      const ownerSubject = await dependencies.getSessionSubject().catch(() => null);
      if (mounted) setOwnerSubject(ownerSubject);
      const drafts = await dependencies.loadDrafts().catch(() => [] as readonly StoredDraft[]);
      const local = localDraftForSighting(drafts, sightingId, ownerSubject);
      if (mounted) setContinuationDraft(local);
      try {
        const remote = await findRemoteReport(sightingId, dependencies.getSummary);
        if (await dependencies.getSessionSubject().catch(() => null) !== ownerSubject) {
          if (mounted) setState({ status: null, source: 'unavailable', submittedAt: null });
          return;
        }
        if (!mounted) return;
        if (remote.kind === 'found') {
          const result = dependencies.getIdentityResult ? await dependencies.getIdentityResult(sightingId).catch(() => null) : null;
          if (await dependencies.getSessionSubject().catch(() => null) !== ownerSubject || !mounted) return;
          setIdentityResult(result);
          setState({ status: mergeReceiptStatus(remote.report, local), source: 'remote', submittedAt: remote.report.createdAt });
          if (local?.textReceiptCommittedAt && !local.identityContinuation && ownerSubject && remote.report.identityState !== 'not_requested') {
            void dependencies.deleteReceiptAnchor(local.id, ownerSubject).catch(() => undefined);
          }
          return;
        }
        const recovery = mergeReceiptStatus(null, local);
        if (recovery?.reportState === 'submitted' && local?.textReceiptCommittedAt) {
          setState({ status: recovery, source: 'local_commit', submittedAt: local.textReceiptCommittedAt });
        } else {
          setState({ status: recovery?.mediaState === 'needs_user' ? recovery : null, source: 'local_recovery', submittedAt: null });
        }
      } catch {
        if (await dependencies.getSessionSubject().catch(() => null) !== ownerSubject) {
          if (mounted) setState({ status: null, source: 'unavailable', submittedAt: null });
          return;
        }
        const recovery = mergeReceiptStatus(null, local);
        const status = recovery?.reportState === 'submitted' && !local?.textReceiptCommittedAt ? null : recovery;
        if (mounted) setState({
          status,
          source: 'unavailable',
          submittedAt: status?.reportState === 'submitted' ? local?.textReceiptCommittedAt ?? null : null,
        });
      }
    })();
    return () => { mounted = false; };
  }, [authEpoch, dependencies, sightingId, validSightingId]);

  if (!validSightingId) {
    return <ScreenScaffold subtitle={copy.invalidReceiptId} title={copy.receiptTitle}>
      <View style={styles.section}><Text accessibilityRole="header" style={styles.stateTitle}>{copy.routeUnavailableTitle}</Text><Text style={styles.notice}>{copy.receiptUnavailable}</Text><ReceiptActions copy={copy} navigate={dependencies.navigate} /></View>
    </ScreenScaffold>;
  }

  const openProfile = async () => {
    const animalId = identityResult?.status === 'confirmed' ? identityResult.animalId : null;
    if (!animalId || !ownerSubject || !dependencies.getPublicCatSummary || openInFlight.current) return;
    const token = lifetime.current;
    const currentOwner = async () => token === lifetime.current && (await dependencies.getSessionSubject().catch(() => null)) === ownerSubject && token === lifetime.current;
    openInFlight.current = true;
    setProfileError(false);
    try {
      if (!await currentOwner()) return;
      const profile = await dependencies.getPublicCatSummary(animalId);
      if (!await currentOwner()) return;
      if (!profile || profile.animalId !== animalId) { setProfileError(true); return; }
      dependencies.navigate(`/cat/${animalId}`);
    } catch { if (await currentOwner()) setProfileError(true); }
    finally { if (token === lifetime.current) openInFlight.current = false; }
  };

  const retryRejected = async () => {
    if (!ownerSubject || identityResult?.status !== 'rejected' || !dependencies.getIdentityResult || retryInFlight.current) return;
    const token = lifetime.current;
    const currentOwner = async () => token === lifetime.current && (await dependencies.getSessionSubject().catch(() => null)) === ownerSubject && token === lifetime.current;
    retryInFlight.current = true;
    setRetryError(false);
    try {
      if (!await currentOwner()) return;
      const latest = await dependencies.getIdentityResult(sightingId);
      if (!await currentOwner()) return;
      if (!latest || latest.status !== 'rejected' || latest.proposalId !== identityResult.proposalId) {
        setIdentityResult(latest);
        setState((current) => current?.status ? { ...current, status: { ...current.status,
          identityState: latest?.status === 'tentative' ? 'pending_review' : latest?.animalId ? 'linked' : 'closed',
        } } : current);
        return;
      }
      const drafts = await dependencies.loadDrafts();
      if (!await currentOwner()) return;
      const local = localDraftForSighting(drafts, sightingId, ownerSubject);
      let retained = local;
      if (local?.identityContinuation && latest.requestId === local.identityContinuation.requestId) {
        if (!dependencies.clearIdentityContinuation || !await currentOwner()) return;
        const cleared = await dependencies.clearIdentityContinuation(local.id, sightingId, ownerSubject, latest.requestId);
        if (!await currentOwner()) return;
        if (!cleared) { setRetryError(true); return; }
        retained = null;
      }
      // A different local request is a newer attempt, not the rejected one.
      // A remote-only receipt can use the existing minimal-anchor save path.
      setContinuationDraft(retained);
      setIdentityResult(null);
      setState((current) => current?.status ? { ...current, status: { ...current.status,
        identityState: retained?.identityContinuation ? 'pending_submission' : 'not_requested',
      } } : current);
    } catch {
      if (await currentOwner()) setRetryError(true);
    } finally {
      if (token === lifetime.current) retryInFlight.current = false;
    }
  };

  return <ScreenScaffold compact title={copy.receiptTitle} header={<View/>}>
    {state === null ? <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.leaf} /><Text style={styles.notice}>{copy.receiptLoading}</Text></View> : null}
    {state !== null && state.status === null ? <View style={styles.section}><Text accessibilityRole="header" style={styles.stateTitle}>{copy.routeUnavailableTitle}</Text><Text accessibilityLiveRegion="polite" style={styles.notice}>{state.source === 'unavailable' ? copy.receiptRemoteUnavailable : copy.receiptUnavailable}</Text><ReceiptActions copy={copy} navigate={dependencies.navigate} /></View> : null}
    {state?.status ? <View style={styles.section} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={styles.stateTitle}>{state.source === 'local_recovery' ? copy.receiptLocalRecoveryTitle : copy.receiptReceived}</Text>
      {state.source === 'unavailable' ? <Text style={styles.notice}>{copy.receiptRemoteUnavailable}</Text> : null}
      {state.source === 'local_recovery' ? <Text style={styles.notice}>{copy.receiptLocalRecovery}</Text> : null}
      {retryError ? <Text accessibilityRole="alert" style={styles.notice}>{locale === 'zh-CN' ? '暂时无法继续，请重试。报告和已保存的选择仍保留。' : 'Could not continue. Retry; your report and saved choice are preserved.'}</Text> : null}
      <View style={styles.statusList}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale==='zh-CN'?'报告详情':'Report details'} accessibilityState={{expanded:showDetails}} onPress={()=>setShowDetails(value=>!value)} style={{minHeight:44,justifyContent:'center'}}><Text style={{fontSize:13,color:colors.actionPrimary}}>{locale==='zh-CN'?(showDetails?'收起详情':'报告详情'):(showDetails?'Hide details':'Report details')}</Text></Pressable>
        {showDetails?<View style={{gap:4}}>
        <Text style={styles.notice}>{copy.receiptReference(sightingId)}</Text>
        {state.submittedAt ? <Text style={styles.notice}>{copy.receiptSubmittedAt(new Date(state.submittedAt).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-SG'))}</Text> : null}
</View>:null}
        <Text style={styles.status}>{copy.reportStateLabel(state.status.reportState)}</Text>
        <Text style={styles.status}>{copy.mediaStateLabel(state.status.mediaState)}</Text>
        <Text style={styles.status}>{copy.identityStateLabel(state.status.identityState)}</Text>
        {identityResult?.status === 'confirmed' ? <Text style={styles.notice}>{locale === 'zh-CN' ? '身份已由独立审核确认。' : 'Identity confirmed by independent review.'}</Text> : null}
        {identityResult?.status === 'confirmed' && identityResult.animalId && dependencies.getPublicCatSummary ? <Pressable
          accessibilityRole="button" accessibilityLabel={locale === 'zh-CN' ? '打开猫档案' : 'Open cat profile'}
          onPress={() => { void openProfile(); }} style={styles.secondaryAction}
        ><Text style={styles.secondaryActionText}>{locale === 'zh-CN' ? '打开猫档案' : 'Open cat profile'}</Text></Pressable> : null}
        {profileError ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{locale === 'zh-CN' ? '档案当前不可用，请稍后重试。报告仍会保留。' : 'The profile is currently unavailable. Try again later. Your report remains saved.'}</Text> : null}
        {identityResult?.decision === 'needs_more_evidence' ? <Text style={styles.notice}>{locale === 'zh-CN' ? '审核需要更多证据。报告仍会保留。' : 'The reviewer needs more evidence. Your report remains saved.'}</Text> : null}
        {identityResult?.status === 'rejected' ? <><Text style={styles.notice}>{locale === 'zh-CN' ? '身份提案未获确认。你可为同一报告选择新的身份。' : 'This identity proposal was not confirmed. You can choose another identity for this report.'}</Text><Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh-CN' ? '重新选择身份' : 'Choose another identity'} onPress={() => { void retryRejected(); }} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{locale === 'zh-CN' ? '重新选择身份' : 'Choose another identity'}</Text></Pressable></> : null}
      </View>
      {(state.status.identityState === 'not_requested' || state.status.identityState === 'pending_submission') && ownerSubject ? <IdentityContinuation
        key={`${sightingId}:${ownerSubject}:${authEpoch}`}
        sightingId={sightingId} draft={continuationDraft} locale={locale}
        onSkip={() => dependencies.navigate('/report/my-reports')}
        onResolved={(status) => setState((current) => current?.status ? {
          ...current, status: { ...current.status, identityState: status === 'tentative' ? 'pending_review' : 'closed' },
        } : current)}
        dependencies={{
          listPublicSightings: dependencies.listPublicSightings,
          isOwner: async () => (await dependencies.getSessionSubject().catch(() => null)) === ownerSubject,
          saveIntent: (intent) => dependencies.saveIdentityIntent(continuationDraft, sightingId, ownerSubject, intent),
          submit: dependencies.submitIdentityProposal,
        }}
      /> : null}
      <ReceiptActions copy={copy} navigate={dependencies.navigate} />
    </View> : null}
  </ScreenScaffold>;
}

function ReceiptActions({ copy, navigate }: Readonly<{ copy: ReturnType<typeof getReportCopy>; navigate(path: string): void }>) {
  return <View style={styles.actions}>
    <Pressable accessibilityLabel={copy.viewReportsAction} accessibilityRole="button" onPress={() => navigate('/report/my-reports')} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}><Text style={styles.primaryActionText}>{copy.viewReportsAction}</Text></Pressable>
    <View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Pressable accessibilityLabel={copy.backToReportAction} accessibilityRole="button" onPress={() => navigate('/report')} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}><Text style={styles.secondaryActionText}>{copy.backToReportAction}</Text></Pressable></View><View style={{flex:1}}>
    <Pressable accessibilityLabel={copy.browseNearbyAction} accessibilityRole="button" onPress={() => navigate('/')} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}><Text style={styles.secondaryActionText}>{copy.browseNearbyAction}</Text></Pressable></View></View>
  </View>;
}

const styles = StyleSheet.create({
  loading: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: { gap: 12 },
  stateTitle: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: '800' },
  notice: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  statusList: { gap: 8, paddingVertical: 4 },
  status: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  actions: { gap: 8, marginTop: 4 },
  primaryAction: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.leaf },
  primaryActionText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  secondaryAction: { minHeight: 48, paddingHorizontal: 16, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.actionPrimary },
  secondaryActionText: { color: colors.actionPrimary, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.76 },
});
